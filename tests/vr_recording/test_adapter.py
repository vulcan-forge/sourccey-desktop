import tempfile
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from scripts.vr_recording import runner, standard_runner, vulcan_vr_pb2
from scripts.vr_recording.naming import format_record_repo_id
from scripts.vr_recording.teleoperator import VRHeadset


class VRAdapterTests(unittest.TestCase):
    def test_headset_protocol_preserves_deployed_wire_field_numbers(self):
        action = vulcan_vr_pb2.HeadsetAction.DESCRIPTOR.fields_by_name
        observation = vulcan_vr_pb2.DesktopObservation.DESCRIPTOR.fields_by_name

        self.assertEqual(action["left_arm_target_joints"].number, 1)
        self.assertEqual(action["request_recording_start"].number, 7)
        self.assertEqual(action["request_recording_stop"].number, 8)
        self.assertEqual(action["request_recording_rerecord"].number, 9)
        self.assertEqual(action["recording_settings"].number, 10)
        self.assertEqual(observation["cameras"].number, 5)
        self.assertEqual(observation["recording_start_counter"].number, 6)
        self.assertEqual(observation["recording_announcement"].number, 11)

    def test_capture_stop_does_not_disconnect_headset(self):
        headset = VRHeadset()
        headset.desktop_stop_capture()
        self.assertTrue(headset.stop_requested)
        self.assertFalse(headset.disconnect_requested)

        headset.desktop_stop()
        self.assertTrue(headset.disconnect_requested)

    def test_short_headset_dropout_holds_robot_safely(self):
        now = [1.0]
        with patch("scripts.vr_recording.teleoperator.time.monotonic", side_effect=lambda: now[0]):
            headset = VRHeadset()
            headset._latest = vulcan_vr_pb2.HeadsetAction()
            headset._last_packet_at = 0.2
            headset._last_observation = {"left_shoulder_pan.pos": 12.5}

            action = headset.get_action()
            self.assertEqual(action["left_shoulder_pan.pos"], 12.5)
            self.assertEqual(action["x.vel"], 0.0)
            self.assertEqual(action["y.vel"], 0.0)
            self.assertEqual(action["theta.vel"], 0.0)

            now[0] = 3.1
            with self.assertRaisesRegex(TimeoutError, "2 seconds"):
                headset.get_action()

    def test_capture_stop_is_handled_before_blocking_camera_read(self):
        headset = VRHeadset()
        headset._last_observation = {"left_shoulder_pan.pos": 12.5}

        def receive_stop(**_kwargs):
            headset.stop_requested = True
            return True

        headset.poll = receive_stop

        class Robot:
            def get_observation(self):
                raise AssertionError("Stop must be handled before the next camera read")

            def send_action(self, action):
                self_test.assertEqual(action["left_shoulder_pan.pos"], 12.5)

        self_test = self
        with tempfile.TemporaryDirectory() as temp_dir:
            runner._record_loop(
                robot=Robot(),
                headset=headset,
                keyboard=None,
                events={"stop_recording": False, "exit_early": False, "rerecord_episode": False},
                fps=30,
                teleop_action_processor=None,
                robot_action_processor=None,
                robot_observation_processor=None,
                control_time_s=1,
                task="Fold the shirt",
                stop_signal_path=runner.Path(temp_dir) / "stop",
            )

    def test_dataset_names_include_capture_number_and_task(self):
        first = runner._stamped_repo_id("local/demo", "Fold the Shirt!", 1)
        second = runner._stamped_repo_id("local/demo", "Fold the Shirt!", 2)
        self.assertTrue(first.startswith("local/demo_") and first.endswith("_fold-the-shirt"))
        self.assertTrue(second.startswith("local/demo-2_") and second.endswith("_fold-the-shirt"))

    def test_rerecord_is_handled_before_blocking_camera_read(self):
        from unittest.mock import Mock
        headset = VRHeadset()
        headset.poll = Mock(side_effect=lambda: setattr(headset, "rerecord_requested", True))
        robot = SimpleNamespace(
            get_observation=Mock(side_effect=AssertionError("Rerecord must not wait for cameras")),
            send_action=Mock(),
        )
        events = {"stop_recording": False, "exit_early": False, "rerecord_episode": False}
        with tempfile.TemporaryDirectory() as temp_dir:
            runner._record_loop(
                robot=robot, headset=headset, keyboard=None, events=events, fps=30,
                teleop_action_processor=None, robot_action_processor=None,
                robot_observation_processor=None, control_time_s=1, task="test",
                stop_signal_path=runner.Path(temp_dir) / "stop",
            )
        self.assertTrue(events["rerecord_episode"])
        robot.get_observation.assert_not_called()

    def test_desktop_name_pattern_does_not_require_lerobot_modifications(self):
        pattern = "Sourccey-{Task}-{number}-{timestamp}"
        self.assertEqual(
            format_record_repo_id("local/demo", "Fold the Shirt!", 2, "20261022_120000", pattern),
            "local/Sourccey-fold-the-shirt-002-20261022_120000",
        )
        with patch.dict("os.environ", {"SOURCCEY_RECORD_NAME_PATTERN": pattern}):
            self.assertIn("Sourccey-fold-the-shirt-002-", runner._stamped_repo_id("local/demo", "Fold the Shirt!", 2))

    def test_standard_runner_passes_robot_args_to_stock_lerobot(self):
        from lerobot.configs.dataset import DatasetRecordConfig
        from lerobot.scripts import lerobot_record

        def verify_stock_entry_point():
            self.assertEqual(sys.argv[1:], ["--robot.type=sourccey_client"])
            dataset = DatasetRecordConfig(repo_id="local/demo", single_task="Fold the Shirt!")
            dataset.stamp_repo_id()
            self.assertRegex(dataset.repo_id, r"^local/Sourccey-fold-the-shirt-001-\d{8}_\d{6}$")

        with (
            patch.object(DatasetRecordConfig, "stamp_repo_id"),
            patch.object(lerobot_record, "main", side_effect=verify_stock_entry_point),
            patch.object(sys, "argv", [
                "standard_runner.py",
                "--desktop_name_pattern=Sourccey-{Task}-{number}-{timestamp}",
                "--robot.type=sourccey_client",
            ]),
        ):
            standard_runner.main()

    def test_rerecord_removes_video_frames_left_by_stock_lerobot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            frame_dir = runner.Path(temp_dir) / "frames"
            frame_dir.mkdir()
            (frame_dir / "frame-000000.png").touch()

            class Writer:
                episode_buffer = {"episode_index": 0, "size": 1}

                def _get_image_file_dir(self, episode_index, camera_key):
                    self_test.assertEqual(episode_index, 0)
                    self_test.assertEqual(camera_key, "observation.images.front")
                    return frame_dir

            class Dataset:
                writer = Writer()
                num_episodes = 0
                meta = SimpleNamespace(camera_keys=["observation.images.front"])

                def clear_episode_buffer(self):
                    self.writer.episode_buffer = {"size": 0}

            self_test = self
            runner._discard_current_episode(Dataset())
            self.assertFalse(frame_dir.exists())



