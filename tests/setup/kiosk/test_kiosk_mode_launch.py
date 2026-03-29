from types import SimpleNamespace
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from setup.kiosk.components.setup_lightdm import LightDMConfigurator
from setup.kiosk.components.setup_session import setup_session_files


def _noop(*_args, **_kwargs):
    return None


def test_session_files_use_stable_session_name_and_kiosk_flag():
    written = {}

    def write_file_as_root(path, content, mode=0o644, executable=False):
        written[path] = {
            "content": content,
            "mode": mode,
            "executable": executable,
        }
        return True

    ok = setup_session_files(
        binary_name="VulcanStudio",
        package_name="vulcan-studio",
        session_name="vulcan-studio-openbox",
        print_status=_noop,
        print_success=_noop,
        print_error=_noop,
        write_file_as_root=write_file_as_root,
    )

    assert ok is True
    assert "/usr/share/xsessions/vulcan-studio-openbox.desktop" in written
    assert "/usr/local/bin/vulcan-studio-openbox" in written

    desktop_entry = written["/usr/share/xsessions/vulcan-studio-openbox.desktop"]["content"]
    launcher = written["/usr/local/bin/vulcan-studio-openbox"]["content"]

    assert "Exec=/usr/local/bin/vulcan-studio-openbox" in desktop_entry
    assert 'export SOURCCEY_APP_MODE="kiosk"' in launcher
    assert "sourccey-kiosk-launch.log" in launcher
    assert 'exec "$APP_BIN" --kiosk' in launcher


def test_lightdm_main_config_uses_session_name(monkeypatch):
    captured = {}

    def fake_run(cmd, **_kwargs):
        captured["cmd"] = cmd
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr("setup.kiosk.components.setup_lightdm.subprocess.run", fake_run)

    configurator = LightDMConfigurator(
        print_status=_noop,
        print_success=_noop,
        print_warning=_noop,
        print_error=_noop,
        write_file_as_root=lambda *_args, **_kwargs: True,
    )

    ok = configurator.configure_main_config("pi", "vulcan-studio-openbox")

    assert ok is True
    cmd = captured["cmd"]
    assert "autologin-user=pi" in cmd
    assert "autologin-session=vulcan-studio-openbox" in cmd
    assert "user-session=vulcan-studio-openbox" in cmd


def test_lightdm_dropin_uses_session_name(monkeypatch):
    written = {}

    def fake_run(*_args, **_kwargs):
        return SimpleNamespace(returncode=0, stderr="")

    def fake_write_file_as_root(path, content, mode=0o644, executable=False):
        written[path] = {
            "content": content,
            "mode": mode,
            "executable": executable,
        }
        return True

    monkeypatch.setattr("setup.kiosk.components.setup_lightdm.subprocess.run", fake_run)

    configurator = LightDMConfigurator(
        print_status=_noop,
        print_success=_noop,
        print_warning=_noop,
        print_error=_noop,
        write_file_as_root=fake_write_file_as_root,
    )

    ok = configurator.create_dropin_config("pi", "vulcan-studio-openbox")

    assert ok is True
    path = "/etc/lightdm/lightdm.conf.d/99-vulcan-studio-openbox-kiosk.conf"
    assert path in written
    content = written[path]["content"]
    assert "autologin-session=vulcan-studio-openbox" in content
    assert "user-session=vulcan-studio-openbox" in content
