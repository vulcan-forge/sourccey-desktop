from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from setup.kiosk.components.setup_password import (
    PASSWORD_HELPER,
    PASSWORD_HELPER_PATH,
    SUDOERS_PATH,
    configure_password_update_permission,
)


def _noop(*_args, **_kwargs):
    return None


def test_configures_narrow_passwordless_chpasswd_permission():
    written = {}

    def write_file_as_root(path, content, mode=0o644, executable=False):
        written[path] = {"content": content, "mode": mode, "executable": executable}
        return True

    assert configure_password_update_permission("sourccey", _noop, _noop, _noop, write_file_as_root)
    assert written[PASSWORD_HELPER_PATH] == {
        "content": PASSWORD_HELPER,
        "mode": 0o755,
        "executable": True,
    }
    assert written[SUDOERS_PATH] == {
        "content": f"sourccey ALL=(root) NOPASSWD: {PASSWORD_HELPER_PATH}\n",
        "mode": 0o440,
        "executable": False,
    }


def test_rejects_usernames_that_could_change_sudoers_syntax():
    writes = []

    assert not configure_password_update_permission(
        "sourccey ALL=(ALL) NOPASSWD: ALL",
        _noop,
        _noop,
        _noop,
        lambda *args, **kwargs: writes.append((args, kwargs)) or True,
    )
    assert writes == []
