from __future__ import annotations

import stat
import sys
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
SETUP_SHARED_ROOT = REPO_ROOT / "setup" / "shared"
if str(SETUP_SHARED_ROOT) not in sys.path:
    sys.path.insert(0, str(SETUP_SHARED_ROOT))

from setup.shared.setup_git import GitProgressTracker, GitSetupManager


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


def test_progress_preserves_git_failure_details():
    messages = []
    tracker = GitProgressTracker("clone", messages.append, messages.append)
    for line in (
        "remote: Repository not found.",
        "fatal: Authentication failed",
        "error: could not lock config file: Permission denied",
    ):
        tracker.update_progress(line)
        assert messages[-1] == line


def test_failed_update_is_not_masked_by_healthy_lerobot(monkeypatch, tmp_path):
    manager = _create_manager(tmp_path)
    monkeypatch.setattr(manager, "_is_valid_submodule_repo", lambda _path: True)
    monkeypatch.setattr(manager, "_is_submodule_at_recorded_commit", lambda _path: True)
    monkeypatch.setattr(manager, "run_git_command_with_progress", lambda *a, **kw: False)
    assert manager.update_git_submodules() is False


def test_init_registers_new_submodules_even_when_lerobot_is_initialized(monkeypatch, tmp_path):
    manager = _create_manager(tmp_path)
    commands = []
    monkeypatch.setattr(manager, "_is_submodule_initialized", lambda _path: True)
    monkeypatch.setattr(
        manager, "run_git_command_with_progress",
        lambda command, *a, **kw: commands.append(command) or True,
    )
    assert manager.initialize_git_submodules() is True
    assert commands == [["git", "submodule", "init"]]


def test_kiosk_selection_applies_to_all_submodule_commands(tmp_path):
    manager = GitSetupManager(
        tmp_path, _noop, _noop, _noop, _noop,
        submodule_paths=["modules/lerobot-vulcan"],
    )
    for args in (("status",), ("init",), ("sync", "--recursive"),
                 ("update", "--init", "--recursive")):
        assert manager._submodule_command(*args) == [
            "git", "submodule", *args, "--", "modules/lerobot-vulcan",
        ]


def test_default_selection_includes_all_submodules(tmp_path):
    manager = _create_manager(tmp_path)
    assert manager._submodule_command("update", "--init", "--recursive") == [
        "git", "submodule", "update", "--init", "--recursive",
    ]


def test_reads_lerobot_release_tag_from_manifest(tmp_path):
    manager = _create_manager(tmp_path)
    manifest_path = tmp_path / "public" / "latest.json"
    manifest_path.parent.mkdir()
    manifest_path.write_text(json.dumps({
        "modules": {"lerobot-vulcan": {"tag": "vulcan/0.1.14"}},
    }))

    assert manager.get_configured_submodule_tag(
        "modules/lerobot-vulcan"
    ) == "vulcan/0.1.14"


def test_rejects_invalid_lerobot_release_tag(tmp_path):
    manager = _create_manager(tmp_path)
    manifest_path = tmp_path / "public" / "latest.json"
    manifest_path.parent.mkdir()
    manifest_path.write_text(json.dumps({
        "modules": {"lerobot-vulcan": {"tag": "main"}},
    }))

    assert manager.get_configured_submodule_tag("modules/lerobot-vulcan") is None


def test_setup_checks_out_manifest_release(monkeypatch, tmp_path):
    manager = _create_manager(tmp_path)
    calls = []
    for method_name in (
        "check_git_installed",
        "ensure_git_lfs",
        "sync_git_submodules",
        "initialize_git_submodules",
        "handle_submodule_changes",
        "update_git_submodules",
    ):
        monkeypatch.setattr(manager, method_name, lambda: True)
    monkeypatch.setattr(
        manager,
        "get_configured_submodule_tag",
        lambda path: calls.append(("manifest", path)) or "vulcan/0.1.14",
    )
    monkeypatch.setattr(
        manager,
        "checkout_submodule_tag",
        lambda path, tag: calls.append(("checkout", path, tag)) or True,
    )
    monkeypatch.setattr(manager, "notify_stashed_changes", lambda: None)
    monkeypatch.setattr(manager, "restore_stashed_changes", lambda: None)

    assert manager.setup_git_submodules() is True
    assert calls == [
        ("manifest", "modules/lerobot-vulcan"),
        ("checkout", "modules/lerobot-vulcan", "vulcan/0.1.14"),
    ]
