#!/usr/bin/env python3
"""
Python Setup Utilities for Sourccey Desktop

This module contains Python-specific setup functions used by both desktop and kiosk setup scripts.
"""

import os
import platform
import subprocess
import sys
import importlib.util
import shutil
from pathlib import Path
from typing import Callable, Optional

from setup_helper import get_real_user_home, wrap_command

#################################################################
# Helper Functions
#################################################################

def find_user_binary(binary_name: str, search_dirs: list) -> Optional[Path]:
    """
    Find a binary executable, handling sudo scenarios on Linux.

    Args:
        binary_name: Name of the binary to find (e.g., 'uv', 'cargo')
        search_dirs: List of relative directories to search in user's home

    Returns:
        Path to the binary if found, None otherwise
    """
    # First, check if binary is already in PATH
    binary_path = shutil.which(binary_name)
    if binary_path:
        return Path(binary_path)

    # Get real user home directory
    user_home = get_real_user_home()

    # Potential binary locations
    search_paths = []
    binary_candidates = [binary_name]
    if os.name == "nt" and not binary_name.lower().endswith(".exe"):
        binary_candidates.append(f"{binary_name}.exe")

    # Check user's home directory subdirectories
    if user_home:
        for search_dir in search_dirs:
            for candidate in binary_candidates:
                search_paths.append(Path(user_home) / search_dir / candidate)

    # Check current user's home
    current_home = Path.home()
    for search_dir in search_dirs:
        for candidate in binary_candidates:
            search_paths.append(current_home / search_dir / candidate)

    # Check common system locations
    if os.name != 'nt':  # Not Windows
        search_paths.extend([
            Path(f"/usr/local/bin/{binary_name}"),
            Path(f"/usr/bin/{binary_name}"),
        ])

    # Find first existing path
    for path in search_paths:
        if path.exists() and path.is_file():
            # Add to PATH if not already there
            bin_dir = str(path.parent)
            current_path = os.environ.get("PATH", "")
            if bin_dir not in current_path:
                os.environ["PATH"] = f"{bin_dir}{os.pathsep}{current_path}" if current_path else bin_dir
            return path

    return None

#################################################################
# Python Setup Manager Class
#################################################################

