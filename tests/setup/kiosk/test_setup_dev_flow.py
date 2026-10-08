from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
SETUP_KIOSK_ROOT = REPO_ROOT / "setup" / "kiosk"
if str(SETUP_KIOSK_ROOT) not in sys.path:
    sys.path.insert(0, str(SETUP_KIOSK_ROOT))
SETUP_SHARED_ROOT = REPO_ROOT / "setup" / "shared"
if str(SETUP_SHARED_ROOT) not in sys.path:
    sys.path.insert(0, str(SETUP_SHARED_ROOT))

from setup.kiosk.setup_dev import DevKioskSetupScript
from setup.kiosk.setup import KioskSetupScript


def test_run_requires_uv_before_project_setup(monkeypatch):
    script = DevKioskSetupScript()
    bun_calls = []

    monkeypatch.setattr(script, "detect_project_root", lambda: True)
    monkeypatch.setattr(script, "check_python_version", lambda: True)
    monkeypatch.setattr(script, "check_bun", lambda: True)
    monkeypatch.setattr(script, "check_rust", lambda: True)
    monkeypatch.setattr(script, "check_git", lambda: True)
    monkeypatch.setattr(script, "ensure_uv", lambda: False)
    monkeypatch.setattr(script, "ensure_bun", lambda: bun_calls.append("bun") or True)

    assert script.run() is False
    assert bun_calls == []
    assert any("uv is required for Sourccey kiosk setup." in error for error in script.errors)


def test_kiosk_python_only_refreshes_robot_environment_without_build(monkeypatch):
    script = KioskSetupScript()
    calls = []

    monkeypatch.setattr(script, "check_root_access", lambda: True)
    monkeypatch.setattr(script, "detect_project_root", lambda: True)
    monkeypatch.setattr(script, "check_python_version", lambda: True)
    monkeypatch.setattr(script, "check_git", lambda: True)
    monkeypatch.setattr(script, "check_uv", lambda: True)
    monkeypatch.setattr(script, "setup_python_environment", lambda: calls.append("python") or True)
    monkeypatch.setattr(
        script,
        "build_tauri",
        lambda: (_ for _ in ()).throw(AssertionError("build must not run")),
    )

    assert script.run(python_only=True) is True
    assert calls == ["python"]


def test_kiosk_password_permission_only_repairs_permission_without_build(monkeypatch):
    script = KioskSetupScript()
    calls = []

    monkeypatch.setenv("SUDO_USER", "sourccey")
    monkeypatch.setattr(script, "check_root_access", lambda: True)
    monkeypatch.setattr(script, "detect_project_root", lambda: True)
    monkeypatch.setattr(
        script,
        "configure_password_update_permission",
        lambda user: calls.append(("password", user)) or True,
    )
    monkeypatch.setattr(
        script,
        "setup_python_environment",
        lambda: (_ for _ in ()).throw(AssertionError("Python setup must not run")),
    )
    monkeypatch.setattr(
        script,
        "build_tauri",
        lambda: (_ for _ in ()).throw(AssertionError("build must not run")),
    )

    assert script.run(password_permission_only=True) is True
    assert calls == [("password", "sourccey")]


def test_kiosk_network_permission_only_repairs_permission_without_build(monkeypatch):
    script = KioskSetupScript()
    calls = []

    monkeypatch.setenv("SUDO_USER", "sourccey")
    monkeypatch.setattr(script, "check_root_access", lambda: True)
    monkeypatch.setattr(script, "detect_project_root", lambda: True)
    monkeypatch.setattr(
        script,
        "configure_networkmanager_permission",
        lambda user: calls.append(("network", user)) or True,
    )
    monkeypatch.setattr(
        script,
        "build_tauri",
        lambda: (_ for _ in ()).throw(AssertionError("build must not run")),
    )

    assert script.run(network_permission_only=True) is True
    assert calls == [("network", "sourccey")]


def test_devices_only_installs_mappings_without_python_battery_or_build(monkeypatch):
    script = KioskSetupScript()
    calls = []
    monkeypatch.setattr(script, "check_root_access", lambda: True)
    monkeypatch.setattr(script, "detect_project_root", lambda: True)
    monkeypatch.setattr(script, "setup_devices", lambda: calls.append("devices") or True)

    def fail():
        raise AssertionError("Device-only repair must not run Python setup or build")

    monkeypatch.setattr(script, "setup_python_environment", fail)
    monkeypatch.setattr(script, "build_tauri", fail)
    assert script.run(devices_only=True)
    assert calls == ["devices"]


def test_kiosk_environment_uses_local_device_setup_before_battery(monkeypatch):
    script = KioskSetupScript()
    calls = []
    monkeypatch.setattr(
        script.python_manager, "setup_python_environment",
        lambda **kwargs: calls.append(("python", kwargs)) or True,
    )
    monkeypatch.setattr(script, "setup_devices", lambda: calls.append("devices") or True)
    monkeypatch.setattr(
        script.battery_manager, "ensure_golden_image", lambda: calls.append("battery") or True,
    )
    assert script.setup_python_environment()
    assert calls == [("python", {"skip_udev": True}), "devices", "battery"]


