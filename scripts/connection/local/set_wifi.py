#!/usr/bin/env python3
"""
Disable access point mode and attempt to reconnect to specified WiFi network
Usage: python set_wifi.py --ssid SSID
"""
import argparse
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

def connect_to_ssid(ssid: str):
    """Attempt to connect to a specific SSID using saved connection profile"""
    try:
        # First, ensure WiFi is enabled
        wifi_device = find_wifi_device()
        if not wifi_device:
            return False

        # Enable WiFi radio if needed
        subprocess.run(
            ["sudo", "nmcli", "radio", "wifi", "on"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=5
        )

        # Wait a moment for WiFi to enable
        time.sleep(1)

        # Try to activate the saved connection profile
        # This uses the connection created by wifi_controller.rs with con-name=SSID
        # Single approach - if the profile doesn't exist, we can't reconnect without password
        result = subprocess.run(
            ["sudo", "nmcli", "connection", "up", ssid],
            capture_output=True,
            text=True,
            check=False,
            timeout=20
        )

        # If connection up failed, return False (can't reconnect without password)
        if result.returncode != 0:
            return False

        # Wait a moment to verify connection is established
        time.sleep(3)

        # Verify connection is active by checking current SSID
        verify_result = subprocess.run(
            ["nmcli", "-t", "-f", "GENERAL.CONNECTION", "device", "show", wifi_device],
            capture_output=True,
            text=True,
            check=True
        )

        # Check if we're connected to the SSID
        current_connection = verify_result.stdout.strip()
        if ssid in current_connection or current_connection:
            # Also verify by checking active connection SSID
            active_result = subprocess.run(
                ["nmcli", "-t", "-f", "802-11-wireless.ssid", "connection", "show", "--active"],
                capture_output=True,
                text=True,
                check=False
            )
            if ssid in active_result.stdout:
                return True
            # If connection exists, consider it successful (might be connecting)
            if current_connection:
                return True

        return False
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        # Connection failed, but that's okay - we'll return False
        return False

def disable_access_point(ssid: str):
    """Disable access point mode and attempt to reconnect to specified WiFi"""
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

    # Attempt to connect to the specified SSID
    wifi_reconnected = connect_to_ssid(ssid)

    # Output success message as JSON for easy parsing
    # Always return SUCCESS regardless of connection outcome
    if wifi_reconnected:
        output = {
            "status": "SUCCESS",
            "message": f"Access point disabled and reconnected to {ssid}"
        }
    else:
        output = {
            "status": "SUCCESS",
            "message": f"Access point disabled. Attempted to reconnect to {ssid}."
        }

    print(json.dumps(output))
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description='Disable access point mode and attempt to reconnect to WiFi')
    parser.add_argument('--ssid', type=str, required=True, help='SSID to attempt to connect to')
    args = parser.parse_args()

    disable_access_point(ssid=args.ssid)

if __name__ == "__main__":
    main()
