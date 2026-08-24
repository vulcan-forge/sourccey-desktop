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
