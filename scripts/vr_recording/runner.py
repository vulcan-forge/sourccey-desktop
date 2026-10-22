"""Run VR teleoperation and recording without modifying the LeRobot checkout."""

from __future__ import annotations

import argparse
import logging
import os
import re
import shutil
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from lerobot.common.control_utils import connect_keyboard
from lerobot.configs.dataset import DatasetRecordConfig
from lerobot.datasets import (
    LeRobotDataset,
    VideoEncodingManager,
    aggregate_pipeline_dataset_features,
    create_initial_features,
    safe_stop_image_writer,
)
from lerobot.processor import make_default_processors
from lerobot.robots import RobotConfig, make_robot_from_config
from lerobot.teleoperators.keyboard.configuration_keyboard import KeyboardTeleopConfig
from lerobot.teleoperators.keyboard.teleop_keyboard import KeyboardTeleop
from lerobot.utils.constants import ACTION, OBS_STR
from lerobot.utils.feature_utils import build_dataset_frame, combine_feature_dicts
from lerobot.utils.import_utils import register_third_party_plugins
from lerobot.utils.robot_utils import precise_sleep
from lerobot.utils.utils import init_logging, log_say
from lerobot.utils.visualization_utils import init_rerun, log_rerun_data

if __package__:
    from .naming import format_record_repo_id
    from .teleoperator import VRHeadset
else:
    # Executing this file by absolute path adds its directory to sys.path.
    from naming import format_record_repo_id
    from teleoperator import VRHeadset


@dataclass
class SessionConfig:
    remote_ip: str
    robot_id: str
    keyboard_state_path: Path
    start_signal_path: Path
    stop_signal_path: Path
    task_path: Path
    ready_signal_path: Path
    dataset: DatasetRecordConfig
    display_data: bool = False
    play_sounds: bool = True


def _parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise argparse.ArgumentTypeError(f"Expected true or false, received {value!r}")


def _parse_args() -> SessionConfig:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--robot.remote_ip", dest="remote_ip", required=True)
    parser.add_argument("--robot.id", dest="robot_id", default="sourccey")
    parser.add_argument(
        "--teleop_keyboard.input_state_path",
        dest="keyboard_state_path",
        type=Path,
        required=True,
    )
    parser.add_argument("--vr_start_signal_path", type=Path, required=True)
    parser.add_argument("--vr_stop_signal_path", type=Path, required=True)
    parser.add_argument("--vr_task_path", type=Path, required=True)
    parser.add_argument("--vr_ready_signal_path", type=Path, required=True)
    parser.add_argument("--dataset.repo_id", dest="repo_id", required=True)
    parser.add_argument("--dataset.num_episodes", dest="num_episodes", type=int, required=True)
    parser.add_argument("--dataset.episode_time_s", dest="episode_time_s", type=float, required=True)
    parser.add_argument("--dataset.reset_time_s", dest="reset_time_s", type=float, required=True)
    parser.add_argument("--dataset.single_task", dest="single_task", required=True)
    parser.add_argument("--dataset.fps", dest="fps", type=int, default=30)
    parser.add_argument("--dataset.push_to_hub", dest="push_to_hub", type=_parse_bool, default=False)
    parser.add_argument("--display_data", type=_parse_bool, default=False)
    args = parser.parse_args()
    return SessionConfig(
        remote_ip=args.remote_ip,
        robot_id=args.robot_id,
        keyboard_state_path=args.keyboard_state_path,
        start_signal_path=args.vr_start_signal_path,
        stop_signal_path=args.vr_stop_signal_path,
        task_path=args.vr_task_path,
        ready_signal_path=args.vr_ready_signal_path,
        dataset=DatasetRecordConfig(
            repo_id=args.repo_id,
            single_task=args.single_task,
            fps=args.fps,
            episode_time_s=args.episode_time_s,
            reset_time_s=args.reset_time_s,
            num_episodes=args.num_episodes,
            push_to_hub=args.push_to_hub,
        ),
        display_data=args.display_data,
    )


def _stamped_repo_id(base_repo_id: str, task: str, capture_number: int) -> str:
    """Create the same timestamp/task names without changing DatasetRecordConfig."""
    from datetime import datetime

    base = base_repo_id if capture_number == 1 else f"{base_repo_id}-{capture_number}"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    if os.environ.get("SOURCCEY_RECORD_NAME_PATTERN", "").strip():
        return format_record_repo_id(
            base_repo_id, task, capture_number, timestamp, os.environ["SOURCCEY_RECORD_NAME_PATTERN"].strip()
        )
    ascii_task = unicodedata.normalize("NFKD", task).encode("ascii", "ignore").decode("ascii")
    task_slug = re.sub(r"[^a-z0-9]+", "-", ascii_task.lower()).strip("-")[:48].rstrip("-")
    return f"{base}_{timestamp}{f'_{task_slug}' if task_slug else ''}"


