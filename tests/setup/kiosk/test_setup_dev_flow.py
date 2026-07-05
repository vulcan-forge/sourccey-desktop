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
    monkeypatch.setattr(script.git_manager, "checkout_submodule_tag", lambda **_kwargs: True)
    monkeypatch.setattr(script, "setup_python_environment", lambda: True)
    monkeypatch.setattr(script, "setup_bun_packages", lambda: True)
    monkeypatch.setattr(script, "setup_swap_for_memory_intensive_builds", lambda: True)
    monkeypatch.setattr(script, "run_kiosk_dev", lambda: launch_calls.append("launch") or True)

    assert script.run() is True
    assert launch_calls == []