class VREpisodeFlowTests(unittest.TestCase):
    def run_batch(self, actions, episodes=2, reset_action=None):
        from contextlib import nullcontext
        from unittest.mock import Mock

        headset = VRHeadset()
        robot = SimpleNamespace(send_action=Mock(), get_observation=Mock(return_value={}))
        dataset = SimpleNamespace(
            num_episodes=0, repo_id="local/test",
            writer=SimpleNamespace(episode_buffer={"size": 0}),
        )
        saved = []
        def save():
            saved.append(dataset.num_episodes + 1)
            dataset.num_episodes += 1
            dataset.writer.episode_buffer = {"size": 0}
        dataset.save_episode = save
        config = SimpleNamespace(
            dataset=SimpleNamespace(num_episodes=episodes, fps=30, episode_time_s=10,
                                    reset_time_s=1, single_task="test"),
            stop_signal_path=runner.Path("unused"), display_data=False, play_sounds=False,
        )
        events = {"stop_recording": False, "exit_early": False, "rerecord_episode": False}
        actions = iter(actions)
        attempts = []
        resets = []
        def loop(**kwargs):
            if kwargs["dataset"] is None:
                resets.append(True)
                if reset_action and len(resets) == 1:
                    events["rerecord_episode"] = True
                    events["exit_early"] = True
                return
            action = next(actions)
            attempts.append(dataset.num_episodes + 1)
            dataset.writer.episode_buffer["size"] = 3
            kwargs["on_first_recorded_frame"]({})
            if action == "stop":
                headset.stop_requested = True
            elif action == "rerecord":
                events["rerecord_episode"] = True
                events["exit_early"] = True
            elif action == "desktop_stop":
                events["stop_capture"] = True
                headset.stop_requested = True
            elif action == "disconnect":
                events["stop_recording"] = True
                headset.disconnect_requested = True
        def discard(_dataset):
            dataset.writer.episode_buffer = {"size": 0}
        spoken = []
        with (
            patch.object(runner, "VideoEncodingManager", side_effect=lambda _: nullcontext()),
            patch.object(runner, "_record_loop", side_effect=loop),
            patch.object(runner, "_discard_current_episode", side_effect=discard) as discarded,
            patch.object(runner, "log_say", side_effect=lambda message, *_: spoken.append(message)),
        ):
            runner._record_episodes(config, robot, headset, None, events, dataset, (None, None, None))
        return SimpleNamespace(saved=saved, attempts=attempts, resets=resets, spoken=spoken,
                               messages=[text for _, text in headset._announcements],
                               discarded=discarded.call_count)

    def test_manual_stop_advances_through_every_episode(self):
        result = self.run_batch(["stop", "stop", "stop"], episodes=3)
        self.assertEqual(result.saved, [1, 2, 3])
        self.assertEqual(result.attempts, [1, 2, 3])
        self.assertEqual(len(result.resets), 2)
        self.assertEqual(result.spoken, result.messages)
        self.assertEqual(result.spoken, [
            "Recording episode 1", "Stopping recording", "Reset the environment",
            "Recording episode 2", "Stopping recording", "Reset the environment",
            "Recording episode 3", "Stopping recording",
        ])

    def test_timed_episodes_advance_automatically(self):
        result = self.run_batch(["timeout", "timeout"])
        self.assertEqual(result.saved, [1, 2])
        self.assertEqual(len(result.resets), 1)

    def test_rerecord_repeats_number_and_does_not_count_discarded_attempt(self):
        result = self.run_batch(["rerecord", "stop", "stop"])
        self.assertEqual(result.attempts, [1, 1, 2])
        self.assertEqual(result.saved, [1, 2])
        self.assertEqual(result.discarded, 1)
        self.assertIn("Re-record episode", result.spoken)
        self.assertEqual(result.spoken, result.messages)

    def test_rerecord_during_reset_repeats_the_unsaved_episode(self):
        result = self.run_batch(["stop", "stop", "stop"], reset_action="rerecord")
        self.assertEqual(result.attempts, [1, 1, 2])
        self.assertEqual(result.discarded, 1)

    def test_desktop_stop_saves_current_episode_and_ends_batch(self):
        result = self.run_batch(["desktop_stop"], episodes=3)
        self.assertEqual(result.saved, [1])
        self.assertEqual(result.resets, [])

    def test_disconnect_does_not_start_another_episode(self):
        result = self.run_batch(["disconnect"], episodes=3)
        self.assertEqual(result.saved, [1])
        self.assertEqual(result.resets, [])


