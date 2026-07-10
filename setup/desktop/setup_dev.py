#!/usr/bin/env python3
"""
Sourccey Desktop Dev Setup Script

This module prepares the desktop developer environment.
Launching the desktop Tauri app is optional and opt-in.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from setup.desktop.setup import (  # type: ignore
    Colors,
    LEROBOT_VULCAN_SUBMODULE_PATH,
    LEROBOT_VULCAN_TAG,
    SetupScript,
)
from setup.shared.setup_helper import wrap_command  # type: ignore
from setup.shared.setup_javascript import get_bun_path  # type: ignore


class DesktopDevSetupScript(SetupScript):
    """Developer-focused desktop setup that can launch Tauri dev mode."""

    LINUX_INOTIFY_LIMITS = {
        "max_user_watches": 524288,
        "max_user_instances": 1024,
    }

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
