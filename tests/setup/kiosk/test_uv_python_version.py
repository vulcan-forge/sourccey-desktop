from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace


REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
SETUP_SHARED_ROOT = REPO_ROOT / "setup" / "shared"
if str(SETUP_SHARED_ROOT) not in sys.path:
    sys.path.insert(0, str(SETUP_SHARED_ROOT))

from setup.shared.setup_python import PythonSetupManager, UV_VENV_PYTHON_VERSION
import setup.shared.setup_python as setup_python_module


def _noop(*_args, **_kwargs):
    return None


def _create_fake_lerobot_setup_tree(project_root: Path) -> None:
    setup_dir = project_root / "modules" / "lerobot-vulcan" / "setup"
    setup_dir.mkdir(parents=True, exist_ok=True)
    (setup_dir / "setup.py").write_text("# fake lerobot setup file\n")


def _patch_loader(monkeypatch, captured: dict) -> None:
    class _FakeLoader:
        def exec_module(self, module):
            def fake_setup(*, desktop=False):
                captured["desktop"] = desktop
                captured["uv_python_during_setup"] = os.environ.get("UV_PYTHON")
                return True

            module.setup = fake_setup

    fake_spec = SimpleNamespace(loader=_FakeLoader())
    monkeypatch.setattr(
        setup_python_module.importlib.util,
        "spec_from_file_location",
        lambda *_args, **_kwargs: fake_spec,
    )
    monkeypatch.setattr(
        setup_python_module.importlib.util,
        "module_from_spec",
        lambda _spec: SimpleNamespace(),
    )


def test_setup_python_environment_sets_uv_python_to_312(monkeypatch, tmp_path):
    _create_fake_lerobot_setup_tree(tmp_path)
    captured = {}
    _patch_loader(monkeypatch, captured)
    monkeypatch.delenv("UV_PYTHON", raising=False)

    manager = PythonSetupManager(tmp_path, _noop, _noop, _noop, _noop)
    assert manager.setup_python_environment(desktop=True) is True

    assert captured["desktop"] is True
    assert captured["uv_python_during_setup"] == UV_VENV_PYTHON_VERSION
    assert "UV_PYTHON" not in os.environ


def test_setup_python_environment_restores_existing_uv_python(monkeypatch, tmp_path):
    _create_fake_lerobot_setup_tree(tmp_path)
    captured = {}
    _patch_loader(monkeypatch, captured)
    monkeypatch.setenv("UV_PYTHON", "3.11")

    manager = PythonSetupManager(tmp_path, _noop, _noop, _noop, _noop)
    assert manager.setup_python_environment() is True

    assert captured["uv_python_during_setup"] == UV_VENV_PYTHON_VERSION
    assert os.environ["UV_PYTHON"] == "3.11"