class VRContinuousTeleopTests(unittest.TestCase):
    def run_pending_save(self, *, fresh=True, desktop_stop=False):
        import threading
        from unittest.mock import Mock

        main_thread = threading.get_ident()
        commands = []
        worker_threads = []
        saved = threading.Event()
        headset = VRHeadset()
        headset.poll = Mock()
        headset.has_fresh_action = Mock(return_value=fresh)
        headset.get_action = Mock(return_value={"x.vel": 0.75})
        headset.publish_observation = Mock()
        def send(action):
            self.assertEqual(threading.get_ident(), main_thread)
            commands.append(action)
            if len(commands) >= 3:
                saved.set()
        def save():
            worker_threads.append(threading.get_ident())
            if not saved.wait(5):
                raise AssertionError("Teleoperation was blocked by saving")
            return "saved"
        robot = SimpleNamespace(get_observation=Mock(return_value={}), send_action=send)
        events = {"stop_recording": False, "exit_early": False, "rerecord_episode": False}
        with tempfile.TemporaryDirectory() as temp_dir:
            stop_path = runner.Path(temp_dir) / "stop"
            if desktop_stop:
                stop_path.touch()
            config = SimpleNamespace(dataset=SimpleNamespace(fps=120), stop_signal_path=stop_path)
            identity = lambda pair: pair[0]
            result = runner._run_with_live_teleop(
                save, config, robot, headset, None, events, (identity, identity, None),
            )
        self.assertEqual(result, "saved")
        self.assertNotEqual(worker_threads[0], main_thread)
        self.assertGreaterEqual(headset.publish_observation.call_count, 3)
        return commands, events

    def test_robot_keeps_receiving_live_actions_while_episode_saves(self):
        commands, _ = self.run_pending_save()
        self.assertTrue(all(action["x.vel"] == 0.75 for action in commands))

    def test_stale_headset_still_holds_robot_while_saving(self):
        commands, _ = self.run_pending_save(fresh=False)
        self.assertTrue(all(action["x.vel"] == 0 for action in commands))

    def test_desktop_stop_is_handled_before_the_save_finishes(self):
        commands, events = self.run_pending_save(desktop_stop=True)
        self.assertTrue(events["stop_capture"])
        self.assertTrue(all(action["x.vel"] == 0 for action in commands))

    def test_healthy_episode_boundary_does_not_send_a_hold(self):
        from unittest.mock import Mock
        headset = VRHeadset()
        headset.has_fresh_action = Mock(return_value=True)
        headset.stop_requested = True
        robot = SimpleNamespace(send_action=Mock())
        runner._hold_if_controls_unavailable(robot, headset, {"stop_recording": False}, {})
        robot.send_action.assert_not_called()

    def test_save_failure_holds_robot_and_propagates(self):
        from unittest.mock import Mock
        headset = VRHeadset()
        robot = SimpleNamespace(send_action=Mock(), get_observation=Mock(return_value={}))
        def fail():
            raise RuntimeError("Disk full")
        with tempfile.TemporaryDirectory() as temp_dir:
            config = SimpleNamespace(dataset=SimpleNamespace(fps=30), stop_signal_path=runner.Path(temp_dir) / "stop")
            with self.assertRaisesRegex(RuntimeError, "Disk full"):
                runner._run_with_live_teleop(
                    fail, config, robot, headset, None, {"stop_recording": False}, (None, None, None),
                )
        self.assertEqual(robot.send_action.call_args.args[0]["x.vel"], 0)


