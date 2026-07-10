from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from setup.desktop.setup_dev import DesktopDevSetupScript


def _create_script() -> DesktopDevSetupScript:
    return DesktopDevSetupScript()


def test_build_tauri_dev_command_uses_bun_run_wrapper(monkeypatch):
    monkeypatch.setattr("setup.desktop.setup_dev.get_bun_path", lambda: "/tmp/bun")

    script = _create_script()

    assert script.build_tauri_dev_command() == ["/tmp/bun", "run", "tauri", "dev"]


def test_run_desktop_dev_executes_wrapped_command(monkeypatch):
    captured = {}
    script = _create_script()

    monkeypatch.setattr(script, "build_tauri_dev_command", lambda: ["bun", "run", "tauri", "dev"])
    monkeypatch.setattr(
        "setup.desktop.setup_dev.wrap_command",
        lambda command, cwd: (["wrapped", *command], cwd / "wrapped"),
    )

    def fake_run(command, cwd, env):
        captured["command"] = command
        captured["cwd"] = cwd
        captured["env"] = env
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr("setup.desktop.setup_dev.subprocess.run", fake_run)

    assert script.run_desktop_dev() is True
    assert captured["command"] == ["wrapped", "bun", "run", "tauri", "dev"]
    assert captured["cwd"] == script.project_root / "wrapped"
    assert captured["env"]["PATH"] == os.environ["PATH"]


def test_run_skips_launch_when_setup_only(monkeypatch):
    script = _create_script()
    calls = []

    monkeypatch.setattr(script, "check_project_structure", lambda: True)
    monkeypatch.setattr(script, "check_python_version", lambda: True)
    monkeypatch.setattr(script, "check_git", lambda: True)
    monkeypatch.setattr(script, "ensure_uv", lambda: True)
    monkeypatch.setattr(script, "ensure_bun", lambda: True)
    monkeypatch.setattr(script, "ensure_rust", lambda: True)
    monkeypatch.setattr(script, "ensure_desktop_tauri_prerequisites", lambda: True)
    monkeypatch.setattr(script, "ensure_linux_tauri_prerequisites", lambda: True)
    monkeypatch.setattr(script, "ensure_linux_inotify_limits", lambda: True)
    monkeypatch.setattr(script, "setup_git_submodules", lambda use_https=False: True)
    monkeypatch.setattr(script.git_manager, "checkout_submodule_tag", lambda **_kwargs: True)
    monkeypatch.setattr(script, "setup_python_environment", lambda: True)
    monkeypatch.setattr(script, "setup_bun_packages", lambda: True)
    monkeypatch.setattr(script, "run_desktop_dev", lambda: calls.append("launch") or True)

    assert script.run(launch=False) is True
    assert calls == []


def test_run_does_not_launch_by_default(monkeypatch):
    script = _create_script()
    calls = []

    monkeypatch.setattr(script, "check_project_structure", lambda: True)
    monkeypatch.setattr(script, "check_python_version", lambda: True)
    monkeypatch.setattr(script, "check_git", lambda: True)
    monkeypatch.setattr(script, "ensure_uv", lambda: True)
    monkeypatch.setattr(script, "ensure_bun", lambda: True)
    monkeypatch.setattr(script, "ensure_rust", lambda: True)
    monkeypatch.setattr(script, "ensure_desktop_tauri_prerequisites", lambda: True)
    monkeypatch.setattr(script, "ensure_linux_tauri_prerequisites", lambda: True)
    monkeypatch.setattr(script, "ensure_linux_inotify_limits", lambda: True)
    monkeypatch.setattr(script, "setup_git_submodules", lambda use_https=False: True)
    monkeypatch.setattr(script.git_manager, "checkout_submodule_tag", lambda **_kwargs: True)
    monkeypatch.setattr(script, "setup_python_environment", lambda: True)
    monkeypatch.setattr(script, "setup_bun_packages", lambda: True)
    monkeypatch.setattr(script, "run_desktop_dev", lambda: calls.append("launch") or True)

    assert script.run() is True
    assert calls == []