def _create_dataset(config: SessionConfig, robot, features: dict, capture_number: int) -> LeRobotDataset:
    repo_name = config.dataset.repo_id.split("/", 1)[-1]
    if repo_name.startswith("eval_"):
        raise ValueError(
            "Dataset names starting with 'eval_' are reserved for policy evaluation. "
            "Use a data-collection dataset name instead."
        )
    repo_id = _stamped_repo_id(config.dataset.repo_id, config.dataset.single_task, capture_number)
    return LeRobotDataset.create(
        repo_id,
        config.dataset.fps,
        root=config.dataset.root,
        robot_type=robot.name,
        features=features,
        use_videos=config.dataset.video,
        image_writer_processes=config.dataset.num_image_writer_processes,
        image_writer_threads=config.dataset.num_image_writer_threads_per_camera * len(robot.cameras),
        batch_encoding_size=config.dataset.video_encoding_batch_size,
        camera_encoder=config.dataset.camera_encoder,
        encoder_threads=config.dataset.encoder_threads,
        streaming_encoding=config.dataset.streaming_encoding,
        encoder_queue_maxsize=config.dataset.encoder_queue_maxsize,
    )


def _discard_current_episode(dataset: LeRobotDataset) -> None:
    """Discard a partial attempt, including video PNGs left by stock LeRobot."""
    episode_index = int(dataset.writer.episode_buffer.get("episode_index", dataset.num_episodes))
    dataset.clear_episode_buffer()
    for camera_key in dataset.meta.camera_keys:
        frame_dir = dataset.writer._get_image_file_dir(episode_index, camera_key)
        if frame_dir.is_dir():
            shutil.rmtree(frame_dir)


@safe_stop_image_writer
def _record_loop(
    *,
    robot,
    headset: VRHeadset,
    keyboard: KeyboardTeleop | None,
    events: dict[str, bool],
    fps: int,
    teleop_action_processor,
    robot_action_processor,
    robot_observation_processor,
    dataset: LeRobotDataset | None = None,
    control_time_s: float,
    task: str,
    stop_signal_path: Path,
    display_data: bool = False,
    on_first_recorded_frame=None,
) -> None:
    control_interval = 1 / fps
    started_at = time.perf_counter()
    first_frame_recorded = False

    while time.perf_counter() - started_at < control_time_s:
        loop_started_at = time.perf_counter()
        if events["exit_early"]:
            events["exit_early"] = False
            break

        # Consume stop/rerecord before a possibly blocking camera read.
        headset.poll()
        if stop_signal_path.exists():
            stop_signal_path.unlink(missing_ok=True)
            headset.desktop_stop_capture()
        if headset.stop_requested or headset.disconnect_requested:
            robot.send_action(headset.safe_stop_action(headset._last_observation or {}))
            break

        observation = robot.get_observation()
        headset.poll()
        if stop_signal_path.exists():
            stop_signal_path.unlink(missing_ok=True)
            headset.desktop_stop_capture()
        if keyboard is not None:
            for key in keyboard.pop_key_down_edges():
                if key == "escape":
                    headset.desktop_stop()
                    events["stop_recording"] = True
        if headset.stop_requested or headset.disconnect_requested or events["stop_recording"]:
            robot.send_action(headset.safe_stop_action(observation))
            break
        if headset.rerecord_requested:
            events["rerecord_episode"] = True
            events["exit_early"] = True
            headset.rerecord_requested = False
            robot.send_action(headset.safe_stop_action(observation))
            break

        headset.publish_observation(observation)
        processed_observation = robot_observation_processor(observation)
        observation_frame = None
        if dataset is not None:
            observation_frame = build_dataset_frame(dataset.features, processed_observation, prefix=OBS_STR)

        try:
            action = headset.get_action()
        except TimeoutError as error:
            print(f"VR capture stopping: {error}", flush=True)
            robot.send_action(headset.safe_stop_action(observation))
            headset.stop_requested = True
            events["exit_early"] = True
            break
        if headset.stop_requested or headset.disconnect_requested:
            robot.send_action(headset.safe_stop_action(observation))
            break

        processed_action = teleop_action_processor((action, observation))
        action_to_send = robot_action_processor((processed_action, observation))
        robot.send_action(action_to_send)

        if dataset is not None:
            action_frame = build_dataset_frame(dataset.features, processed_action, prefix=ACTION)
            dataset.add_frame({**observation_frame, **action_frame, "task": task})
            if not first_frame_recorded and on_first_recorded_frame is not None:
                first_frame_recorded = True
                on_first_recorded_frame(observation)

        if display_data:
            log_rerun_data(observation=processed_observation, action=processed_action, compress_images=False)

        elapsed = time.perf_counter() - loop_started_at
        if elapsed > control_interval:
            logging.warning(
                "VR record loop is running slower (%.1f Hz) than the target %d Hz.",
                1 / elapsed,
                fps,
            )
        precise_sleep(max(control_interval - elapsed, 0.0))