def test_mapping_failure_stops_kiosk_provisioning_before_battery(monkeypatch):
    script = KioskSetupScript()
    monkeypatch.setattr(script.python_manager, "setup_python_environment", lambda **_: True)
    monkeypatch.setattr(script, "setup_devices", lambda: False)

    def fail():
        raise AssertionError("Battery provisioning must not run after mapping failure")

    monkeypatch.setattr(script.battery_manager, "ensure_golden_image", fail)
    assert not script.setup_python_environment()


def test_kiosk_setup_can_preserve_updater_selected_submodule(monkeypatch):
    script = KioskSetupScript()

    monkeypatch.setattr(script, "check_root_access", lambda: True)
    monkeypatch.setattr(script, "detect_project_root", lambda: True)
    monkeypatch.setattr(script, "fix_project_permissions", lambda: True)
    monkeypatch.setattr(script, "detect_app_info", lambda: True)
    monkeypatch.setattr(script, "check_python_version", lambda: True)
    monkeypatch.setattr(script, "check_bun", lambda: True)
    monkeypatch.setattr(script, "check_rust", lambda: True)
    monkeypatch.setattr(script, "check_git", lambda: True)
    monkeypatch.setattr(script, "check_uv", lambda: True)
    monkeypatch.setattr(script, "setup_swap_for_memory_intensive_builds", lambda: True)
    monkeypatch.setattr(script, "ensure_bun", lambda: True)
    monkeypatch.setattr(
        script,
        "setup_git_submodules",
        lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("submodule checkout should be preserved")
        ),
    )
    monkeypatch.setattr(script, "setup_python_environment", lambda: True)
    monkeypatch.setattr(script, "setup_bun_packages", lambda: True)
    monkeypatch.setattr(script, "setup_session_files", lambda: True)
    monkeypatch.setattr(script, "configure_lightdm", lambda _user: True)
    monkeypatch.setattr(script, "configure_openbox", lambda _user: True)
    monkeypatch.setattr(script, "configure_password_update_permission", lambda _user: True)
    monkeypatch.setattr(script, "configure_networkmanager_permission", lambda _user: True)
    monkeypatch.setattr(script, "cleanup_old_builds", lambda clean=True: True)
    monkeypatch.setattr(script, "build_tauri", lambda: Path("app.deb"))
    monkeypatch.setattr(script, "install_deb", lambda _path: True)
    monkeypatch.setattr(script, "print_summary", lambda: None)
    monkeypatch.setattr(script, "restart_lightdm", lambda: None)

    assert script.run(skip_system=True, skip_submodules=True) is True


def test_https_hint_uses_setup_dev_filename(monkeypatch):
    script = DevKioskSetupScript()

    monkeypatch.setattr(script, "detect_project_root", lambda: True)
    monkeypatch.setattr(script, "check_python_version", lambda: True)
    monkeypatch.setattr(script, "check_bun", lambda: True)
    monkeypatch.setattr(script, "check_rust", lambda: True)
    monkeypatch.setattr(script, "check_git", lambda: True)
    monkeypatch.setattr(script, "ensure_uv", lambda: True)
    monkeypatch.setattr(script, "ensure_bun", lambda: True)
    monkeypatch.setattr(script, "setup_git_submodules", lambda use_https=False: False)
    monkeypatch.setattr(script, "current_python_command", lambda: "python")

    assert script.run(use_https=False) is False
    assert any("setup/kiosk/setup_dev.py --use-https" in error for error in script.errors)


def test_run_does_not_launch_by_default(monkeypatch):
    script = DevKioskSetupScript()
    launch_calls = []

    monkeypatch.setattr(script, "detect_project_root", lambda: True)
    monkeypatch.setattr(script, "check_python_version", lambda: True)
    monkeypatch.setattr(script, "check_bun", lambda: True)
    monkeypatch.setattr(script, "check_rust", lambda: True)
    monkeypatch.setattr(script, "check_git", lambda: True)
    monkeypatch.setattr(script, "ensure_uv", lambda: True)
    monkeypatch.setattr(script, "ensure_bun", lambda: True)
    monkeypatch.setattr(script, "setup_git_submodules", lambda use_https=False: True)
    monkeypatch.setattr(script, "setup_python_environment", lambda: True)
    monkeypatch.setattr(script, "setup_bun_packages", lambda: True)
    monkeypatch.setattr(script, "setup_swap_for_memory_intensive_builds", lambda: True)
    monkeypatch.setattr(script, "run_kiosk_dev", lambda: launch_calls.append("launch") or True)

    assert script.run() is True
    assert launch_calls == []