class PythonSetupManager:
    """Manager class for Python-related setup operations"""

    def __init__(
        self,
        project_root: Path,
        print_status: Callable,
        print_success: Callable,
        print_warning: Callable,
        print_error: Callable
    ):
        self.project_root = project_root
        self.print_status = print_status
        self.print_success = print_success
        self.print_warning = print_warning
        self.print_error = print_error

    #################################################################
    # Python Version Check
    #################################################################

    def check_python_version(
        self, min_major: int = 3, min_minor: int = 10, min_micro: int = 0
    ) -> bool:
        """Check if Python 3.10+ is installed"""
        self.print_status("Checking Python version...")

        version = sys.version_info
        current_version = (version.major, version.minor, version.micro)
        minimum_version = (min_major, min_minor, min_micro)
        if current_version < minimum_version:
            self.print_error(
                f"Python {min_major}.{min_minor}.{min_micro}+ is required, "
                f"but found {version.major}.{version.minor}.{version.micro}"
            )
            self.print_error(
                f"Please install Python {min_major}.{min_minor}.{min_micro} "
                "or higher from https://python.org"
            )
            return False

        self.print_success(f"Python {version.major}.{version.minor}.{version.micro} is installed")
        return True

    #################################################################
    # UV Package Manager Check
    #################################################################

    def _select_linux_shell_rc_file(self, user_home: Path) -> Path:
        """Choose the most appropriate Linux shell startup file for PATH updates."""
        shell_name = ""

        if os.name != "nt":
            sudo_user = os.environ.get("SUDO_USER")
            if sudo_user and hasattr(os, "geteuid") and os.geteuid() == 0:
                try:
                    import pwd

                    shell_name = Path(pwd.getpwnam(sudo_user).pw_shell).name
                except Exception:
                    shell_name = ""

        if not shell_name:
            shell = os.environ.get("SHELL", "")
            shell_name = Path(shell).name if shell else ""

        if shell_name == "zsh":
            ordered_candidates = [".zshrc", ".profile", ".bashrc"]
        elif shell_name == "bash":
            ordered_candidates = [".bashrc", ".profile", ".zshrc"]
        else:
            ordered_candidates = [".profile", ".bashrc", ".zshrc"]

        for candidate in ordered_candidates:
            candidate_path = user_home / candidate
            if candidate_path.exists():
                return candidate_path

        return user_home / ordered_candidates[0]

    def _persist_linux_path_entry(self, path_dir: Path) -> None:
        """Persist a PATH entry in the Linux user's shell startup file."""
        if platform.system() != "Linux":
            return

        user_home = Path(get_real_user_home())
        rc_file = self._select_linux_shell_rc_file(user_home)

        try:
            path_dir = path_dir.resolve()
        except Exception:
            pass

        try:
            relative_path = path_dir.relative_to(user_home)
            if str(relative_path) == ".":
                path_expr = "$HOME"
            else:
                path_expr = f"$HOME/{relative_path.as_posix()}"
        except ValueError:
            path_expr = str(path_dir)

        marker_start = "# >>> sourccey uv path >>>"
        marker_end = "# <<< sourccey uv path <<<"
        snippet = (
            f"\n{marker_start}\n"
            f'export PATH="{path_expr}:$PATH"\n'
            f"{marker_end}\n"
        )

        try:
            existing = rc_file.read_text(encoding="utf-8") if rc_file.exists() else ""
        except OSError as e:
            self.print_warning(f"Could not read {rc_file}: {e}")
            return

        if marker_start in existing or f'export PATH="{path_expr}:$PATH"' in existing:
            self.print_status(f"uv PATH already configured in {rc_file}")
            return

        file_existed = rc_file.exists()

        try:
            rc_file.parent.mkdir(parents=True, exist_ok=True)
            with rc_file.open("a", encoding="utf-8") as handle:
                handle.write(snippet)

            # Keep file ownership with the real user when setup is executed via sudo.
            if (
                not file_existed
                and os.name != "nt"
                and hasattr(os, "geteuid")
                and os.geteuid() == 0
                and os.environ.get("SUDO_USER")
            ):
                try:
                    import pwd

                    sudo_user = os.environ["SUDO_USER"]
                    user_info = pwd.getpwnam(sudo_user)
                    os.chown(rc_file, user_info.pw_uid, user_info.pw_gid)
                except Exception as chown_error:
                    self.print_warning(
                        f"Added PATH config but could not update ownership for {rc_file}: {chown_error}"
                    )

            self.print_success(f"Persisted uv PATH in {rc_file}")
            self.print_status(f"Open a new terminal or run: source {rc_file}")
        except OSError as e:
            self.print_warning(f"Failed to update {rc_file}: {e}")

    def install_uv(self) -> bool:
        """Install uv using a platform-appropriate flow."""
        self.print_status("Installing uv...")
        original_path_entries = set(filter(None, os.environ.get("PATH", "").split(os.pathsep)))

        pipx_path = find_user_binary("pipx", [".local/bin"])
        is_linux = platform.system() == "Linux"
        has_apt = shutil.which("apt-get") is not None

        try:
            if is_linux and has_apt and not pipx_path:
                self.print_status("pipx not found. Installing Debian prerequisites for uv...")
                install_cmd = ["apt-get", "install", "-y", "python3-full", "python3-pip", "pipx"]
                if hasattr(os, "geteuid") and os.geteuid() != 0:
                    install_cmd = ["sudo"] + install_cmd
                subprocess.run(install_cmd, check=True)
                pipx_path = find_user_binary("pipx", [".local/bin"])

            if pipx_path:
                # Ensure user-level paths are registered, then install uv for the invoking user.
                ensurepath_cmd, ensurepath_cwd = wrap_command([str(pipx_path), "ensurepath"], Path.cwd())
                subprocess.run(
                    ensurepath_cmd,
                    cwd=ensurepath_cwd,
                    check=False,
                    capture_output=True,
                    text=True,
                )

                install_cmd, install_cwd = wrap_command(
                    [str(pipx_path), "install", "--force", "uv"],
                    Path.cwd(),
                )
                subprocess.run(install_cmd, cwd=install_cwd, check=True)
            else:
                self.print_status("pipx not found. Falling back to pip user install for uv...")
                subprocess.run([sys.executable, "-m", "pip", "install", "--user", "uv"], check=True)

            uv_path = find_user_binary("uv", [".cargo/bin", ".local/bin"])
            if uv_path:
                self.print_success(f"uv installed successfully at {uv_path}")
                if str(uv_path.parent) not in original_path_entries:
                    self._persist_linux_path_entry(uv_path.parent)
                    self.print_warning(
                        f"uv is in {uv_path.parent}. PATH has been persisted for future shells."
                    )
                    self.print_warning(
                        f"Run now in this shell: export PATH=\"{uv_path.parent}:$PATH\""
                    )
                return True

            self.print_error("uv installation finished but uv binary was not found in PATH.")
            self.print_error("Try reopening the terminal and rerunning setup.")
            return False
        except subprocess.CalledProcessError as e:
            self.print_error(f"Error installing uv: {e}")
            return False

    def ensure_uv(self) -> bool:
        """Ensure uv is available; install it automatically when missing."""
        if self.check_uv():
            return True

        self.print_status("uv not found, attempting to install automatically...")
        if not self.install_uv():
            return False

        return self.check_uv()

    def check_uv(self) -> bool:
        """Check if uv is installed."""
        self.print_status("Checking uv installation...")
        uv_in_path = shutil.which("uv")

        # Use helper to find uv
        uv_path = find_user_binary("uv", [".cargo/bin", ".local/bin"])

        if not uv_path:
            self.print_warning("uv is not installed")
            self.print_warning("Install uv from https://docs.astral.sh/uv/getting-started/installation/")
            return False

        # Try to get version
        try:
            # Check version (automatically runs as user if sudo is detected)
            wrapped_cmd, actual_cwd = wrap_command([str(uv_path), "--version"], Path.cwd())
            version_result = subprocess.run(
                wrapped_cmd,
                cwd=actual_cwd,
                check=True,
                capture_output=True,
                text=True,
            )

            if version_result and version_result.returncode == 0:
                self.print_success(f"uv is installed at {uv_path}")
        except Exception as e:
            self.print_success(f"uv is installed at {uv_path}")

        if uv_path and not uv_in_path:
            self._persist_linux_path_entry(uv_path.parent)
            self.print_warning(
                f"uv was found at {uv_path}, but it is not on your current shell PATH."
            )
            self.print_warning(
                f"Run now in this shell: export PATH=\"{uv_path.parent}:$PATH\""
            )

        self.clean_uv_cache()

        return True

    def clean_uv_cache(self):
        uv_cache_path = Path(get_real_user_home()) / ".cache/uv/sdists-v9"
        if uv_cache_path.exists():
            try:
                shutil.rmtree(uv_cache_path)
                self.print_success(f"Cleaned UV cache at {uv_cache_path}")
            except PermissionError:
                self.print_warning(f"Permission denied while removing {uv_cache_path}. Try running as the correct user.")
            except Exception as e:
                self.print_warning(f"Failed to clean UV cache: {e}")


    #################################################################
    # Python Environment Setup
    #################################################################

    def setup_python_environment(self, desktop: bool = False) -> bool:
        """Setup Python environment for lerobot-vulcan"""
        self.print_status("Setting up lerobot-vulcan environment...")

        lerobot_path = self.project_root / "modules" / "lerobot-vulcan"
        lerobot_setup_path = lerobot_path / "setup" / "setup.py"

        if not lerobot_path.exists():
            self.print_error("lerobot-vulcan module not found")
            return False

        if not lerobot_setup_path.exists():
            self.print_error("lerobot-vulcan setup script not found")
            return False

        try:
            self.print_status("Running lerobot-vulcan setup...")

            # Add the lerobot setup directory to the path temporarily
            setup_dir = str(lerobot_setup_path.parent)
            if setup_dir not in sys.path:
                sys.path.insert(0, setup_dir)

            # Load the setup module
            spec = importlib.util.spec_from_file_location("lerobot_setup", lerobot_setup_path)
            if spec is None or spec.loader is None:
                self.print_error("Failed to load lerobot setup module")
                return False

            lerobot_setup = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(lerobot_setup)

            # Call the setup function
            success = lerobot_setup.setup(desktop=desktop)

            if success:
                self.print_success("lerobot-vulcan setup completed successfully")
            else:
                self.print_error("lerobot-vulcan setup failed")

            return success

        except Exception as e:
            self.print_error(f"Failed to run lerobot-vulcan setup: {e}")
            return False


#################################################################
# Convenience Functions
#################################################################

def check_python_version(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable,
    min_major: int = 3,
    min_minor: int = 10,
    min_micro: int = 0,
) -> bool:
    """Convenience function for checking Python version"""
    manager = PythonSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.check_python_version(min_major, min_minor, min_micro)

def check_uv(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for checking uv installation"""
    manager = PythonSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.check_uv()

def ensure_uv(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for ensuring uv is installed."""
    manager = PythonSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.ensure_uv()

def setup_python_environment(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable,
    desktop: bool = False,
) -> bool:
    """Convenience function for setting up Python environment"""
    manager = PythonSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.setup_python_environment(desktop=desktop)
