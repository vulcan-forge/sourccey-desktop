#!/usr/bin/env python3
"""
LightDM Configuration Module for Sourccey Kiosk

Handles LightDM autologin configuration and related settings.
"""

import subprocess
from pathlib import Path
from typing import Callable

class LightDMConfigurator:
    def __init__(self, print_status: Callable, print_success: Callable,
                 print_warning: Callable, print_error: Callable,
                 write_file_as_root: Callable):
        self.print_status = print_status
        self.print_success = print_success
        self.print_warning = print_warning
        self.print_error = print_error
        self.write_file_as_root = write_file_as_root

    def backup_config(self) -> bool:
        """Backup original LightDM configuration"""
        self.print_status("Backing up LightDM configuration...")

        backup_cmd = "sudo cp /etc/lightdm/lightdm.conf /etc/lightdm/lightdm.conf.backup"
        backup_result = subprocess.run(
            backup_cmd,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
        )

        if backup_result is None or backup_result.returncode != 0:
            self.print_warning("Could not backup lightdm.conf")
            return False

        self.print_success("LightDM configuration backed up")
        return True

    def clear_existing_settings(self) -> bool:
        """Remove any existing LightDM autologin-related settings safely."""
        self.print_status("Clearing existing LightDM settings...")

        lightdm_conf = Path("/etc/lightdm/lightdm.conf")
        lightdm_dir = lightdm_conf.parent

        # Ensure LightDM directory exists
        subprocess.run(f"sudo mkdir -p {lightdm_dir}", shell=True, check=False)

        # Patterns to remove (matches commented or uncommented)
        settings = [
            "autologin-",
            "user-session=",
            "allow-guest=",
        ]

        # Skip cleanup entirely if config file doesn't exist
        if not lightdm_conf.exists():
            self.print_status("No LightDM config found, skipping cleanup.")
            return True


        try:
            # Build the sed delete expression in one command
            sed_expr = "; ".join([f"/^#\\?{s}/d" for s in settings])
            sed_cmd = f"sudo sed -i '{sed_expr}' {lightdm_conf}"

            result = subprocess.run(sed_cmd, shell=True, capture_output=True, text=True)

            if result.returncode not in (0, 1):  # 1 = no matches (fine)
                self.print_status("Existing LightDM settings not found, skipping cleanup.")

            self.print_status("Old LightDM settings cleared.")
            return True
        except Exception as e:
            self.print_status("Existing LightDM settings not found, skipping cleanup.")
            return True

    def configure_main_config(self, user: str, binary_name: str) -> bool:
        """Set up LightDM autologin in a clean, modern way."""
        self.print_status("Configuring LightDM autologin...")

        # Define autologin configuration content
        conf_content = (
            f"[Seat:*]\n"
            f"autologin-user={user}\n"
            "autologin-user-timeout=0\n"
            f"autologin-session={binary_name}-openbox\n"
            f"user-session={binary_name}-openbox\n"
            "allow-guest=false\n"
        )

        # Write to a dedicated override file
        cmd = (
            "sudo bash -lc '"
            "mkdir -p /etc/lightdm/lightdm.conf.d && "
            f"echo \"{conf_content}\" > /etc/lightdm/lightdm.conf.d/50-autologin.conf'"
        )

        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

        if result.returncode != 0:
            self.print_warning(f"⚠️ Failed to configure LightDM: {result.stderr.strip()}")
            return False

        self.print_status("✅ LightDM autologin configured successfully.")
        return True

    def create_dropin_config(self, user: str, binary_name: str) -> bool:
        """Create drop-in configuration file"""
        self.print_status("Creating LightDM drop-in config...")

        # Ensure directory exists
        mkdir_cmd = "sudo mkdir -p /etc/lightdm/lightdm.conf.d"
        mkdir_result = subprocess.run(
            mkdir_cmd,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
        )
        if mkdir_result is None or mkdir_result.returncode != 0:
            self.print_warning("Could not create lightdm.conf.d")
            return False

        dropdin_content = f"""[Seat:*]
autologin-user={user}
autologin-user-timeout=0
autologin-session={binary_name}-openbox
user-session={binary_name}-openbox
allow-guest=false
greeter-hide-users=false
"""

        if not self.write_file_as_root(
            f"/etc/lightdm/lightdm.conf.d/99-{binary_name}-kiosk.conf",
            dropdin_content,
            mode=0o644
        ):
            return False

        self.print_success("Drop-in config created")
        return True

    def configure_accounts_service(self, user: str, binary_name: str) -> bool:
        """Configure AccountsService for the user"""
        self.print_status("Configuring AccountsService...")

        mkdir_cmd = "sudo mkdir -p /var/lib/AccountsService/users"
        mkdir_result = subprocess.run(
            mkdir_cmd,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
        )
        if mkdir_result is None or mkdir_result.returncode != 0:
            self.print_warning("Could not create AccountsService users")
            return False

        accounts_content = f"""[User]
XSession={binary_name}-openbox
SystemAccount=false
"""

        if not self.write_file_as_root(
            f"/var/lib/AccountsService/users/{user}",
            accounts_content,
            mode=0o644
        ):
            return False

        self.print_success("AccountsService configured")
        return True

    def configure(self, user: str, binary_name: str) -> bool:
        """Main configuration method"""
        self.print_status("Configuring LightDM autologin...")

        if not self.backup_config():
            self.print_warning("Backup failed, continuing anyway...")

        if not self.clear_existing_settings():
            self.print_error("Failed to clear existing settings")
            return False

        if not self.configure_main_config(user, binary_name):
            self.print_error("Failed to configure main config")
            return False

        if not self.create_dropin_config(user, binary_name):
            self.print_error("Failed to create drop-in config")
            return False

        if not self.configure_accounts_service(user, binary_name):
            self.print_error("Failed to configure AccountsService")
            return False

        self.print_success("LightDM configured successfully")
        return True

    def restart(self) -> bool:
        """Restart LightDM service"""
        self.print_status("Restarting LightDM...")

        restart_cmd = "sudo systemctl restart lightdm"
        restart_result = subprocess.run(
            restart_cmd,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
        )
        if restart_result is None or restart_result.returncode != 0:
            self.print_warning("Could not restart LightDM")
            return False

        self.print_success("LightDM restarted - kiosk mode activated")
        return True

def configure_lightdm(user: str, binary_name: str,
                     print_status, print_success, print_warning, print_error, write_file_as_root) -> bool:
    """Convenience function for configuring LightDM"""
    configurator = LightDMConfigurator(
        print_status, print_success, print_warning, print_error,
        write_file_as_root
    )
    return configurator.configure(user, binary_name)


def restart_lightdm(print_status, print_success) -> bool:
    """Convenience function for restarting LightDM"""
    configurator = LightDMConfigurator(
        print_status, print_success, None, None,
        None
    )
    return configurator.restart()
