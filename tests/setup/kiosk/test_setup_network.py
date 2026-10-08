from setup.kiosk.components.setup_system import SystemPackageInstaller
from setup.kiosk.components.setup_network import (
    NETWORKMANAGER_ACTIONS,
    POLKIT_RULES_PATH,
    configure_networkmanager_permission,
)


def installer_with_stubbed_system(apt_install):
    noop = lambda *_: None
    installer = SystemPackageInstaller(noop, noop, noop, noop, apt_install)
    installer._safe_update_system = lambda: True
    installer.install_x11_packages = lambda: True
    installer.install_tauri_dependencies = lambda: True
    return installer


def test_kiosk_setup_provisions_networkmanager_and_dhcp():
    installed = []
    installer = installer_with_stubbed_system(lambda packages: installed.extend(packages) or True)
    assert installer.install_all()
    assert "network-manager" in installed
    assert "dnsmasq-base" in installed


def test_kiosk_setup_does_not_report_success_if_network_dependencies_fail():
    installer = installer_with_stubbed_system(lambda _: False)
    assert not installer.install_all()


def test_configures_narrow_networkmanager_polkit_permission():
    written = {}
    noop = lambda *_: None

    def write_file_as_root(path, content, mode=0o644, executable=False):
        written[path] = {"content": content, "mode": mode, "executable": executable}
        return True

    assert configure_networkmanager_permission(
        "sourccey", noop, noop, noop, write_file_as_root
    )
    rule = written[POLKIT_RULES_PATH]
    assert rule["mode"] == 0o644
    assert rule["executable"] is False
    assert 'subject.user == "sourccey"' in rule["content"]
    for action in NETWORKMANAGER_ACTIONS:
        assert action in rule["content"]
    assert "org.freedesktop.NetworkManager.*" not in rule["content"]


def test_rejects_invalid_networkmanager_permission_username():
    writes = []
    noop = lambda *_: None

    assert not configure_networkmanager_permission(
        'sourccey" || true',
        noop,
        noop,
        noop,
        lambda *args, **kwargs: writes.append((args, kwargs)) or True,
    )
    assert writes == []
