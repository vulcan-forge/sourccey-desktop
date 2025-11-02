#!/usr/bin/env python3
"""
Rust Setup Utilities for Sourccey Desktop
"""

import os
import subprocess
import shutil
from pathlib import Path
from typing import Callable, Optional

# Import shared helper
from setup_helper import get_real_user_home, wrap_command

#################################################################
# Helper Functions
#################################################################

def find_user_binary(binary_name: str, search_dirs: list) -> Optional[Path]:
    """
    Find a binary executable, handling sudo scenarios on Linux.

    Args:
        binary_name: Name of the binary to find (e.g., 'cargo', 'rustc')
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
# Rust Setup Manager Class
#################################################################

class RustSetupManager:
    """Manager class for Rust-related setup operations"""

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
    # Rust Detection
    #################################################################

    def check_rust(self) -> bool:
        """Check if Rust is installed"""
        self.print_status("Checking Rust installation...")

        # Use shared helper to find rust
        rust_path = find_user_binary("cargo", [".cargo/bin"])
        if not rust_path:
            self.print_error("Rust is not installed")
            self.print_error("Please install Rust from https://rustup.rs/")
            return False

        # Try to get version
        try:
            # Check version (automatically runs as user if sudo is detected)
            wrapped_cmd, actual_cwd = wrap_command([str(rust_path), "--version"], Path.cwd())
            version_result = subprocess.run(
                wrapped_cmd,
                cwd=actual_cwd,
                check=True,
                capture_output=True,
                text=True,
            )

            if version_result and version_result.returncode == 0:
                self.print_success(f"Rust is installed at {rust_path}")
                return True
            else:
                self.print_error("Failed to check Rust version")
                return False

        except Exception as e:
            self.print_success(f"Rust is installed at {rust_path}")
            return True

        return True
