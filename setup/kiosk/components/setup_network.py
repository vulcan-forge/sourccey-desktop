#!/usr/bin/env python3
"""Grant the kiosk account the NetworkManager actions used by the app."""

import re
from typing import Callable


POLKIT_RULES_PATH = "/etc/polkit-1/rules.d/49-sourccey-networkmanager.rules"
NETWORKMANAGER_ACTIONS = (
    "org.freedesktop.NetworkManager.enable-disable-wifi",
    "org.freedesktop.NetworkManager.network-control",
    "org.freedesktop.NetworkManager.settings.modify.own",
    "org.freedesktop.NetworkManager.settings.modify.system",
    "org.freedesktop.NetworkManager.wifi.scan",
    "org.freedesktop.NetworkManager.wifi.share.open",
    "org.freedesktop.NetworkManager.wifi.share.protected",
)


def networkmanager_polkit_rule(user: str) -> str:
    actions = ",\n".join(f'        "{action}"' for action in NETWORKMANAGER_ACTIONS)
    return f'''// Managed by Sourccey kiosk setup.
polkit.addRule(function(action, subject) {{
    var allowedActions = [
{actions}
    ];

    if (subject.user == "{user}" && allowedActions.indexOf(action.id) >= 0) {{
        return polkit.Result.YES;
    }}
}});
'''


def configure_networkmanager_permission(
    user: str,
    print_status: Callable[[str], None],
    print_success: Callable[[str], None],
    print_error: Callable[[str], None],
    write_file_as_root: Callable[..., bool],
) -> bool:
    """Allow the kiosk user to manage only the NetworkManager features the UI uses."""
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", user):
        print_error(f"Cannot configure NetworkManager permissions for invalid user: {user!r}")
        return False

    print_status("Configuring kiosk NetworkManager permission...")
    if not write_file_as_root(
        POLKIT_RULES_PATH,
        networkmanager_polkit_rule(user),
        mode=0o644,
    ):
        print_error("Failed to configure kiosk NetworkManager permission")
        return False

    print_success("Kiosk NetworkManager permission configured")
    return True
