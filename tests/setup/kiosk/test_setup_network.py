from setup.kiosk.components.setup_system import SystemPackageInstaller


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
