#!/usr/bin/env python3
"""
Openbox Configuration Module for Sourccey Kiosk

Handles Openbox window manager configuration for kiosk mode.
"""

from pathlib import Path
import subprocess
from typing import Callable

class OpenboxConfigurator:
    def __init__(self, print_status: Callable, print_success: Callable, print_error: Callable):
        self.print_status = print_status
        self.print_success = print_success
        self.print_error = print_error

    def create_config(self, binary_name: str) -> bool:
        """Create Openbox configuration for fullscreen kiosk mode"""
        self.print_status("Configuring Openbox...")

        cfg_dir = Path.home() / ".config" / "openbox"

        try:
            cfg_dir.mkdir(parents=True, exist_ok=True)

            rc_xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<openbox_config>
  <applications>
    <application name="{binary_name}">
      <decor>no</decor>
      <fullscreen>yes</fullscreen>
      <maximized>both</maximized>
      <position force="yes"><x>0</x><y>0</y></position>
    </application>
  </applications>
</openbox_config>
"""

            (cfg_dir / "rc.xml").write_text(rc_xml_content)

            # Try to reconfigure openbox if it's running, but don't fail if it's not
            reconfigure_cmd = "openbox --reconfigure"
            reconfigure_result = subprocess.run(
                reconfigure_cmd,
                shell=True,
                capture_output=True,
                text=True,
            )

            if reconfigure_result.returncode == 0:
                self.print_success("Openbox reconfigured successfully")
            else:
                # Openbox is not running, which is fine during setup
                self.print_status("Openbox not running (will apply config on next start)")

            self.print_success("Openbox configured")
            return True

        except Exception as e:
            self.print_error(f"Failed to configure Openbox: {e}")
            return False

def configure_openbox(binary_name: str, print_status, print_success, print_error) -> bool:
    """Convenience function for configuring Openbox"""
    configurator = OpenboxConfigurator(
        print_status, print_success, print_error
    )
    return configurator.create_config(binary_name)
