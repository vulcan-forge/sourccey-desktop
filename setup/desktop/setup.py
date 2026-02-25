#!/usr/bin/env python3
"""
Sourccey Desktop Setup Script

This script sets up the development environment for the Sourccey Desktop app.
It validates project structure, ensures required tooling exists, and then
initializes project dependencies.
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional, Tuple

project_root = Path(__file__).parent.parent.parent
shared_dir = Path(__file__).parent.parent / "shared"
if str(shared_dir) not in sys.path:
    sys.path.insert(0, str(shared_dir))

from setup_git import GitSetupManager  # type: ignore
from setup_javascript import JavaScriptSetupManager  # type: ignore
from setup_python import PythonSetupManager  # type: ignore
from setup_rust import RustSetupManager  # type: ignore


class Colors:
    """ANSI color codes for terminal output"""

    SUPPORTS_COLOR = (
        hasattr(sys.stdout, "isatty")
        and sys.stdout.isatty()
        and os.environ.get("TERM") != "dumb"
        and os.environ.get("NO_COLOR") is None
    )

    RED = "\033[0;31m" if SUPPORTS_COLOR else ""
    GREEN = "\033[0;32m" if SUPPORTS_COLOR else ""
    YELLOW = "\033[1;33m" if SUPPORTS_COLOR else ""
    BLUE = "\033[0;34m" if SUPPORTS_COLOR else ""
    CYAN = "\033[0;36m" if SUPPORTS_COLOR else ""
    NC = "\033[0m" if SUPPORTS_COLOR else ""


class SetupScript:
    def __init__(self):
        self.project_root = project_root
        self.errors = []
        self.warnings = []
        self.system = platform.system()

        self.python_manager = PythonSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )
        self.javascript_manager = JavaScriptSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )
        self.rust_manager = RustSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )
        self.git_manager = GitSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )

    #################################################################
    # Print functions
    #################################################################

    def print_status(self, message: str, color: str = Colors.BLUE):
        print(f"{color}[INFO]{Colors.NC} {message}")

    def print_success(self, message: str):
        print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")

    def print_warning(self, message: str):
        print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")
        self.warnings.append(message)

    def print_error(self, message: str):
        print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")
        self.errors.append(message)

    def print_header(self, message: str):
        print(f"\n{Colors.CYAN}{'=' * 60}{Colors.NC}")
        print(f"{Colors.CYAN}{message.center(60)}{Colors.NC}")
        print(f"{Colors.CYAN}{'=' * 60}{Colors.NC}\n")

    #################################################################
    # Check / ensure functions
    #################################################################

    def check_python_version(self) -> bool:
        return self.python_manager.check_python_version()

    def check_git(self) -> bool:
        return self.git_manager.check_git_installed()

    def check_uv(self) -> bool:
        return self.python_manager.check_uv()

    def ensure_bun(self) -> bool:
        return self.javascript_manager.ensure_bun()

    def ensure_rust(self) -> bool:
        return self.rust_manager.ensure_rust()

    def check_project_structure(self) -> bool:
        self.print_status("Checking project structure...")

        required_files = ["package.json", "src-tauri/Cargo.toml"]
        required_dirs = ["src", "src-tauri"]

        missing_files = [
            file_path
            for file_path in required_files
            if not (self.project_root / file_path).exists()
        ]
        missing_dirs = [
            dir_path for dir_path in required_dirs if not (self.project_root / dir_path).exists()
        ]

        if missing_files or missing_dirs:
            self.print_error("Project structure is incomplete:")
            for file_path in missing_files:
                self.print_error(f"  Missing file: {file_path}")
            for dir_path in missing_dirs:
                self.print_error(f"  Missing directory: {dir_path}")
            self.print_error("Run this script from the sourccey-desktop repository.")
            return False

        modules_dir = self.project_root / "modules"
        if not modules_dir.exists():
            self.print_status("Creating modules directory...")
            modules_dir.mkdir(parents=True, exist_ok=True)
            self.print_success("Modules directory created")

        self.print_success("Project structure is correct")
        return True

    def ensure_linux_tauri_prerequisites(self) -> bool:
        """Ensure Linux-only system dependencies needed for Rust/Tauri builds are available."""
        if self.system != "Linux":
            return True

        self.print_status("Checking Linux system dependencies for Tauri/Rust builds...")

        pkg_config_path = shutil.which("pkg-config")
        missing_dependencies = self.get_missing_linux_tauri_dependencies(pkg_config_path)

        if not missing_dependencies:
            self.print_success("Linux build dependencies are installed")
            return True

        self.print_warning(
            f"Missing Linux build dependencies: {', '.join(missing_dependencies)}"
        )

        package_manager, packages = self.get_linux_package_install_target()
        if not package_manager or not packages:
            self.print_error("Unsupported Linux package manager for auto-install.")
            self.print_error("Install these packages manually, then rerun setup:")
            self.print_error("  - pkg-config")
            self.print_error("  - OpenSSL development package (e.g., libssl-dev)")
            self.print_error("  - GLib/GTK/WebKitGTK development packages")
            return False

        install_cmd = self.get_linux_install_command(package_manager, packages)
        if not install_cmd:
            self.print_error(f"Could not build install command for {package_manager}.")
            return False

        if hasattr(os, "geteuid") and os.geteuid() != 0:
            install_cmd = ["sudo"] + install_cmd

        self.print_status(
            f"Installing Linux dependencies with {package_manager}: {' '.join(packages)}"
        )
        try:
            subprocess.run(install_cmd, check=True)
        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to install Linux dependencies (exit code {e.returncode}).")
            self.print_error("Please install dependencies manually and rerun setup.")
            self.print_error(
                f"Suggested command: {' '.join(self.get_linux_install_command(package_manager, packages))}"
            )
            return False
        except OSError as e:
            self.print_error(f"Failed to execute install command: {e}")
            return False

        pkg_config_path = shutil.which("pkg-config")
        missing_after_install = self.get_missing_linux_tauri_dependencies(pkg_config_path)
        if missing_after_install:
            self.print_error("Linux dependencies were installed, but some libraries are still missing.")
            self.print_error(
                f"Missing after install: {', '.join(missing_after_install)}"
            )
            self.print_error(
                "Verify pkg-config output with: pkg-config --libs --cflags glib-2.0 gtk+-3.0 openssl"
            )
            return False

        self.print_success("Linux dependencies installed successfully")
        return True

    def get_missing_linux_tauri_dependencies(self, pkg_config_path: Optional[str]) -> list:
        """Return user-friendly missing dependency descriptions for Linux Tauri builds."""
        missing_dependencies = []

        if not pkg_config_path:
            missing_dependencies.append("pkg-config")
            # Without pkg-config we cannot reliably validate .pc-backed libraries.
            return missing_dependencies

        if not self.pkg_config_has_module(pkg_config_path, "openssl"):
            missing_dependencies.append("OpenSSL development files")
        if not self.pkg_config_has_module(pkg_config_path, "glib-2.0", min_version="2.70"):
            missing_dependencies.append("GLib development files (glib-2.0 >= 2.70)")
        if not self.pkg_config_has_module(pkg_config_path, "gtk+-3.0"):
            missing_dependencies.append("GTK3 development files")
        if not self.pkg_config_has_module(pkg_config_path, "webkit2gtk-4.1"):
            missing_dependencies.append("WebKitGTK development files (webkit2gtk-4.1)")
        if not self.pkg_config_has_module(pkg_config_path, "javascriptcoregtk-4.1"):
            missing_dependencies.append("JavaScriptCoreGTK development files (javascriptcoregtk-4.1)")
        if not self.pkg_config_has_module(pkg_config_path, "libsoup-3.0"):
            missing_dependencies.append("libsoup3 development files")

        return missing_dependencies

    def pkg_config_has_module(
        self,
        pkg_config_path: str,
        module_name: str,
        min_version: Optional[str] = None,
    ) -> bool:
        """Check whether pkg-config can resolve a module (optionally with minimum version)."""
        command = [pkg_config_path, "--exists"]
        if min_version:
            command.append(f"--atleast-version={min_version}")
        command.append(module_name)
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
        )
        return result.returncode == 0

    def get_linux_package_install_target(self) -> Tuple[Optional[str], list]:
        """Detect Linux package manager and return package names for Tauri Linux build requirements."""
        if shutil.which("apt-get"):
            return "apt-get", [
                "build-essential",
                "pkg-config",
                "libssl-dev",
                "libglib2.0-dev",
                "libgtk-3-dev",
                "libayatana-appindicator3-dev",
                "libsoup-3.0-dev",
                "librsvg2-dev",
                "libwebkit2gtk-4.1-dev",
                "patchelf",
            ]
        if shutil.which("dnf"):
            return "dnf", [
                "gcc",
                "gcc-c++",
                "make",
                "pkgconf-pkg-config",
                "openssl-devel",
                "glib2-devel",
                "gtk3-devel",
                "libappindicator-gtk3-devel",
                "libsoup3-devel",
                "librsvg2-devel",
                "webkit2gtk4.1-devel",
                "patchelf",
            ]
        if shutil.which("yum"):
            return "yum", [
                "gcc",
                "gcc-c++",
                "make",
                "pkgconf-pkg-config",
                "openssl-devel",
                "glib2-devel",
                "gtk3-devel",
                "libappindicator-gtk3-devel",
                "libsoup3-devel",
                "librsvg2-devel",
                "webkit2gtk4.1-devel",
                "patchelf",
            ]
        if shutil.which("pacman"):
            return "pacman", [
                "base-devel",
                "pkgconf",
                "openssl",
                "glib2",
                "gtk3",
                "libappindicator-gtk3",
                "libsoup3",
                "librsvg",
                "webkit2gtk-4.1",
                "patchelf",
            ]
        if shutil.which("zypper"):
            return "zypper", [
                "gcc",
                "gcc-c++",
                "make",
                "pkgconf-pkg-config",
                "libopenssl-devel",
                "glib2-devel",
                "gtk3-devel",
                "libayatana-appindicator3-devel",
                "libsoup-3_0-devel",
                "librsvg-devel",
                "webkit2gtk3-devel",
                "patchelf",
            ]
        return None, []

    def get_linux_install_command(self, package_manager: str, packages: list) -> list:
        """Build package-manager-specific install command."""
        if package_manager == "apt-get":
            return ["apt-get", "install", "-y"] + packages
        if package_manager in {"dnf", "yum"}:
            return [package_manager, "install", "-y"] + packages
        if package_manager == "pacman":
            return ["pacman", "-Sy", "--noconfirm", "--needed"] + packages
        if package_manager == "zypper":
            return ["zypper", "--non-interactive", "install", "--no-recommends"] + packages
        return []

    #################################################################
    # Setup functions
    #################################################################

    def setup_git_submodules(self, use_https: bool = False) -> bool:
        return self.git_manager.setup_git_submodules(use_https=use_https)

    def setup_python_environment(self) -> bool:
        return self.python_manager.setup_python_environment(desktop=True)

    def setup_bun_packages(self) -> bool:
        return self.javascript_manager.install_packages()

    #################################################################
    # Summary and main functions
    #################################################################

    def print_summary(self):
        self.print_header("SETUP SUMMARY")

        if self.errors:
            self.print_error(f"Setup completed with {len(self.errors)} error(s):")
            for error in self.errors:
                print(f"  - {error}")
            print()

        if self.warnings:
            self.print_warning(f"Setup completed with {len(self.warnings)} warning(s):")
            for warning in self.warnings:
                print(f"  - {warning}")
            print()

        if not self.errors:
            self.print_success("Setup completed successfully.")
            print()
            self.print_status("You can now start developing with:")
            self.print_status("  - Desktop app: bun tauri dev")
            self.print_status("If Bun was just installed, reload your terminal or run: source ~/.zshrc")
            print()

    def run(self, use_https: bool = False) -> bool:
        self.print_header("SOURCCEY DESKTOP SETUP")

        self.print_header("CHECKING SYSTEM REQUIREMENTS")

        required_checks = [
            self.check_project_structure(),
            self.check_python_version(),
            self.check_git(),
        ]

        # Optional tool, do not fail setup if missing.
        self.check_uv()

        if not all(required_checks):
            self.print_error("System requirements check failed.")
            return False

        if not self.ensure_bun():
            self.print_error("Bun setup failed.")
            return False

        if not self.ensure_rust():
            self.print_error("Rust setup failed.")
            return False

        if not self.ensure_linux_tauri_prerequisites():
            self.print_error("Linux dependency setup failed.")
            return False

        self.print_header("SETTING UP PROJECT")

        if not self.setup_git_submodules(use_https=use_https):
            self.print_error("Git submodule setup failed.")

            if not use_https:
                self.print_error("")
                self.print_error("This might be due to SSH connectivity issues.")
                self.print_error("Try running setup with HTTPS instead:")
                self.print_error("")
                self.print_error("  python3 setup/desktop/setup.py --use-https")
                self.print_error("")
                self.print_error("This will use HTTPS URLs instead of SSH for git operations.")
            else:
                self.print_error("Git submodule setup failed even with HTTPS.")
                self.print_error("Check your internet connection and try again.")
            return False

        setup_steps = [
            self.setup_python_environment(),
            self.setup_bun_packages(),
        ]
        if not all(setup_steps):
            self.print_error("Project setup failed.")
            return False

        self.print_summary()
        return len(self.errors) == 0


################################################################
# Main function
################################################################


def setup(use_https: bool = False):
    setup_script = SetupScript()
    return setup_script.run(use_https=use_https)


def main():
    parser = argparse.ArgumentParser(description="Sourccey Desktop Setup")
    parser.add_argument(
        "--use-https",
        action="store_true",
        default=False,
        help="Force HTTPS URLs instead of SSH for git operations",
    )
    args = parser.parse_args()

    setup_script = SetupScript()
    success = setup_script.run(use_https=args.use_https)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
