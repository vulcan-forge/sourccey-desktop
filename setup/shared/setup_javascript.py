#!/usr/bin/env python3
"""
JavaScript/Bun Setup Utilities for Sourccey Desktop

This module contains JavaScript and Bun-specific setup functions used by both
desktop and kiosk setup scripts. It handles cross-platform scenarios including
proper sudo handling on Linux.
"""

import os
import subprocess
import shutil
import platform
from pathlib import Path
from typing import Callable, Optional

from setup_helper import get_real_user_home, wrap_command

#################################################################
# Helper Functions
#################################################################

def find_bun_with_sudo_support() -> Optional[Path]:
    """
    Find bun executable, handling sudo scenarios on Linux.

    This function is designed to work correctly when the script is run with sudo,
    by checking both the root PATH and the actual user's home directory.

    Returns:
        Path to bun if found, None otherwise
    """
    # First, check if bun is already in PATH
    bun_path = shutil.which("bun")
    if bun_path:
        return Path(bun_path)

    # If not in PATH and running as sudo, check the actual user's directories
    sudo_user = os.environ.get("SUDO_USER")

    # Potential bun locations
    search_paths = []

    # Check actual user's home (when using sudo)
    if sudo_user and sudo_user != "root":
        user_home = Path(f"/home/{sudo_user}")
        if user_home.exists():
            search_paths.append(user_home / ".bun" / "bin" / "bun")

    # Check current user's home
    home = Path.home()
    search_paths.append(home / ".bun" / "bin" / "bun")

    # Check common locations
    if platform.system() != "Windows":
        search_paths.extend([
            Path("/usr/local/bin/bun"),
            Path("/usr/bin/bun"),
        ])

    # Find first existing path
    for path in search_paths:
        if path.exists():
            # Add to PATH if not already there
            bin_dir = str(path.parent)
            if bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = f"{bin_dir}:{os.environ.get('PATH', '')}"
            return path

    return None