def test_print_summary_handles_warnings(capsys):
    script = _create_script()
    script.warnings.append("Example Linux prerequisite warning")

    script.print_summary()

    output = capsys.readouterr().out
    assert "Setup completed with 1 warning(s)" in output
    assert "Example Linux prerequisite warning" in output


def test_linux_inotify_check_warns_for_low_limits(monkeypatch, capsys):
    script = _create_script()
    script.system = "Linux"

    values = {
        "max_user_watches": "65536",
        "max_user_instances": "128",
    }
    monkeypatch.setattr(
        Path,
        "read_text",
        lambda path, **_kwargs: values[path.name],
    )

    assert script.check_linux_inotify_limits() is False
    assert any("OS file watch limit reached" in warning for warning in script.warnings)
    assert "sudo sysctl --system" in capsys.readouterr().out


def test_linux_inotify_check_accepts_recommended_limits(monkeypatch):
    script = _create_script()
    script.system = "Linux"

    values = {
        "max_user_watches": "524288",
        "max_user_instances": "1024",
    }
    monkeypatch.setattr(
        Path,
        "read_text",
        lambda path, **_kwargs: values[path.name],
    )

    assert script.check_linux_inotify_limits() is True
    assert script.warnings == []


def test_linux_inotify_ensure_persists_and_reloads_limits(monkeypatch):
    script = _create_script()
    script.system = "Linux"
    checks = iter([False, True])
    calls = []

    monkeypatch.setattr(script, "check_linux_inotify_limits", lambda: next(checks))
    monkeypatch.setattr(os, "geteuid", lambda: 1000)

    def fake_run(command, **kwargs):
        calls.append((command, kwargs))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr("setup.desktop.setup_dev.subprocess.run", fake_run)

    assert script.ensure_linux_inotify_limits() is True
    assert calls[0][0] == [
        "sudo",
        "tee",
        "/etc/sysctl.d/99-sourccey-inotify.conf",
    ]
    assert "max_user_watches=524288" in calls[0][1]["input"]
    assert calls[1][0] == ["sudo", "sysctl", "--system"]


def test_run_aborts_when_base_setup_step_fails(monkeypatch):
    script = _create_script()
    launch_calls = []

    monkeypatch.setattr(script, "check_project_structure", lambda: True)
    monkeypatch.setattr(script, "check_python_version", lambda: True)
    monkeypatch.setattr(script, "check_git", lambda: True)
    monkeypatch.setattr(script, "ensure_uv", lambda: True)
    monkeypatch.setattr(script, "ensure_bun", lambda: True)
    monkeypatch.setattr(script, "ensure_rust", lambda: True)
    monkeypatch.setattr(script, "ensure_desktop_tauri_prerequisites", lambda: True)
    monkeypatch.setattr(script, "ensure_linux_tauri_prerequisites", lambda: True)
    monkeypatch.setattr(script, "ensure_linux_inotify_limits", lambda: True)
    monkeypatch.setattr(script, "setup_git_submodules", lambda use_https=False: False)
    monkeypatch.setattr(script, "run_desktop_dev", lambda: launch_calls.append("launch") or True)

    assert script.run() is False
    assert launch_calls == []


def test_macos_prerequisites_require_xcode_select(monkeypatch):
    script = _create_script()
    script.system = "Darwin"

    monkeypatch.setattr(
        "setup.desktop.setup_dev.subprocess.run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1, stdout="", stderr="missing"),
    )

    assert script.ensure_desktop_tauri_prerequisites() is False
    assert any("Xcode Command Line Tools are required" in error for error in script.errors)


def test_windows_prerequisites_accept_vs_build_tools(monkeypatch):
    script = _create_script()
    script.system = "Windows"

    monkeypatch.setattr("setup.desktop.setup_dev.shutil.which", lambda name: None)
    monkeypatch.setattr(
        script,
        "_find_windows_vswhere",
        lambda: Path("C:/Program Files/Microsoft Visual Studio/Installer/vswhere.exe"),
    )
    monkeypatch.setattr(
        "setup.desktop.setup_dev.subprocess.run",
        lambda *args, **kwargs: SimpleNamespace(
            returncode=0,
            stdout="C:\\BuildTools\n",
            stderr="",
        ),
    )

    assert script.ensure_desktop_tauri_prerequisites() is True
