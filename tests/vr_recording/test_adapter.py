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


if __name__ == "__main__":
    unittest.main()