def _wait_for_capture(
    config: SessionConfig,
    robot,
    headset: VRHeadset,
    keyboard: KeyboardTeleop | None,
    events: dict[str, bool],
) -> str | None:
    desktop_task = None
    headset_controls_ready = False
    ready_for_capture = False
    discard_queued_controls = True

    while not events["stop_recording"]:
        observation = robot.get_observation()
        headset.poll(allow_start=not discard_queued_controls)
        if discard_queued_controls:
            headset.require_next_action()
            discard_queued_controls = False
        headset.publish_observation(observation)

        if config.stop_signal_path.exists():
            config.stop_signal_path.unlink(missing_ok=True)
            print("VR recording idle; teleoperation ready", flush=True)
        if keyboard is not None:
            for key in keyboard.pop_key_down_edges():
                if key == "escape":
                    headset.desktop_stop()
                    events["stop_recording"] = True
        if headset.disconnect_requested or events["stop_recording"]:
            events["stop_recording"] = True
            robot.send_action(headset.safe_stop_action(observation))
            headset.publish_observation(observation)
            break
        if headset.stop_requested:
            headset.stop_requested = False
            print("VR recording idle; teleoperation ready", flush=True)

        fresh_action = headset.has_fresh_action()
        if fresh_action != headset_controls_ready:
            headset_controls_ready = fresh_action
            print(
                "VR headset connected; teleoperation ready"
                if fresh_action
                else "VR headset controls stale; waiting for headset",
                flush=True,
            )
        robot.send_action(headset.get_action() if fresh_action else headset.safe_stop_action(observation))

        if fresh_action and not ready_for_capture:
            config.ready_signal_path.write_text("ready", encoding="utf-8")
            ready_for_capture = True
            print("VR capture ready; teleoperation live", flush=True)
        elif not fresh_action and ready_for_capture:
            config.ready_signal_path.unlink(missing_ok=True)
            ready_for_capture = False
            print("VR capture not ready; waiting for headset controls", flush=True)

        desktop_start_requested = False
        if config.start_signal_path.exists():
            desktop_task = config.start_signal_path.read_text(encoding="utf-8").strip()
            config.start_signal_path.unlink(missing_ok=True)
            desktop_start_requested = ready_for_capture
            print("VR desktop start signal received", flush=True)
        if not ready_for_capture:
            headset.start_requested = False
        if (headset.start_requested or desktop_start_requested) and ready_for_capture:
            if desktop_start_requested and desktop_task and desktop_task.startswith("task:"):
                task = desktop_task.removeprefix("task:").strip()
            else:
                try:
                    task = config.task_path.read_text(encoding="utf-8").strip()
                except OSError as error:
                    print(f"VR recording start ignored: could not read current task: {error}", flush=True)
                    headset.start_requested = False
                    continue
            if not task:
                print("VR recording start ignored: Task is required", flush=True)
                headset.start_requested = False
                continue
            robot.send_action(headset.safe_stop_action(observation))
            headset.start_requested = False
            config.ready_signal_path.unlink(missing_ok=True)
            headset.publish_observation(observation)
            return task
        time.sleep(1 / config.dataset.fps)
    return None


