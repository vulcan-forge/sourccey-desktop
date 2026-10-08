from pathlib import Path
import shutil
import subprocess

import pytest

from setup.kiosk.components import setup_devices as devices


@pytest.fixture
def device_setup(monkeypatch, tmp_path):
    destination = tmp_path / "rules.d" / "99-robot-hardware-ports.rules"
    destination.parent.mkdir()
    device_directory = tmp_path / "dev"
    device_directory.mkdir()
    monkeypatch.setattr(devices, "RULES_DESTINATION", destination)
    monkeypatch.setattr(devices, "DEVICE_DIRECTORY", device_directory)
    monkeypatch.setattr(devices.platform, "system", lambda: "Linux")
    monkeypatch.setattr(devices.os, "geteuid", lambda: 0, raising=False)
    monkeypatch.setattr(devices.shutil, "which", lambda _: "/usr/bin/udevadm")
    calls, warnings, errors = [], [], []

    def run(command, **kwargs):
        calls.append(command)
        if command[:3] == ["install", "-m", "644"]:
            shutil.copyfile(command[3], command[4])
        elif command[0] == "cp":
            shutil.copyfile(command[-2], command[-1])
        elif command[:2] == ["rm", "-f"]:
            Path(command[-1]).unlink(missing_ok=True)
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(devices.subprocess, "run", run)

    def invoke():
        return devices.setup_devices(lambda _: None, lambda _: None, warnings.append, errors.append)

    return destination, device_directory, calls, warnings, errors, invoke


def test_installs_all_device_rules_without_requiring_connected_hardware(device_setup):
    destination, _, calls, warnings, errors, invoke = device_setup
    assert invoke()
    assert destination.read_text() == devices.RULES_SOURCE.read_text()
    assert ["udevadm", "control", "--reload-rules"] in calls
    assert ["udevadm", "trigger", "--action=add", "--subsystem-match=tty"] in calls
    assert ["udevadm", "trigger", "--action=add", "--subsystem-match=video4linux"] in calls
    assert ["udevadm", "settle", "--timeout=30"] in calls
    assert len(warnings) == 8
    assert errors == []


def test_repeated_install_preserves_matching_rules_and_refreshes_aliases(device_setup):
    destination, _, calls, _, _, invoke = device_setup
    destination.write_text(devices.RULES_SOURCE.read_text())
    assert invoke()
    assert all(command[0] == "udevadm" for command in calls)
    assert not Path(str(destination) + ".bak").exists()


def test_backs_up_previous_rules_and_preserves_unrelated_files(device_setup):
    destination, _, _, _, _, invoke = device_setup
    destination.write_text("# old hardware layout\n")
    unrelated = destination.parent / "99-other.rules"
    unrelated.write_text('SUBSYSTEM=="tty", SYMLINK+="otherDevice"\n')
    assert invoke()
    assert Path(str(destination) + ".bak").read_text() == "# old hardware layout\n"
    assert unrelated.read_text() == 'SUBSYSTEM=="tty", SYMLINK+="otherDevice"\n'


def test_conflicting_alias_stops_before_any_system_change(device_setup):
    destination, _, calls, _, errors, invoke = device_setup
    conflicting = destination.parent / "old-cameras.rules"
    conflicting.write_text('SUBSYSTEM=="video4linux", SYMLINK += "cameraFrontBottom"\n')
    assert not invoke()
    assert calls == []
    assert not destination.exists()
    assert "cameraFrontBottom" in errors[0]


def test_removes_obsolete_duplicate_after_installing_authoritative_rules(device_setup):
    destination, _, calls, _, errors, invoke = device_setup
    obsolete = destination.parent / "99-sourccey-hardware.rules"
    obsolete.write_text(devices.RULES_SOURCE.read_text())

    assert invoke()
    assert destination.read_text() == devices.RULES_SOURCE.read_text()
    assert not obsolete.exists()
    assert ["rm", "-f", str(obsolete)] in calls
    assert errors == []


def test_does_not_remove_obsolete_named_file_with_unrelated_alias(device_setup):
    destination, _, calls, _, errors, invoke = device_setup
    obsolete = destination.parent / "99-sourccey-hardware.rules"
    obsolete.write_text(
        'SUBSYSTEM=="tty", SYMLINK+="robotRightArm"\n'
        'SUBSYSTEM=="tty", SYMLINK+="unrelatedController"\n'
    )

    assert not invoke()
    assert obsolete.exists()
    assert calls == []
    assert not destination.exists()
    assert "robotRightArm" in errors[0]


def test_failed_reload_does_not_report_success(monkeypatch, device_setup):
    destination, _, _, _, errors, invoke = device_setup
    successful_run = devices.subprocess.run

    def fail(command, **kwargs):
        if command == ["udevadm", "control", "--reload-rules"]:
            raise subprocess.CalledProcessError(1, command)
        return successful_run(command, **kwargs)

    monkeypatch.setattr(devices.subprocess, "run", fail)
    assert not invoke()
    assert destination.exists()
    assert "Hardware device setup failed" in errors[0]


def test_normal_user_installs_through_sudo(monkeypatch, device_setup):
    _, _, calls, _, _, invoke = device_setup
    monkeypatch.setattr(devices.os, "geteuid", lambda: 1000)
    assert invoke()
    assert all(command[0] == "sudo" for command in calls)


def test_missing_udev_fails_without_claiming_rules_are_installed(monkeypatch, device_setup):
    _, _, calls, _, errors, invoke = device_setup
    monkeypatch.setattr(devices.shutil, "which", lambda _: None)
    assert not invoke()
    assert calls == []
    assert "udevadm is missing" in errors[0]
