#!/usr/bin/env python3
"""Configure the narrow sudo permission used by the kiosk password editor."""

import re
from typing import Callable


SUDOERS_PATH = "/etc/sudoers.d/sourccey-kiosk-password"
PASSWORD_HELPER_PATH = "/usr/local/sbin/sourccey-set-password"
PASSWORD_HELPER = """#!/bin/sh
set -eu
IFS= read -r password
case "$password" in
    *:*) echo "Password cannot contain ':'" >&2; exit 2 ;;
esac
printf 'sourccey:%s\n' "$password" | /usr/sbin/chpasswd
"""


def configure_password_update_permission(
    user: str,
    print_status: Callable[[str], None],
    print_success: Callable[[str], None],
    print_error: Callable[[str], None],
    write_file_as_root: Callable[..., bool],
) -> bool:
    """Allow only the kiosk's password-update command to run without a TTY."""
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", user):
        print_error(f"Cannot configure password updates for invalid user: {user!r}")
        return False

    print_status("Configuring kiosk password update permission...")
    if not write_file_as_root(PASSWORD_HELPER_PATH, PASSWORD_HELPER, mode=0o755, executable=True):
        print_error("Failed to install kiosk password update helper")
        return False

    content = f"{user} ALL=(root) NOPASSWD: {PASSWORD_HELPER_PATH}\n"
    if not write_file_as_root(SUDOERS_PATH, content, mode=0o440):
        print_error("Failed to configure kiosk password update permission")
        return False

    print_success("Kiosk password update permission configured")
    return True
