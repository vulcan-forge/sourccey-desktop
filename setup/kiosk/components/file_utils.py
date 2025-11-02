#!/usr/bin/env python3
"""
File Utilities Module for Sourccey Kiosk

Helper functions for file operations requiring root privileges.
"""

from pathlib import Path
import subprocess

def write_file_as_root(path: str, content: str, mode: int = 0o644,
                      executable: bool = False) -> bool:
    """Write file as root user"""
    try:
        tmp = Path(f"{Path(path).name}.tmp")
        tmp.write_text(content)

        if not subprocess.run(["sudo", "mv", str(tmp), path], check=True, capture_output=True, text=True):
            return False
        if not subprocess.run(["sudo", "chmod", oct(mode)[2:], path], check=True, capture_output=True, text=True):
            return False
        if executable:
            if not subprocess.run(["sudo", "chmod", "+x", path], check=True, capture_output=True, text=True):
                return False

        return True
    except Exception:
        return False
