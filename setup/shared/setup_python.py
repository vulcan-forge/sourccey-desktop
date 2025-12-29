#!/usr/bin/env python3
"""
Python Setup Utilities for Sourccey Desktop

This module contains Python-specific setup functions used by both desktop and kiosk setup scripts.
"""

import os
import subprocess
import sys
import importlib.util
import shutil
from pathlib import Path
from typing import Callable

from setup_helper import get_real_user_home, wrap_command

#################################################################
# Helper Functions
#################################################################

def find_user_binary(binary_name: str, search_dirs: list) -> Path | None:
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

    # Check user's home directory subdirectories
    if user_home:
        for search_dir in search_dirs:
            search_paths.append(Path(user_home) / search_dir / binary_name)

    # Check current user's home
    current_home = Path.home()
    for search_dir in search_dirs:
        search_paths.append(current_home / search_dir / binary_name)

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
                os.environ["PATH"] = f"{bin_dir}:{current_path}"
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

    def check_python_version(self, min_major: int = 3, min_minor: int = 10) -> bool:
        """Check if Python 3.10+ is installed"""
        self.print_status("Checking Python version...")

        version = sys.version_info
        if version.major < min_major or (version.major == min_major and version.minor < min_minor):
            self.print_error(f"Python {min_major}.{min_minor}+ is required, but found {version.major}.{version.minor}")
            self.print_error(f"Please install Python {min_major}.{min_minor} or higher from https://python.org")
            return False

        self.print_success(f"Python {version.major}.{version.minor}.{version.micro} is installed")
        return True

    #################################################################
    # UV Package Manager Check
    #################################################################

    def check_uv(self) -> bool:
        """Check if uv is installed (optional but recommended)"""
        self.print_status("Checking uv installation (optional)...")

        # Use helper to find uv
        uv_path = find_user_binary("uv", [".cargo/bin", ".local/bin"])

        if not uv_path:
            self.print_warning("uv is not installed (optional but recommended)")
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

    def setup_python_environment(self) -> bool:
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
            success = lerobot_setup.setup()

            if success:
                self.print_success("lerobot-vulcan setup completed successfully")
            else:
                self.print_error("lerobot-vulcan setup failed")

            return success

        except Exception as e:
            self.print_error(f"Failed to run lerobot-vulcan setup: {e}")
            return False

    #################################################################
    # Vosk English Model (speech-to-text) install
    #################################################################
    def install_vosk_model(self) -> bool:
        """Download and install Vosk English model into user cache"""
        self.print_status("Checking Vosk English model...")

        model_name = "vosk-model-small-en-us-0.15"
        model_url = f"https://alphacephei.com/vosk/models/{model_name}.zip"
        cache_dir = Path.home() / ".cache" / "vosk"
        model_path = cache_dir / model_name
        zip_path = cache_dir / f"{model_name}.zip"

        if model_path.exists():
            self.print_success("Vosk English model already installed")
            return True

        self.print_status("Downloading Vosk English model (≈50MB)...")
        cache_dir.mkdir(parents=True, exist_ok=True)

        try:
            subprocess.run(
                ["curl", "-L", model_url, "-o", str(zip_path)],
                check=True,
            )
            self.print_status("Extracting model...")
            subprocess.run(
                ["unzip", "-q", str(zip_path), "-d", str(cache_dir)],
                check=True,
            )
            zip_path.unlink(missing_ok=True)

            if not model_path.exists():
                self.print_error("Model extraction failed")
                return False

            self.print_success("Vosk English model installed")
            return True
        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to install Vosk model: {e}")
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
    min_minor: int = 10
) -> bool:
    """Convenience function for checking Python version"""
    manager = PythonSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.check_python_version(min_major, min_minor)

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

def setup_python_environment(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for setting up Python environment"""
    manager = PythonSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.setup_python_environment()

