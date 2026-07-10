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


def _create_fake_lerobot_setup_tree(project_root: Path) -> None:
    setup_dir = project_root / "modules" / "lerobot-vulcan" / "setup"
    setup_dir.mkdir(parents=True, exist_ok=True)
    (setup_dir / "setup.py").write_text("# fake lerobot setup file\n")


def test_setup_python_environment_uses_desktop_flag_without_forcing_python(monkeypatch, tmp_path):
    _create_fake_lerobot_setup_tree(tmp_path)
    captured = {}

    monkeypatch.setattr(
        setup_python_module,
        "find_user_binary",
        lambda binary_name, _search_dirs: Path("/tmp/uv") if binary_name == "uv" else None,
    )

    def fake_run(command, cwd, env_overrides):
        captured["command"] = command
        captured["cwd"] = cwd
        captured["env_overrides"] = dict(env_overrides)
        return SimpleNamespace(returncode=0)

    manager = PythonSetupManager(tmp_path, _noop, _noop, _noop, _noop)
    monkeypatch.setattr(manager, "_run_command_as_real_user", fake_run)

    assert manager.setup_python_environment(desktop=True) is True

    assert captured["command"] == [
        sys.executable,
        str(tmp_path / "modules" / "lerobot-vulcan" / "setup" / "setup.py"),
        "--desktop",
    ]
    assert captured["cwd"] == tmp_path / "modules" / "lerobot-vulcan"
    assert "UV_PYTHON" not in captured["env_overrides"]
    assert Path(captured["env_overrides"]["SOURCCEY_UV_BIN"]) == Path("/tmp/uv")


def test_setup_python_environment_omits_desktop_flag_when_not_requested(monkeypatch, tmp_path):
    _create_fake_lerobot_setup_tree(tmp_path)
    captured = {}

    monkeypatch.setattr(
        setup_python_module,
        "find_user_binary",
        lambda *_args, **_kwargs: None,
    )

    def fake_run(command, cwd, env_overrides):
        captured["command"] = command
        captured["cwd"] = cwd
        captured["env_overrides"] = dict(env_overrides)
        return SimpleNamespace(returncode=0)

    manager = PythonSetupManager(tmp_path, _noop, _noop, _noop, _noop)
    monkeypatch.setattr(manager, "_run_command_as_real_user", fake_run)

    assert manager.setup_python_environment() is True

    assert captured["command"] == [
        sys.executable,
        str(tmp_path / "modules" / "lerobot-vulcan" / "setup" / "setup.py"),
    ]
    assert captured["cwd"] == tmp_path / "modules" / "lerobot-vulcan"
    assert "UV_PYTHON" not in captured["env_overrides"]
    assert "SOURCCEY_UV_BIN" not in captured["env_overrides"]
