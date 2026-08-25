from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
SETUP_SHARED_ROOT = REPO_ROOT / "setup" / "shared"
if str(SETUP_SHARED_ROOT) not in sys.path:
    sys.path.insert(0, str(SETUP_SHARED_ROOT))

from setup.shared.setup_python import PythonSetupManager
import setup.shared.setup_python as setup_python_module


def _noop(*_args, **_kwargs):
    return None


def _create_fake_lerobot_project(project_root: Path) -> None:
    lerobot_dir = project_root / "modules" / "lerobot-vulcan"
    lerobot_dir.mkdir(parents=True, exist_ok=True)
    (lerobot_dir / "pyproject.toml").write_text("[project]\nname = 'lerobot'\n")
    setup_executable = lerobot_dir / ".venv" / (
        "Scripts/sourccey-setup.exe" if setup_python_module.os.name == "nt" else "bin/sourccey-setup"
    )
    setup_executable.parent.mkdir(parents=True)
    setup_executable.touch()


def test_setup_python_environment_syncs_desktop_editable_profile(monkeypatch, tmp_path):
    _create_fake_lerobot_project(tmp_path)
    captured = []

    monkeypatch.setattr(
        setup_python_module,
        "find_user_binary",
        lambda binary_name, _search_dirs: Path("/tmp/uv") if binary_name == "uv" else None,
    )

    def fake_run(command, cwd, env_overrides):
        captured.append((command, cwd, dict(env_overrides)))
        return SimpleNamespace(returncode=0)

    manager = PythonSetupManager(tmp_path, _noop, _noop, _noop, _noop)
    monkeypatch.setattr(manager, "_run_command_as_real_user", fake_run)

    assert manager.setup_python_environment(desktop=True) is True

    assert captured[0][0] == [
        str(Path("/tmp/uv")),
        "sync",
        "--frozen",
        "--extra",
        "sourccey-desktop",
        "--extra",
        "xvla",
    ]
    assert captured[1][0][-1] == "desktop"
    assert Path(captured[1][0][0]).name in {"sourccey-setup", "sourccey-setup.exe"}
    assert captured[0][1] == tmp_path / "modules" / "lerobot-vulcan"
    assert "UV_PYTHON" not in captured[0][2]
    assert Path(captured[0][2]["SOURCCEY_UV_BIN"]) == Path("/tmp/uv")


def test_setup_python_environment_syncs_robot_editable_profile(monkeypatch, tmp_path):
    _create_fake_lerobot_project(tmp_path)
    captured = []

    monkeypatch.setattr(
        setup_python_module,
        "find_user_binary",
        lambda binary_name, _search_dirs: Path("/tmp/uv") if binary_name == "uv" else None,
    )

    def fake_run(command, cwd, env_overrides):
        captured.append((command, cwd, dict(env_overrides)))
        return SimpleNamespace(returncode=0)

    manager = PythonSetupManager(tmp_path, _noop, _noop, _noop, _noop)
    monkeypatch.setattr(manager, "_run_command_as_real_user", fake_run)

    assert manager.setup_python_environment() is True

    assert captured[0][0] == [
        str(Path("/tmp/uv")),
        "sync",
        "--frozen",
        "--extra",
        "sourccey-robot",
    ]
    assert captured[1][0][-1] == "robot"
    assert Path(captured[1][0][0]).name in {"sourccey-setup", "sourccey-setup.exe"}
    assert captured[0][1] == tmp_path / "modules" / "lerobot-vulcan"
    assert "UV_PYTHON" not in captured[0][2]
    assert Path(captured[0][2]["SOURCCEY_UV_BIN"]) == Path("/tmp/uv")