def run_session(config: SessionConfig) -> LeRobotDataset | None:
    init_logging()
    if config.display_data:
        init_rerun(session_name="vr-recording")

    register_third_party_plugins()
    robot_config_class = RobotConfig.get_choice_class("sourccey_client")
    robot = make_robot_from_config(robot_config_class(remote_ip=config.remote_ip, id=config.robot_id))
    keyboard = KeyboardTeleop(
        KeyboardTeleopConfig(id="keyboard", input_state_path=str(config.keyboard_state_path))
    )
    headset = VRHeadset()
    teleop_action_processor, robot_action_processor, robot_observation_processor = make_default_processors()
    dataset_features = combine_feature_dicts(
        aggregate_pipeline_dataset_features(
            pipeline=teleop_action_processor,
            initial_features=create_initial_features(action=robot.action_features),
            use_videos=config.dataset.video,
        ),
        aggregate_pipeline_dataset_features(
            pipeline=robot_observation_processor,
            initial_features=create_initial_features(observation=robot.observation_features),
            use_videos=config.dataset.video,
        ),
    )

    keyboard_connected = False
    robot_connected = False
    events = {"stop_recording": False, "exit_early": False, "rerecord_episode": False}
    last_dataset = None
    capture_number = 0
    config.ready_signal_path.unlink(missing_ok=True)
    try:
        headset.connect()
        keyboard_connected = connect_keyboard(keyboard)
        robot.connect()
        robot_connected = True
        print("VR receiver ready; waiting for headset controls", flush=True)

        while not events["stop_recording"]:
            task = _wait_for_capture(config, robot, headset, keyboard if keyboard_connected else None, events)
            if task is None:
                break
            config.dataset.single_task = task
            capture_number += 1
            dataset = _create_dataset(config, robot, dataset_features, capture_number)
            print("VR capture setup complete; waiting for first frame", flush=True)

            recorded_episodes = 0
            try:
                with VideoEncodingManager(dataset):
                    while recorded_episodes < config.dataset.num_episodes and not events["stop_recording"]:
                        episode_message = f"Recording episode {dataset.num_episodes}"

                        def first_recorded_frame(observation) -> None:
                            headset.confirm_recording_started(episode_message, observation)
                            print(f"VR capture started: {dataset.repo_id}", flush=True)
                            log_say(episode_message, config.play_sounds)

                        _record_loop(
                            robot=robot,
                            headset=headset,
                            keyboard=keyboard if keyboard_connected else None,
                            events=events,
                            fps=config.dataset.fps,
                            teleop_action_processor=teleop_action_processor,
                            robot_action_processor=robot_action_processor,
                            robot_observation_processor=robot_observation_processor,
                            dataset=dataset,
                            control_time_s=config.dataset.episode_time_s,
                            task=config.dataset.single_task,
                            stop_signal_path=config.stop_signal_path,
                            display_data=config.display_data,
                            on_first_recorded_frame=first_recorded_frame,
                        )
                        if headset.stop_requested or events["stop_recording"]:
                            print("VR capture stopped; saving recorded video", flush=True)
                        if events["rerecord_episode"] and not headset.stop_requested and not events["stop_recording"]:
                            headset.announce("Re-record episode")
                            events["rerecord_episode"] = False
                            events["exit_early"] = False
                            _discard_current_episode(dataset)
                            continue
                        if (
                            not headset.stop_requested
                            and not events["stop_recording"]
                            and recorded_episodes < config.dataset.num_episodes - 1
                        ):
                            headset.announce("Reset the environment")
                            _record_loop(
                                robot=robot,
                                headset=headset,
                                keyboard=keyboard if keyboard_connected else None,
                                events=events,
                                fps=config.dataset.fps,
                                teleop_action_processor=teleop_action_processor,
                                robot_action_processor=robot_action_processor,
                                robot_observation_processor=robot_observation_processor,
                                control_time_s=config.dataset.reset_time_s,
                                task=config.dataset.single_task,
                                stop_signal_path=config.stop_signal_path,
                                display_data=config.display_data,
                            )
                        if events["rerecord_episode"] and not headset.stop_requested and not events["stop_recording"]:
                            headset.announce("Re-record episode")
                            events["rerecord_episode"] = False
                            events["exit_early"] = False
                            _discard_current_episode(dataset)
                            continue
                        events["rerecord_episode"] = False
                        events["exit_early"] = False
                        if dataset.writer.episode_buffer.get("size", 0) > 0:
                            dataset.save_episode()
                            recorded_episodes += 1
                        if headset.stop_requested or events["stop_recording"]:
                            break
            finally:
                dataset.finalize()

            last_dataset = dataset
            if config.dataset.push_to_hub and dataset.num_episodes > 0:
                dataset.push_to_hub(tags=config.dataset.tags, private=config.dataset.private)
            print(f"VR capture saved: {dataset.repo_id}", flush=True)
            headset.announce("Recording saved")
            headset.stop_requested = False
            headset.rerecord_requested = False
            events["exit_early"] = False
            if not events["stop_recording"]:
                headset.publish_observation(robot.get_observation())
    finally:
        config.ready_signal_path.unlink(missing_ok=True)
        if robot_connected and robot.is_connected:
            try:
                robot.send_action(headset.safe_stop_action(headset._last_observation or {}))
            except Exception:
                logging.exception("Could not send final safe-stop action")
            robot.disconnect()
        headset.disconnect()
        if keyboard_connected and keyboard.is_connected:
            keyboard.disconnect()
        log_say("Exiting", config.play_sounds)
    return last_dataset


def main() -> None:
    run_session(_parse_args())


if __name__ == "__main__":
    main()