def find_user_binary(binary_name: str, search_dirs: list) -> Optional[Path]:
    """
    Find a binary executable, handling sudo scenarios on Linux.

    Args:
        binary_name: Name of the binary to find (e.g., 'bun', 'cargo')
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

    # Check user's home directory subdirectories
    if user_home:
        for search_dir in search_dirs:
            search_paths.append(Path(user_home) / search_dir / binary_name)

    # Check current user's home
    current_home = Path.home()
    for search_dir in search_dirs:
        search_paths.append(current_home / search_dir / binary_name)

    # Check common system locations
    if platform.system() != "Windows":
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
                os.environ["PATH"] = f"{bin_dir}:{current_path}"
            return path

    return None

#################################################################
# JavaScript/Bun Setup Manager Class
#################################################################

class JavaScriptSetupManager:
    """Manager class for JavaScript/Bun-related setup operations"""

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
        self.system = platform.system()

    #################################################################
    # Bun Detection
    #################################################################

    def check_bun(self) -> bool:
        """Check if Bun is installed"""
        self.print_status("Checking Bun installation...")

        # Use shared helper to find bun
        bun_path = find_user_binary("bun", [".bun/bin"])
        if not bun_path:
            self.print_error("Bun is not installed")
            self.print_error("Please install Bun from https://bun.sh/docs/installation")
            return False

        # Try to get version
        try:
            # Check version (automatically runs as user if sudo is detected)
            wrapped_cmd, actual_cwd = wrap_command([str(bun_path), "--version"], Path.cwd())
            version_result = subprocess.run(
                wrapped_cmd,
                cwd=actual_cwd,
                check=True,
                capture_output=True,
                text=True,
            )

            if version_result and version_result.returncode == 0:
                self.print_success(f"Bun is installed at {bun_path}")
                return True
            else:
                self.print_error("Failed to check bun version")
                self.print_status(f"Version output: {version_result.stdout}")
                self.print_error(f"Version error: {version_result.stderr}")
                return False

        except Exception as e:
            self.print_error(f"Unexpected error checking bun version: {e}")
            return False

    #################################################################
    # Package Installation
    #################################################################

    def install_packages(self) -> bool:
        """Install Bun packages (bun install)"""
        self.print_status("Installing Bun packages...")

        try:
            bun_cmd = get_bun_path()

            # Install packages (automatically runs as user if sudo is detected)
            wrapped_cmd, actual_cwd = wrap_command([bun_cmd, "install"], self.project_root)
            install_result = subprocess.run(
                wrapped_cmd,
                cwd=actual_cwd,
                check=True,
                capture_output=True,
                text=True,
            )

            if install_result.returncode == 0:
                self.print_success("Bun packages installed successfully")
                return True
            else:
                self.print_error("Failed to install Bun packages")
                self.print_status(f"Install output: {install_result.stdout}")
                self.print_error(f"Install error: {install_result.stderr}")
                return False

        except FileNotFoundError:
            self.print_error("Bun executable not found. Ensure Bun is installed and on PATH: https://bun.sh/docs/installation")
            return False
        except Exception as e:
            self.print_error(f"Unexpected error installing Bun packages: {e}")
            return False

    #################################################################
    # Bun Installation (if needed)
    #################################################################

    def install_bun(self) -> bool:
        """Install Bun using the official installer"""
        self.print_status("Installing Bun...")

        try:
            # Determine if we need to install as a specific user
            if hasattr(os, 'geteuid') and os.geteuid() == 0:
                # Get the real user's home directory
                real_home = get_real_user_home()
                real_user = os.environ.get('SUDO_USER', 'root')

                # Install Bun for the real user, not root
                install_cmd = f"sudo -u {real_user} bash -c 'curl -fsSL https://bun.sh/install | bash'"

                install_result = subprocess.run(
                    install_cmd,
                    shell=True,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                if install_result is None or install_result.returncode != 0:
                    self.print_error("Failed to install Bun")
                    self.print_status(f"Install output: {install_result.stdout}")
                    self.print_error(f"Install error: {install_result.stderr}")
                    return False

                # Add Bun to PATH in the real user's bashrc
                bashrc_path = os.path.join(real_home, ".bashrc")
                path_export = 'export PATH="$HOME/.bun/bin:$PATH"'

                try:
                    with open(bashrc_path, "r") as f:
                        content = f.read()

                    if path_export not in content:
                        with open(bashrc_path, "a") as f:
                            f.write(f"\n{path_export}\n")
                        self.print_status("Added Bun to PATH in ~/.bashrc")
                except Exception as e:
                    self.print_warning(f"Error updating ~/.bashrc: {e}")

                self.print_success("Bun installed successfully")
                return True
            else:
                # Windows/Mac or not root
                if self.system == "Windows":
                    self.print_error("Automatic Bun installation on Windows is not supported")
                    self.print_error("Please install Bun manually from https://bun.sh/docs/installation")
                    return False
                else:
                    # Mac or Linux non-root
                    install_cmd = "bash -c 'curl -fsSL https://bun.sh/install | bash'"
                    install_result = subprocess.run(
                        install_cmd,
                        shell=True,
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    if install_result is None or install_result.returncode != 0:
                        self.print_error("Failed to install Bun")
                        self.print_status(f"Install output: {install_result.stdout}")
                        self.print_error(f"Install error: {install_result.stderr}")
                        return False

            self.print_success("Bun installed successfully")
            return True

        except Exception as e:
            self.print_error(f"Unexpected error installing Bun: {e}")
            return False

    def ensure_bun(self) -> bool:
        """Ensure Bun is installed, install if not"""
        if self.check_bun():
            return True

        self.print_warning("Bun not found, attempting to install...")
        return self.install_bun()

#################################################################
# Convenience Functions
#################################################################

def get_bun_path() -> str:
    """Convenience function to get bun path"""
    bun_path = find_user_binary("bun", [".bun/bin"])
    if bun_path:
        return str(bun_path)

    # Last resort: return command name and hope it's in PATH
    return "bun"

def check_bun(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for checking Bun installation"""
    manager = JavaScriptSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.check_bun()

def install_packages(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for installing Bun packages"""
    manager = JavaScriptSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.install_packages()

def install_bun(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for installing Bun"""
    manager = JavaScriptSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.install_bun()

def ensure_bun(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for ensuring Bun is installed"""
    manager = JavaScriptSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.ensure_bun()

