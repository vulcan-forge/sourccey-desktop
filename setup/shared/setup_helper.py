#!/usr/bin/env python3
"""
Setup Helper Functions
Shared utility functions for Raspberry Pi setup modules.
"""

import os
import subprocess
from pathlib import Path
from typing import Optional, Tuple

##############################################################################
# HELPER FUNCTIONS
##############################################################################

def get_real_user_home() -> str:
    """Get the real user's home directory, not root's when running with sudo"""
    # Check if we're running as root (sudo) - only on Unix-like systems
    if hasattr(os, 'geteuid') and os.geteuid() == 0:
        # Get the real user from SUDO_USER environment variable
        real_user = os.environ.get('SUDO_USER')
        if real_user:
            # Get the real user's home directory (Unix-only)
            if os.name != 'nt':  # Windows doesn't have pwd module
                import pwd
                try:
                    user_info = pwd.getpwnam(real_user)
                    return user_info.pw_dir
                except KeyError:
                    print(f"[WARNING] Could not find user {real_user}, using current HOME")
            else:
                # On Windows, try to get home from environment or user profile
                home = os.environ.get('USERPROFILE') or os.path.expanduser(f"~{real_user}")
                if os.path.exists(home):
                    return home

    # Fall back to current HOME
    return os.path.expanduser("~")

def check_command_exists(command: str) -> bool:
    """Check if a command exists in the system"""
    try:
        result = subprocess.run(f"which {command}", shell=True, capture_output=True, text=True)
        return result.returncode == 0
    except:
        return False

def should_run_as_user() -> Tuple[bool, Optional[str]]:
    """Check if we should run commands as the original user (when running with sudo)

    Returns:
        Tuple of (should_run_as_user, sudo_user)
    """
    sudo_user = os.environ.get("SUDO_USER")
    if hasattr(os, 'geteuid') and os.geteuid() == 0 and sudo_user and sudo_user != "root":
        return True, sudo_user
    return False, None

def wrap_command(command: list, cwd: Path) -> Tuple[list, Path]:
    """Wrap command to run as user when sudo is detected

    Args:
        command: Command as list
        cwd: Working directory

    Returns:
        Tuple of (modified_command, actual_cwd)
    """
    should_run, sudo_user = should_run_as_user()

    if should_run:
        # Wrap in sudo -u to run as the original user
        cmd_str = ' '.join(str(arg) for arg in command)
        return ['sudo', '-u', sudo_user, '-H', 'bash', '-c', f'cd {cwd} && {cmd_str}'], Path('/')

    return command, cwd
