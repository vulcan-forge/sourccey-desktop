#!/usr/bin/env python3
"""
Helper Functions Module for Sourccey Kiosk Setup

Common utilities for setup operations.
"""

import os
import shutil
from pathlib import Path
from typing import Optional, List

def find_command_with_sudo_support(
    command: str,
    subpaths: Optional[List[str]] = None
) -> Optional[Path]:
    """
    Find a command in PATH or user's home directory, handling sudo scenarios.

    This function is designed to work correctly when the script is run with sudo,
    by checking both the root PATH and the actual user's home directory.

    Args:
        command: The command name to find (e.g., "cargo", "bun")
        subpaths: Optional list of subdirectories to check in home directory
                 (e.g., [".cargo/bin", ".bun/bin"])

    Returns:
        Path to the command if found, None otherwise

    Side effects:
        If the command is found in a user directory, adds that directory to
        the current session's PATH environment variable.
    """
    # First, check if command is already in PATH
    cmd_path = shutil.which(command)
    if cmd_path:
        return Path(cmd_path)

    # If not in PATH and running as sudo, check the actual user's directories
    sudo_user = os.environ.get("SUDO_USER")

    # Default common subdirectories if not specified
    if subpaths is None:
        subpaths = [
            f".cargo/bin",  # Rust/Cargo
            f".bun/bin",    # Bun
            f".local/bin",  # Common user bin
            f".npm-global/bin",  # npm global
        ]

    # Check the actual user's home directory (when using sudo)
    if sudo_user:
        user_home = Path(f"/home/{sudo_user}")
        if user_home.exists():
            for subpath in subpaths:
                cmd_location = user_home / subpath / command
                if cmd_location.exists() and os.access(cmd_location, os.X_OK):
                    # Add this directory to PATH for the current session
                    bin_dir = str(cmd_location.parent)
                    if bin_dir not in os.environ.get("PATH", ""):
                        os.environ["PATH"] = f"{bin_dir}:" + os.environ.get("PATH", "")
                    return cmd_location

    # Also check current user's home (might be different from SUDO_USER)
    current_home = Path.home()
    if current_home.exists():
        for subpath in subpaths:
            cmd_location = current_home / subpath / command
            if cmd_location.exists() and os.access(cmd_location, os.X_OK):
                # Add this directory to PATH for the current session
                bin_dir = str(cmd_location.parent)
                if bin_dir not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = f"{bin_dir}:" + os.environ.get("PATH", "")
                return cmd_location

    # Not found
    return None


def check_command_with_sudo_support(
    command: str,
    subpaths: Optional[List[str]] = None,
    print_success=None,
    print_error=None
) -> bool:
    """
    Check if a command exists, handling sudo scenarios.

    Convenience wrapper around find_command_with_sudo_support that returns
    a boolean and optionally prints status messages.

    Args:
        command: The command name to check
        subpaths: Optional list of subdirectories to check
        print_success: Optional function to print success messages
        print_error: Optional function to print error messages

    Returns:
        True if command is found, False otherwise
    """
    cmd_path = find_command_with_sudo_support(command, subpaths)

    if cmd_path:
        if print_success:
            print_success(f"{command} found at {cmd_path}")
        return True
    else:
        if print_error:
            print_error(f"{command} not found in PATH or user directories")
        return False
