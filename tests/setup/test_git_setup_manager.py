from __future__ import annotations

import stat
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
SETUP_SHARED_ROOT = REPO_ROOT / "setup" / "shared"
if str(SETUP_SHARED_ROOT) not in sys.path:
    sys.path.insert(0, str(SETUP_SHARED_ROOT))

from setup.shared.setup_git import GitSetupManager


def _noop(*_args, **_kwargs):
    return None


def _create_manager(project_root: Path) -> GitSetupManager:
    return GitSetupManager(project_root, _noop, _noop, _noop, _noop)


def test_remove_path_handles_readonly_files(tmp_path):
    manager = _create_manager(tmp_path)
    stale_dir = tmp_path / "stale"
    stale_dir.mkdir()
    locked_file = stale_dir / "file.txt"
    locked_file.write_text("content")
    locked_file.chmod(stat.S_IREAD)

    manager._remove_path(stale_dir)

    assert not stale_dir.exists()


def test_update_git_submodules_skips_cleanup_for_valid_repo(monkeypatch, tmp_path):
    manager = _create_manager(tmp_path)
    calls = []

    monkeypatch.setattr(manager, "_is_valid_submodule_repo", lambda _path: True)
    monkeypatch.setattr(
        manager,
        "cleanup_stale_submodule_checkout",
        lambda _path: calls.append("cleanup") or False,
    )
    monkeypatch.setattr(
        manager,
        "run_git_command_with_progress",
        lambda *args, **kwargs: True,
    )
    monkeypatch.setattr(manager, "_is_submodule_at_recorded_commit", lambda _path: True)

    assert manager.update_git_submodules() is True
    assert calls == []
