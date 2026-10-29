"""VR headset transport owned by Vulcan Studio, not by LeRobot."""

from __future__ import annotations

import time
import uuid
from collections import deque
from dataclasses import dataclass
from functools import cached_property

import cv2
import numpy as np
import zmq

if __package__:
    from . import vulcan_vr_pb2
else:
    import vulcan_vr_pb2


@dataclass(frozen=True)
class VRHeadsetConfig:
    command_port: int = 5557
    observation_port: int = 5561
    stale_timeout_s: float = 0.5
    capture_recovery_timeout_s: float = 2.0


class VRHeadset:
    """Translate the desktop/headset protocol into ordinary LeRobot actions."""

    timing_gap_s = 0.35

    def __init__(self, config: VRHeadsetConfig | None = None):
        self.config = config or VRHeadsetConfig()
        self._context = None
        self._commands = None
        self._observations = None
        self._latest = None
        self._last_observation = None
        self._last_packet_at = 0.0
        self._last_poll_at = 0.0
        self._start_counter = 0
        self._stop_counter = 0
        self._rerecord_counter = 0
        self._session_id = uuid.uuid4().hex
        self._announcement_counter = 0
        self._announcement = ""
        self._announcements = deque(maxlen=64)
        self.recording_phase = "idle"
        self._previous_start = False
        self._previous_stop = False
        self._previous_rerecord = False
        self._holding_stale_action = False
        self.start_requested = False
        self.stop_requested = False
        self.disconnect_requested = False
        self.rerecord_requested = False

    @cached_property
    def action_features(self) -> dict[str, type]:
        joints = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
        return {f"{side}_{joint}.pos": float for side in ("left", "right") for joint in joints} | {
            "x.vel": float,
            "y.vel": float,
            "theta.vel": float,
            "z.pos": float,
        }

    @property
    def is_connected(self) -> bool:
        return self._commands is not None

    def connect(self) -> None:
        if self.is_connected:
            return
        self._context = zmq.Context.instance()
        self._commands = self._context.socket(zmq.PULL)
        self._commands.setsockopt(zmq.LINGER, 0)
        self._commands.bind(f"tcp://*:{self.config.command_port}")
        self._observations = self._context.socket(zmq.PUB)
        self._observations.setsockopt(zmq.LINGER, 0)
        self._observations.bind(f"tcp://*:{self.config.observation_port}")
        print(
            f"VR headset receiver ready on ports {self.config.command_port}/{self.config.observation_port}",
            flush=True,
        )

    def disconnect(self) -> None:
        if self._commands is not None:
            self._commands.close()
            self._commands = None
        if self._observations is not None:
            self._observations.close()
            self._observations = None

    def poll(self, *, allow_start: bool = True) -> bool:
        if not self.is_connected:
            return False
        polled_at = time.monotonic()
        poll_gap_s = polled_at - self._last_poll_at if self._last_poll_at else 0.0
        if poll_gap_s >= self.timing_gap_s:
            print(f"VR timing: desktop poll gap {poll_gap_s * 1000:.0f} ms", flush=True)
        self._last_poll_at = polled_at
        received = False
        while True:
            try:
                packet = self._commands.recv(flags=zmq.NOBLOCK)
            except zmq.Again:
                break
            action = vulcan_vr_pb2.HeadsetAction()
            action.ParseFromString(packet)
            self._latest = action
            received_at = time.monotonic()
            receive_gap_s = received_at - self._last_packet_at if self._last_packet_at else 0.0
            if receive_gap_s >= self.timing_gap_s:
                print(
                    f"VR timing: command receive gap {receive_gap_s * 1000:.0f} ms "
                    f"(desktop poll gap {poll_gap_s * 1000:.0f} ms)",
                    flush=True,
                )
            self._last_packet_at = received_at
            received = True
            if action.request_recording_start and not self._previous_start and allow_start:
                self.start_requested = True
                print("VR headset requested recording start", flush=True)
            if action.request_recording_stop and not self._previous_stop:
                self.stop_requested = True
                self._stop_counter += 1
                print("VR headset requested episode stop", flush=True)
            if action.request_recording_rerecord and not self._previous_rerecord:
                self.rerecord_requested = True
                self._rerecord_counter += 1
                print("VR headset requested episode rerecord", flush=True)
            self._previous_start = action.request_recording_start
            self._previous_stop = action.request_recording_stop
            self._previous_rerecord = action.request_recording_rerecord
        return received

    def has_fresh_action(self) -> bool:
        return self._latest is not None and time.monotonic() - self._last_packet_at <= self.config.stale_timeout_s

    def require_next_action(self) -> None:
        self.start_requested = False
        self._last_packet_at = 0.0

    def mark_recording_started(self, observation: dict) -> None:
        self._start_counter += 1
        self._last_observation = observation
        self.recording_phase = "recording"

    def desktop_stop(self) -> None:
        if not self.stop_requested:
            self._stop_counter += 1
        self.disconnect_requested = True

    def desktop_stop_capture(self) -> None:
        if not self.stop_requested:
            self._stop_counter += 1
        self.stop_requested = True

    def announce(self, message: str) -> None:
        self._announcement_counter += 1
        self._announcement = message
        self._announcements.append((self._announcement_counter, message))
        if self._last_observation is not None:
            self.publish_observation(self._last_observation, include_cameras=False)

    def get_action(self) -> dict[str, float | bool]:
        self.poll()
        if not self.has_fresh_action():
            elapsed_s = time.monotonic() - self._last_packet_at
            if self._latest is None or elapsed_s > self.config.capture_recovery_timeout_s:
                raise TimeoutError(
                    f"VR headset commands stopped for more than {self.config.capture_recovery_timeout_s:g} seconds"
                )
            if not self._holding_stale_action:
                print("VR headset controls stale during capture; holding robot safely", flush=True)
                self._holding_stale_action = True
            return self.safe_stop_action(self._last_observation or {})
        if self._holding_stale_action:
            print("VR headset controls resumed during capture", flush=True)
            self._holding_stale_action = False
        action = self._latest
        result: dict[str, float | bool] = {}
        for side, joints in (("left", action.left_arm_target_joints), ("right", action.right_arm_target_joints)):
            for joint in ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"):
                result[f"{side}_{joint}.pos"] = float(getattr(joints, joint))
        result["x.vel"] = float(action.base_target_velocity.x_vel)
        result["y.vel"] = float(action.base_target_velocity.y_vel)
        result["theta.vel"] = float(action.base_target_velocity.theta_vel)
        result["z.pos"] = float(action.base_target_position.z_pos)
        result["untorque_left"] = bool(action.untorque_left)
        result["untorque_right"] = bool(action.untorque_right)
        return result

    def safe_stop_action(self, observation: dict) -> dict[str, float]:
        return {
            **{key: float(observation.get(key, 0.0)) for key in self.action_features if key.endswith(".pos")},
            "x.vel": 0.0,
            "y.vel": 0.0,
            "theta.vel": 0.0,
        }

    def publish_observation(self, observation: dict, *, include_cameras: bool = True) -> None:
        self._last_observation = observation
        if self._observations is None or self._latest is None:
            return
        state = vulcan_vr_pb2.DesktopObservation()
        for side in ("left", "right"):
            joints = getattr(state, f"{side}_arm_joints")
            for joint in ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"):
                setattr(joints, joint, float(observation.get(f"{side}_{joint}.pos", 0.0)))
        state.base_velocity.x_vel = float(observation.get("x.vel", 0.0))
        state.base_velocity.y_vel = float(observation.get("y.vel", 0.0))
        state.base_velocity.theta_vel = float(observation.get("theta.vel", 0.0))
        state.base_position.z_pos = float(observation.get("z.pos", 0.0))
        if include_cameras:
            for name, value in observation.items():
                if isinstance(value, np.ndarray):
                    encoded, image = cv2.imencode(".jpg", value)
                    if encoded:
                        camera = state.cameras.add()
                        camera.name = name
                        camera.image_data = image.tobytes()
        state.recording_start_counter = self._start_counter
        state.recording_stop_counter = self._stop_counter
        state.recording_rerecord_counter = self._rerecord_counter
        state.recording_announcements_supported = True
        state.recording_announcement_counter = self._announcement_counter
        state.recording_announcement = self._announcement
        for sequence, text in self._announcements:
            state.recording_announcements.add(sequence=sequence, text=text)
        state.recording_session_id = self._session_id
        state.recording_phase = self.recording_phase
        self._observations.send(state.SerializeToString())
