#!/usr/bin/env python3
"""
System Dependencies Module for Sourccey Kiosk

Handles installation of system packages and dependencies.
"""
import subprocess
import os
from typing import Callable
class SystemPackageInstaller:
    def __init__(self, print_status: Callable, print_success: Callable,
                 print_error: Callable, print_warning: Callable, apt_install: Callable):
        self.print_status = print_status
        self.print_success = print_success
        self.print_error = print_error
        self.print_warning = print_warning
        self.apt_install = apt_install

    def update_system(self) -> bool:
        """Update system packages"""
        self.print_status("Updating system packages...")

        env = os.environ.copy()
        env["DEBIAN_FRONTEND"] = "noninteractive"

        update_cmd = ["sudo", "apt-get", "update"]
        update_result = subprocess.run(
            update_cmd,
            capture_output=True,
            text=True,
            timeout=1200,
            env=env,
        )
        if update_result is None or update_result.returncode != 0:
            self.print_error("Failed to update package lists")
            return False

        upgrade_cmd = ["sudo", "apt-get", "upgrade", "-y", "--no-install-recommends"]
        upgrade_result = subprocess.run(
            upgrade_cmd,
            capture_output=True,
            text=True,
            timeout=1800,
            env=env,
        )
        if upgrade_result is None or upgrade_result.returncode != 0:
            self.print_error("Failed to upgrade system")
            self.print_status(f"Upgrade output: {upgrade_result.stdout}")
            self.print_error(f"Upgrade error: {upgrade_result.stderr}")
            self.print_warning("Common fixes: run 'sudo dpkg --configure -a' and 'sudo apt-get -f install'.")
            return False

        self.print_success("System updated")
        return True
    
    def _safe_update_system(self) -> bool:
        try:
            return self.update_system()
        except subprocess.TimeoutExpired:
            self.print_error("System update timed out. Re-run with --skip-system and update manually.")
            return False
        except Exception as e:
            self.print_error(f"System update failed: {e}")
            return False

    def install_x11_packages(self) -> bool:
        """Install X11, Openbox, and LightDM"""
        self.print_status("Installing X11, Openbox, and LightDM...")
        packages = ["xserver-xorg", "xinit", "openbox", "lightdm"]

        if self.apt_install(packages):
            self.print_success("X11 packages installed")
            return True
        return False

    def install_tauri_dependencies(self) -> bool:
        """Install Tauri build dependencies"""
        self.print_status("Installing Tauri build dependencies...")
        packages = [
            "build-essential", "pkg-config", "libssl-dev",
            "libgtk-3-dev", "libayatana-appindicator3-dev", "librsvg2-dev",
            "libwebkit2gtk-4.1-0", "libwebkit2gtk-4.1-dev",
            "patchelf"
        ]

        if self.apt_install(packages):
            self.print_success("Tauri dependencies installed")
            return True
        return False

    def install_all(self) -> bool:
        """Install all system dependencies"""
        if not self._safe_update_system():
            return False

        if not self.install_x11_packages():
            return False

        if not self.install_tauri_dependencies():
            return False

        return True

def install_system_packages(print_status, print_success, print_error,
                           print_warning, apt_install) -> bool:
    """Convenience function for installing system packages"""
    installer = SystemPackageInstaller(
        print_status, print_success, print_error, print_warning, apt_install
    )
    return installer.install_all()
