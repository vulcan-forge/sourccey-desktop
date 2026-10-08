"""Validate Rust-generated connection arguments with nmcli --offline (no daemon).

Generate fixtures with SOURCCEY_WIFI_FIXTURES pointing to a JSON file and run:
  cargo test --no-default-features exports_offline_networkmanager_fixtures
Then run this script with the fixture file and the path to nmcli. Only synthetic
credentials are used. No host network connections are created or changed.
"""

import argparse
import configparser
import json
import re
import subprocess
from pathlib import Path


def keyfile_string(value):
    # GLib keyfiles escape backslashes and leading spaces, unlike configparser.
    escapes = {"s": " ", "n": "\n", "r": "\r", "t": "\t", "\\": "\\"}
    return re.sub(r"\\([snrt\\])", lambda match: escapes[match[1]], value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fixtures", type=Path)
    parser.add_argument("nmcli", type=Path)
    parser.add_argument("--hotspot", type=Path)
    args = parser.parse_args()
    cases = json.loads(args.fixtures.read_text(encoding="utf-8"))
    print(subprocess.check_output([str(args.nmcli), "--version"], text=True).strip())
    for case in cases:
        command = [str(args.nmcli), "--offline", "connection", "add", *case["args"][2:]]
        result = subprocess.run(command, text=True, capture_output=True, check=True)
        profile = configparser.ConfigParser(interpolation=None)
        profile.read_string(result.stdout)
        assert profile["connection"]["uuid"] == case["uuid"], case["label"]
        assert profile["connection"]["autoconnect"] == "false", case["label"]
        assert "interface-name" not in profile["connection"], case["label"]
        assert keyfile_string(profile["wifi"]["ssid"]) == case["ssid"], case["label"]
        if case["key_mgmt"]:
            security = profile["wifi-security"]
            assert security["key-mgmt"] == case["key_mgmt"], case["label"]
            assert keyfile_string(security["psk"]) == case["password"], case["label"]
            assert security["pmf"] == case["pmf"], case["label"]
            if case["proto"]:
                assert security["proto"].rstrip(";") == case["proto"], case["label"]
            else:
                assert not security.get("proto"), case["label"]
            assert not security.get("pairwise"), case["label"]
            assert not security.get("group"), case["label"]
        else:
            assert "wifi-security" not in profile, case["label"]
        print(f"PASS: {case['label']} — profile accepted and settings verified")

    # Reproduce the reported class of error, then prove that the generated
    # profiles avoid it by explicitly specifying key management.
    secured = next(case for case in cases if case["label"] == "WPA3")
    broken_args = list(secured["args"])
    position = broken_args.index("wifi-sec.key-mgmt")
    del broken_args[position:position + 2]
    broken = subprocess.run(
        [str(args.nmcli), "--offline", *broken_args],
        text=True, capture_output=True,
    )
    assert broken.returncode != 0, "A secured profile without key-mgmt must be rejected"
    assert "key-mgmt" in broken.stderr and "missing" in broken.stderr, broken.stderr
    print("PASS: reproduced missing key-mgmt error in a deliberately malformed profile")
    if args.hotspot:
        hotspot_args = json.loads(args.hotspot.read_text(encoding="utf-8"))["args"]
        result = subprocess.run([str(args.nmcli), "--offline", *hotspot_args], text=True, capture_output=True, check=True)
        profile = configparser.ConfigParser(interpolation=None)
        profile.read_string(result.stdout)
        assert profile["wifi"]["mode"] == "ap"
        assert profile["wifi"]["band"] == "bg" and profile["wifi"]["channel"] == "6"
        assert profile["wifi-security"]["key-mgmt"] == "wpa-psk"
        assert profile["wifi-security"]["proto"].rstrip(";") == "rsn"
        assert profile["wifi-security"]["pairwise"].rstrip(";") == "ccmp"
        assert profile["ipv4"]["method"] == "shared"
        assert profile["ipv4"]["address1"] == "192.168.4.1/24"
        assert profile["ipv6"]["method"] == "disabled"
        assert profile["connection"]["autoconnect"] == "false"
        print("PASS: hotspot profile accepted with WPA2, 2.4 GHz, shared DHCP and the verified robot subnet")


if __name__ == "__main__":
    main()