class VRAnnouncementTransportTests(unittest.TestCase):
    def test_latest_observation_retains_ordered_lifecycle_events(self):
        from unittest.mock import Mock
        headset = VRHeadset()
        headset._observations = Mock()
        headset._latest = vulcan_vr_pb2.HeadsetAction()
        headset._last_observation = {}
        headset.confirm_recording_started("Recording episode 1", {})
        headset.announce("Stopping recording")
        headset.announce("Reset the environment")
        headset.confirm_recording_started("Recording episode 2", {})
        packet = headset._observations.send.call_args.args[0]
        state = vulcan_vr_pb2.DesktopObservation.FromString(packet)
        self.assertEqual(state.recording_phase, "recording")
        self.assertEqual([event.text for event in state.recording_announcements], [
            "Recording episode 1", "Stopping recording", "Reset the environment", "Recording episode 2",
        ])
        self.assertEqual([event.sequence for event in state.recording_announcements], [1, 2, 3, 4])
        self.assertEqual(state.recording_announcement, "Recording episode 2")

    def test_announcement_history_is_bounded(self):
        headset = VRHeadset()
        for i in range(100):
            headset.announce(str(i))
        self.assertEqual(len(headset._announcements), 64)
        self.assertEqual(headset._announcements[0], (37, "36"))


if __name__ == "__main__":
    unittest.main()
