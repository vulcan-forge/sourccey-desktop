#!/usr/bin/env python3
"""
Sourccey Desktop Dev Setup Script

This module prepares the desktop developer environment.
Launching the desktop Tauri app is optional and opt-in.
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

if not hasattr(os, "geteuid"):
    os.geteuid = lambda: 1  # type: ignore[attr-defined]

project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

shared_dir = project_root / "setup" / "shared"
if str(shared_dir) not in sys.path:
    sys.path.insert(0, str(shared_dir))

from setup.shared.setup_git import GitSetupManager  # type: ignore
from setup.shared.setup_javascript import JavaScriptSetupManager  # type: ignore
from setup.shared.setup_python import PythonSetupManager  # type: ignore
from setup.shared.setup_rust import RustSetupManager  # type: ignore
from setup.shared.setup_helper import wrap_command  # type: ignore
from setup.shared.setup_javascript import get_bun_path  # type: ignore

LEROBOT_VULCAN_SUBMODULE_PATH = "modules/lerobot-vulcan"
LEROBOT_VULCAN_TAG = "vulcan/0.1.10"


class Colors:
    """ANSI color codes for terminal output."""

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


class DesktopDevSetupScript:
    """Developer-focused desktop setup that can launch Tauri dev mode."""

    LINUX_INOTIFY_LIMITS = {
        "max_user_watches": 524288,
        "max_user_instances": 1024,
    }

    def __init__(self):
        self.project_root = project_root
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.system = platform.system()
        callbacks = (
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )
        self.python_manager = PythonSetupManager(self.project_root, *callbacks)
        self.javascript_manager = JavaScriptSetupManager(self.project_root, *callbacks)
        self.rust_manager = RustSetupManager(self.project_root, *callbacks)
        self.git_manager = GitSetupManager(self.project_root, *callbacks)

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

    def check_project_structure(self) -> bool:
        required = ["package.json", "src-tauri/Cargo.toml", "src", "src-tauri"]
        missing = [item for item in required if not (self.project_root / item).exists()]
        if missing:
            for item in missing:
                self.print_error(f"Missing project path: {item}")
            return False
        (self.project_root / "modules").mkdir(parents=True, exist_ok=True)
        self.print_success("Project structure is correct")
        return True

    def check_python_version(self) -> bool:
        return self.python_manager.check_python_version()

    def check_git(self) -> bool:
        return self.git_manager.check_git_installed()

    def ensure_uv(self) -> bool:
        return self.python_manager.ensure_uv()

    def ensure_bun(self) -> bool:
        return self.javascript_manager.ensure_bun()

    def ensure_rust(self) -> bool:
        return self.rust_manager.ensure_rust()

    def setup_git_submodules(self, use_https: bool = False) -> bool:
        return self.git_manager.setup_git_submodules(use_https=use_https)

    def setup_python_environment(self) -> bool:
        return self.python_manager.setup_python_environment(desktop=True)

    def setup_bun_packages(self) -> bool:
        return self.javascript_manager.install_packages()

    def _linux_packages(self) -> tuple[Optional[str], list[str]]:
        packages = {
            "apt-get": ["build-essential", "pkg-config", "libssl-dev", "libglib2.0-dev", "libgtk-3-dev", "libayatana-appindicator3-dev", "libsoup-3.0-dev", "librsvg2-dev", "libwebkit2gtk-4.1-dev", "patchelf"],
            "dnf": ["gcc", "gcc-c++", "make", "pkgconf-pkg-config", "openssl-devel", "glib2-devel", "gtk3-devel", "libappindicator-gtk3-devel", "libsoup3-devel", "librsvg2-devel", "webkit2gtk4.1-devel", "patchelf"],
            "yum": ["gcc", "gcc-c++", "make", "pkgconf-pkg-config", "openssl-devel", "glib2-devel", "gtk3-devel", "libappindicator-gtk3-devel", "libsoup3-devel", "librsvg2-devel", "webkit2gtk4.1-devel", "patchelf"],
            "pacman": ["base-devel", "pkgconf", "openssl", "glib2", "gtk3", "libappindicator-gtk3", "libsoup3", "librsvg", "webkit2gtk-4.1", "patchelf"],
            "zypper": ["gcc", "gcc-c++", "make", "pkgconf-pkg-config", "libopenssl-devel", "glib2-devel", "gtk3-devel", "libayatana-appindicator3-devel", "libsoup-3_0-devel", "librsvg-devel", "webkit2gtk3-devel", "patchelf"],
        }
        for manager, names in packages.items():
            if shutil.which(manager):
                return manager, names
        return None, []

    def _missing_linux_dependencies(self) -> list[str]:
        pkg_config = shutil.which("pkg-config")
        if not pkg_config:
            return ["pkg-config"]
        requirements = [
            ("openssl", None), ("glib-2.0", "2.70"), ("gtk+-3.0", None),
            ("webkit2gtk-4.1", None), ("javascriptcoregtk-4.1", None),
            ("libsoup-3.0", None),
        ]
        missing = []
        for module, minimum in requirements:
            command = [pkg_config, "--exists"]
            if minimum:
                command.append(f"--atleast-version={minimum}")
            command.append(module)
            if subprocess.run(command, check=False).returncode != 0:
                missing.append(module)
        return missing

    def ensure_linux_tauri_prerequisites(self) -> bool:
        if self.system != "Linux":
            return True
        missing = self._missing_linux_dependencies()
        if not missing:
            self.print_success("Linux build dependencies are installed")
            return True
        manager, packages = self._linux_packages()
        if not manager:
            self.print_error(f"Missing Linux dependencies: {', '.join(missing)}")
            return False
        if manager == "pacman":
            command = [manager, "-Sy", "--noconfirm", "--needed", *packages]
        elif manager == "zypper":
            command = [manager, "--non-interactive", "install", "--no-recommends", *packages]
        else:
            command = [manager, "install", "-y", *packages]
        if hasattr(os, "geteuid") and os.geteuid() != 0:
            command.insert(0, "sudo")
        try:
            subprocess.run(command, check=True)
        except (OSError, subprocess.CalledProcessError) as exc:
            self.print_error(f"Failed to install Linux dependencies: {exc}")
            return False
        if self._missing_linux_dependencies():
            self.print_error("Some Linux build dependencies are still unavailable")
            return False
        return True

    def current_python_command(self) -> str:
        """Return a friendly Python command name for rerun instructions."""
        return Path(sys.executable).name or "python"

    def ensure_env_file(self) -> bool:
        """Create a local .env from .env.example when missing."""
        env_file = self.project_root / ".env"
        if env_file.exists():
            self.print_success(".env file already exists")
            return True

        env_example = self.project_root / ".env.example"
        if not env_example.exists():
            self.print_error(".env.example not found; cannot create .env")
            return False

        try:
            shutil.copyfile(env_example, env_file)
        except OSError as exc:
            self.print_error(f"Failed to create .env from .env.example: {exc}")
            return False

        self.print_success("Created .env from .env.example")
        return True

    def ensure_desktop_tauri_prerequisites(self) -> bool:
        """Validate platform-specific prerequisites required for Tauri dev."""
        if self.system == "Darwin":
            return self.ensure_macos_tauri_prerequisites()
        if self.system == "Windows":
            return self.ensure_windows_tauri_prerequisites()
        return True

    def check_linux_inotify_limits(self) -> bool:
        """Warn when Linux file-watch limits are likely too low for Tauri dev."""
        if self.system != "Linux":
            return True

        low_limits = []
        for name, recommended in self.LINUX_INOTIFY_LIMITS.items():
            path = Path("/proc/sys/fs/inotify") / name
            try:
                current = int(path.read_text(encoding="utf-8").strip())
            except (OSError, ValueError):
                self.print_warning(f"Could not read Linux inotify limit: {path}")
                continue

            if current < recommended:
                low_limits.append(f"{name}={current} (recommended: {recommended})")

        if not low_limits:
            self.print_success("Linux file-watch limits are suitable for Tauri dev")
            return True

        self.print_warning(
            "Linux file-watch limits may cause 'OS file watch limit reached': "
            + ", ".join(low_limits)
        )
        self.print_status("Apply the recommended limits with:")
        print(
            "  printf 'fs.inotify.max_user_watches=524288\\n"
            "fs.inotify.max_user_instances=1024\\n' | "
            "sudo tee /etc/sysctl.d/99-sourccey-inotify.conf"
        )
        print("  sudo sysctl --system")
        return False

    def ensure_linux_inotify_limits(self) -> bool:
        """Persist suitable Linux file-watch limits for Tauri development."""
        if self.system != "Linux" or self.check_linux_inotify_limits():
            return True

        config = (
            "fs.inotify.max_user_watches=524288\n"
            "fs.inotify.max_user_instances=1024\n"
        )
        command_prefix = []
        if hasattr(os, "geteuid") and os.geteuid() != 0:
            command_prefix = ["sudo"]

        self.print_status("Applying persistent Linux file-watch limits (sudo may prompt)...")
        try:
            subprocess.run(
                [*command_prefix, "tee", "/etc/sysctl.d/99-sourccey-inotify.conf"],
                input=config,
                text=True,
                stdout=subprocess.DEVNULL,
                check=True,
            )
            subprocess.run(
                [*command_prefix, "sysctl", "--system"],
                check=True,
            )
        except (OSError, subprocess.CalledProcessError) as exc:
            self.print_error(f"Failed to configure Linux file-watch limits: {exc}")
            self.print_error("Run the commands shown above, then rerun setup.")
            return False

        if not self.check_linux_inotify_limits():
            self.print_error("Linux file-watch limits are still below the recommended values.")
            return False

        self.print_success("Linux file-watch limits configured successfully")
        return True

    def ensure_macos_tauri_prerequisites(self) -> bool:
        """Ensure Xcode command line tools are installed on macOS."""
        self.print_status("Checking macOS developer tools for Tauri...")

        try:
            result = subprocess.run(
                ["xcode-select", "-p"],
                check=False,
                capture_output=True,
                text=True,
            )
        except OSError as exc:
            self.print_error(f"Failed to check Xcode Command Line Tools: {exc}")
            return False

        if result.returncode == 0:
            self.print_success("Xcode Command Line Tools are installed")
            return True

        self.print_error("Xcode Command Line Tools are required for Tauri on macOS.")
        self.print_error("Install them with: xcode-select --install")
        return False

    def check_macos_keyboard_permissions(self) -> bool:
        """Warn and open macOS Accessibility settings when dev keyboard input is blocked."""
        if self.system != "Darwin":
            return True

        venv_python = (
            self.project_root
            / "modules"
            / "lerobot-vulcan"
            / ".venv"
            / "bin"
            / "python"
        )
        if not venv_python.exists():
            self.print_warning(
                "Could not check macOS keyboard permissions because the LeRobot .venv Python was not found."
            )
            return False

        try:
            resolved_python = venv_python.resolve()
        except OSError:
            resolved_python = venv_python

        trust_check = (
            "from pynput import keyboard; "
            "raise SystemExit(0 if getattr(keyboard.Listener, 'IS_TRUSTED', True) else 1)"
        )
        try:
            result = subprocess.run(
                [str(venv_python), "-c", trust_check],
                check=False,
                capture_output=True,
                text=True,
            )
        except OSError as exc:
            self.print_warning(f"Could not check macOS keyboard permissions: {exc}")
            return False

        if result.returncode == 0:
            self.print_success("macOS keyboard Accessibility permission is enabled")
            return True

        self.print_warning(
            "macOS keyboard teleoperation permission is required. "
            "In Privacy & Security > Accessibility, add and enable: "
            f"{resolved_python}"
        )
        self.print_status(
            "After granting permission, fully restart Sourccey Desktop and the terminal or IDE running dev mode."
        )

        try:
            subprocess.run(
                [
                    "open",
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
                ],
                check=False,
            )
            self.print_status("Opened macOS Accessibility settings.")
        except OSError as exc:
            self.print_warning(f"Could not open macOS Accessibility settings: {exc}")

        return False

    def _find_windows_vswhere(self) -> Optional[Path]:
        """Locate vswhere.exe when available."""
        candidate_paths = [
            Path(os.environ.get("ProgramFiles(x86)", "")) / "Microsoft Visual Studio" / "Installer" / "vswhere.exe",
            Path(os.environ.get("ProgramFiles", "")) / "Microsoft Visual Studio" / "Installer" / "vswhere.exe",
        ]

        for candidate in candidate_paths:
            if candidate.exists():
                return candidate

        resolved = shutil.which("vswhere")
        if resolved:
            return Path(resolved)

        return None

    def ensure_windows_tauri_prerequisites(self) -> bool:
        """Ensure the Windows C++ build tools required by Rust/Tauri exist."""
        self.print_status("Checking Windows build tools for Tauri...")

        if shutil.which("cl"):
            self.print_success("MSVC C++ build tools are available")
            return True

        vswhere_path = self._find_windows_vswhere()
        if vswhere_path:
            try:
                result = subprocess.run(
                    [
                        str(vswhere_path),
                        "-latest",
                        "-requires",
                        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
                        "-property",
                        "installationPath",
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                )
            except OSError as exc:
                self.print_error(f"Failed to inspect Visual Studio Build Tools: {exc}")
                return False

            if result.returncode == 0 and result.stdout.strip():
                self.print_success("Visual Studio Build Tools are installed")
                return True

        self.print_error("Microsoft C++ Build Tools are required for Tauri on Windows.")
        self.print_error(
            "Install 'Desktop development with C++' in Visual Studio Build Tools, then rerun setup."
        )
        return False

    def build_tauri_dev_command(self) -> list[str]:
        """Build the cross-platform desktop dev command."""
        return [get_bun_path(), "run", "tauri", "dev"]

    def run_desktop_dev(self) -> bool:
        """Launch the desktop app in Tauri dev mode."""
        self.print_status("Starting desktop development mode...")
        self.print_status("Press Ctrl+C to exit")

        command = self.build_tauri_dev_command()
        env = os.environ.copy()
        wrapped_cmd, actual_cwd = wrap_command(command, self.project_root)

        try:
            result = subprocess.run(
                wrapped_cmd,
                cwd=actual_cwd,
                env=env,
            )
            return result.returncode == 0
        except KeyboardInterrupt:
            self.print_status("\nReceived interrupt signal, exiting...")
            return True
        except Exception as exc:
            self.print_error(f"Failed to start desktop dev: {exc}")
            return False

    def print_summary(self, launch: bool = False):
        self.print_header("SETUP SUMMARY")

        if self.errors:
            self.print_error(f"Setup completed with {len(self.errors)} error(s):")
            for error in self.errors:
                print(f"  - {error}")
            print()

        if self.warnings:
            print(f"{Colors.YELLOW}[WARNING]{Colors.NC} Setup completed with {len(self.warnings)} warning(s):")
            for warning in self.warnings:
                print(f"  - {warning}")
            print()

        if not self.errors:
            self.print_success("Setup completed successfully.")
            print()
            if launch:
                self.print_status("Launching desktop app with: bun run tauri dev")
            else:
                self.print_status("You can now start developing with: bun run tauri dev")
            print()

    def run(self, use_https: bool = False, launch: bool = False) -> bool:
        """Run the desktop developer environment setup flow."""
        self.print_header("SOURCCEY DESKTOP DEV SETUP")
        self.print_header("CHECKING SYSTEM REQUIREMENTS")

        required_checks = [
            self.check_project_structure(),
            self.check_python_version(),
            self.check_git(),
        ]

        if not all(required_checks):
            self.print_error("System requirements check failed.")
            return False

        if not self.ensure_uv():
            self.print_error("uv is required for Sourccey desktop setup.")
            self.print_error("Install uv from https://docs.astral.sh/uv/getting-started/installation/")
            self.print_error("Then run this script again.")
            return False

        if not self.ensure_bun():
            self.print_error("Bun setup failed.")
            return False

        if not self.ensure_rust():
            self.print_error("Rust setup failed.")
            return False

        if not self.ensure_desktop_tauri_prerequisites():
            self.print_error("Desktop Tauri prerequisites check failed.")
            return False

        if not self.ensure_linux_tauri_prerequisites():
            self.print_error("Linux dependency setup failed.")
            return False

        if not self.ensure_linux_inotify_limits():
            return False

        self.print_header("SETTING UP PROJECT")

        if not self.setup_git_submodules(use_https=use_https):
            self.print_error("Git submodule setup failed.")

            if not use_https:
                self.print_error("")
                self.print_error("This might be due to SSH connectivity issues.")
                self.print_error("Try running setup with HTTPS instead:")
                self.print_error("")
                self.print_error(
                    f"  {self.current_python_command()} setup/desktop/setup_dev.py --use-https"
                )
                self.print_error("")
                self.print_error("This will use HTTPS URLs instead of SSH for git operations.")
            else:
                self.print_error("Git submodule setup failed even with HTTPS.")
                self.print_error("Check your internet connection and try again.")
            return False

        if not self.git_manager.checkout_submodule_tag(
            submodule_relative_path=LEROBOT_VULCAN_SUBMODULE_PATH,
            tag=LEROBOT_VULCAN_TAG,
            force=False,
        ):
            self.print_error(
                f"Failed to checkout tag {LEROBOT_VULCAN_TAG} in "
                f"{LEROBOT_VULCAN_SUBMODULE_PATH}."
            )
            return False

        if not self.setup_python_environment():
            self.print_error("Project setup failed.")
            return False

        if not self.setup_bun_packages():
            self.print_error("Project setup failed.")
            return False

        if not self.ensure_env_file():
            self.print_error("Project setup failed.")
            return False

        self.print_summary(launch=launch)
        if self.errors:
            return False

        if not launch:
            return True

        self.print_header("STARTING DESKTOP DEV MODE")
        return self.run_desktop_dev()


def setup(use_https: bool = False, launch: bool = False) -> bool:
    """Convenience entrypoint for tests and other scripts."""
    return DesktopDevSetupScript().run(use_https=use_https, launch=launch)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sourccey Desktop Dev Setup")
    parser.add_argument(
        "--use-https",
        action="store_true",
        default=False,
        help="Force HTTPS URLs instead of SSH for git operations",
    )
    parser.add_argument(
        "--launch",
        action="store_true",
        default=False,
        help="Launch Tauri dev mode after setup completes",
    )
    args = parser.parse_args()

    success = DesktopDevSetupScript().run(
        use_https=args.use_https,
        launch=args.launch,
    )
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
