#!/usr/bin/env python3
"""
Disable access point mode and prepare for manual WiFi connection
Usage: python set_wifi.py
"""

import subprocess
import sys
import json

def find_wifi_device():
    """Find the WiFi device name"""
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "DEVICE,TYPE", "device", "status"],
            capture_output=True,
            text=True,
            check=True
        )
        for line in result.stdout.strip().split('\n'):
            parts = line.split(':')
            if len(parts) >= 2 and 'wifi' in parts[1].lower():
                return parts[0]
        return None
    except subprocess.CalledProcessError:
        return None

def disable_access_point():
    """Disable access point mode and disconnect existing connections"""
    # Find WiFi device
    wifi_device = find_wifi_device()
    if not wifi_device:
        print("ERROR: No WiFi device found", file=sys.stderr)
        sys.exit(1)

    # Disconnect existing connections
    subprocess.run(
        ["sudo", "nmcli", "device", "disconnect", wifi_device],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Remove hotspot if switching from AP mode
    subprocess.run(
        ["sudo", "nmcli", "connection", "delete", "Hotspot"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Output success message as JSON for easy parsing
    output = {
        "status": "SUCCESS",
        "message": "Access point mode disabled. Please connect to WiFi manually."
    }
    print(json.dumps(output))
    sys.exit(0)

def main():
    disable_access_point()

if __name__ == "__main__":
    main()
