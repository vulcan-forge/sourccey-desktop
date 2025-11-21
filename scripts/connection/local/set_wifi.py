#!/usr/bin/env python3
"""
Disable access point mode and attempt to reconnect to saved WiFi networks
Usage: python set_wifi.py
"""

import subprocess
import sys
import json
import time

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

def reconnect_to_saved_wifi():
    """Attempt to reconnect to a previously saved WiFi network"""
    try:
        # List all saved WiFi connections (excluding Hotspot)
        result = subprocess.run(
            ["nmcli", "-t", "-f", "NAME,TYPE", "connection", "show"],
            capture_output=True,
            text=True,
            check=True
        )

        saved_wifi_connections = []
        for line in result.stdout.strip().split('\n'):
            parts = line.split(':')
            if len(parts) >= 2:
                name = parts[0]
                conn_type = parts[1] if len(parts) > 1 else ""
                # Look for WiFi connections (not Hotspot)
                if 'wifi' in conn_type.lower() and name != "Hotspot":
                    saved_wifi_connections.append(name)

        if not saved_wifi_connections:
            return False

        # Try to activate saved WiFi connections, starting with the first one
        # NetworkManager will automatically try the most recently used connection
        for wifi_conn in saved_wifi_connections:
            try:
                result = subprocess.run(
                    ["sudo", "nmcli", "connection", "up", wifi_conn],
                    capture_output=True,
                    text=True,
                    check=True,
                    timeout=15
                )
                # Wait a moment to verify connection is established
                time.sleep(2)
                # Verify connection is active
                verify_result = subprocess.run(
                    ["nmcli", "-t", "-f", "NAME", "connection", "show", "--active"],
                    capture_output=True,
                    text=True,
                    check=True
                )
                if wifi_conn in verify_result.stdout:
                    return True
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                # Try next connection if this one fails
                continue

        return False
    except subprocess.CalledProcessError:
        return False

def disable_access_point():
    """Disable access point mode and attempt to reconnect to WiFi"""
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

    # Attempt to reconnect to saved WiFi
    wifi_reconnected = reconnect_to_saved_wifi()

    # Output success message as JSON for easy parsing
    if wifi_reconnected:
        output = {
            "status": "SUCCESS",
            "message": "Access point disabled and reconnected to WiFi"
        }
    else:
        output = {
            "status": "SUCCESS",
            "message": "Access point disabled. No saved WiFi networks found or connection failed."
        }

    print(json.dumps(output))
    sys.exit(0)

def main():
    disable_access_point()

if __name__ == "__main__":
    main()
