#!/usr/bin/env python3
"""
Set robot to access point mode (broadcast WiFi)
Usage: python set_access_point.py --ssid <SSID> --password <PASSWORD>
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
        return "192.168.4.1"  # Default AP IP
    except subprocess.CalledProcessError:
        return "192.168.4.1"

def set_access_point(ssid, password):
    """Set the robot to access point mode"""
    # Find WiFi device
    wifi_device = find_wifi_device()
    if not wifi_device:
        print("ERROR: No WiFi device found", file=sys.stderr)
        sys.exit(1)

    # Disconnect any existing connections
    subprocess.run(
        ["nmcli", "device", "disconnect", wifi_device],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Remove existing hotspot if it exists
    subprocess.run(
        ["nmcli", "connection", "delete", "Hotspot"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Create access point connection
    try:
        result = subprocess.run(
            [
                "nmcli", "connection", "add",
                "type", "wifi",
                "ifname", wifi_device,
                "con-name", "Hotspot",
                "autoconnect", "yes",
                "ssid", ssid,
                "802-11-wireless.mode", "ap",
                "802-11-wireless-security.key-mgmt", "wpa-psk",
                "802-11-wireless-security.psk", password,
                "ipv4.method", "shared"
            ],
            capture_output=True,
            text=True,
            check=True
        )
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to create access point: {e.stderr}", file=sys.stderr)
        sys.exit(1)

    # Activate the hotspot with retry
    for attempt in range(3):
        try:
            result = subprocess.run(
                ["nmcli", "connection", "up", "Hotspot"],
                capture_output=True,
                text=True,
                check=True
            )
            break
        except subprocess.CalledProcessError:
            if attempt == 2:
                print("ERROR: Failed to activate access point after 3 attempts", file=sys.stderr)
                sys.exit(1)
            time.sleep(1)

    # Wait for connection to establish
    time.sleep(2)

    # Verify connection is active
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "NAME", "connection", "show", "--active"],
            capture_output=True,
            text=True,
            check=True
        )
        if "Hotspot" not in result.stdout:
            print("ERROR: Access point created but not activated", file=sys.stderr)
            sys.exit(1)
    except subprocess.CalledProcessError:
        # Verification might fail but continue
        pass

    # Get IP address
    ip_address = get_ip_address(wifi_device)

    # Output success message as JSON for easy parsing
    output = {
        "status": "SUCCESS",
        "message": f"Access point '{ssid}' activated successfully",
        "ssid": ssid,
        "ip_address": ip_address
    }
    print(json.dumps(output))
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="Set robot to access point mode")
    parser.add_argument("--ssid", required=True, help="SSID for the access point")
    parser.add_argument("--password", required=True, help="Password for the access point")

    args = parser.parse_args()
    set_access_point(args.ssid, args.password)

if __name__ == "__main__":
    main()
