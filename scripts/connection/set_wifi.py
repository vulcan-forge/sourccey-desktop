#!/usr/bin/env python3
"""
Connect robot to WiFi network
Usage: python set_wifi.py --ssid <SSID> --password <PASSWORD>
"""

import argparse
import subprocess
import sys
import time
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

def get_ip_address(device):
    """Get IP address of the device"""
    try:
        result = subprocess.run(
            ["ip", "addr", "show", device],
            capture_output=True,
            text=True,
            check=True
        )
        for line in result.stdout.split('\n'):
            if 'inet ' in line and not '127.0.0.1' in line:
                parts = line.strip().split()
                if len(parts) >= 2:
                    ip = parts[1].split('/')[0]
                    return ip
        return "Not assigned"
    except subprocess.CalledProcessError:
        return "Not assigned"

def set_wifi(ssid, password):
    """Connect robot to WiFi network"""
    # Find WiFi device
    wifi_device = find_wifi_device()
    if not wifi_device:
        print("ERROR: No WiFi device found", file=sys.stderr)
        sys.exit(1)

    # Disconnect existing connections
    subprocess.run(
        ["nmcli", "device", "disconnect", wifi_device],
        capture_output=True,
        stderr=subprocess.DEVNULL
    )

    # Remove hotspot if switching from AP mode
    subprocess.run(
        ["nmcli", "connection", "delete", "Hotspot"],
        capture_output=True,
        stderr=subprocess.DEVNULL
    )

    # Connect to WiFi with retry
    for attempt in range(3):
        try:
            result = subprocess.run(
                ["nmcli", "device", "wifi", "connect", ssid, "password", password],
                capture_output=True,
                text=True,
                check=True
            )
            break
        except subprocess.CalledProcessError as e:
            if attempt == 2:
                error_msg = e.stderr if e.stderr else e.stdout
                print(f"ERROR: Failed to connect to WiFi after 3 attempts: {error_msg}", file=sys.stderr)
                sys.exit(1)
            time.sleep(2)

    # Wait for connection to establish
    time.sleep(3)

    # Verify connection is active
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "NAME,DEVICE", "connection", "show", "--active"],
            capture_output=True,
            text=True,
            check=True
        )
        # Check if we have an active connection on wifi_device that's not Hotspot
        found_active = False
        for line in result.stdout.strip().split('\n'):
            parts = line.split(':')
            if len(parts) >= 2 and parts[1] == wifi_device and parts[0] != "Hotspot":
                found_active = True
                break

        if not found_active:
            print("ERROR: WiFi connection not active", file=sys.stderr)
            sys.exit(1)
    except subprocess.CalledProcessError:
        # Verification might fail but continue
        pass

    # Get IP address
    ip_address = get_ip_address(wifi_device)

    # Output success message as JSON for easy parsing
    output = {
        "status": "SUCCESS",
        "message": f"Connected to WiFi '{ssid}' successfully",
        "ssid": ssid,
        "ip_address": ip_address
    }
    print(json.dumps(output))
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="Connect robot to WiFi network")
    parser.add_argument("--ssid", required=True, help="SSID of the WiFi network")
    parser.add_argument("--password", required=True, help="Password for the WiFi network")

    args = parser.parse_args()
    set_wifi(args.ssid, args.password)

if __name__ == "__main__":
    main()
