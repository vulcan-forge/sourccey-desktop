# Kiosk device setup

The production and development kiosk installers install the mappings in
`99-robot-hardware-ports.rules` through `components/setup_devices.py` after the
robot Python environment is installed. The Python package's udev step is skipped
in these flows so it does not also write the same rules file. Direct use of
`sourccey-setup robot` outside kiosk setup still uses that package's bundled rules.

From the desktop repository root on the Pi, install or repair only the mappings:

```bash
sudo python3 setup/kiosk/setup.py --devices-only
```

This needs no Python virtual environment, package installation, application build,
or battery provisioning. Stop the robot host before applying hardware mappings.
The installer backs up a changed destination, installs the rules at
`/etc/udev/rules.d/99-robot-hardware-ports.rules`, reloads udev, triggers serial and
camera devices, waits for events to settle, and reports the aliases it finds.
Unplugged devices produce warnings; installation or conflicting mappings fail
setup. Other rule files are preserved.

This file is authoritative. Each setup run compares the installed contents with
the repository version and overwrites it when they differ. Before overwriting,
the installer saves the previous contents as `99-robot-hardware-ports.rules.bak`;
the `.bak` file is ignored by udev and does not provide compatibility behavior.
Setup also removes the obsolete active file `99-sourccey-hardware.rules` when it
contains only duplicate Sourccey aliases. This leaves one active source of device
mappings. A file with that name containing any unrelated alias is left untouched
and setup stops with a conflict instead.

The mappings describe the production Raspberry Pi 5 USB wiring. Identical cameras
are distinguished by physical port. Devices wired to different ports need a
verified mapping for that layout; `/dev/videoN` and `/dev/ttyUSBN` numbers must
not be used as persistent identities.

Verify the two arms, five cameras, and LiDAR:

```bash
ls -l /dev/robotLeftArm /dev/robotRightArm /dev/lidarFront
ls -l /dev/cameraFrontLeft /dev/cameraFrontRight /dev/cameraFrontBottom
ls -l /dev/cameraWristLeft /dev/cameraWristRight
```

Repeat these checks after reboot. Alias presence reports device enumeration, not
camera streaming or motor health. The underside camera's production alias is
`/dev/cameraFrontBottom`; pass it explicitly to the older diagnostic script:

```bash
cd modules/lerobot-vulcan
uv run python scripts/sourccey_check_bottom_camera.py --device /dev/cameraFrontBottom --seconds 10
```

Audio output is detected by Linux sound-card enumeration and has no USB role
alias in this rules file.

## Robot Wi-Fi permission repair

The full kiosk installer configures NetworkManager authorization before builds
and dependency setup. Repair only that authorization with:

```bash
sudo python3 setup/kiosk/setup.py --network-permission-only
```

Confirm that the kiosk account can control Wi-Fi and connections:

```bash
sudo -u sourccey nmcli general permissions | grep -E 'enable-disable-wifi|network-control|settings.modify.system|wifi.share'
```

Each listed permission should report `yes`. Restart Vulcan Studio after repairing
the rule. If an older build left the robot hotspot active, stop its profile once
from a terminal, then use the app normally:

```bash
sudo nmcli connection modify "Sourccey Hotspot" connection.autoconnect no
sudo nmcli connection down "Sourccey Hotspot"
```

## Kiosk network connections

The Network dialog shows Ethernet independently of Wi-Fi. The header and home
card update from live NetworkManager state every three seconds. Plugging in a
cable automatically activates a managed Ethernet adapter; if no compatible
profile exists, NetworkManager creates a default DHCP profile. Existing office
profiles, including static addresses, are reused. The same network-control
permission above covers Ethernet; no additional authorization rule is needed.

The dialog distinguishes an unplugged cable, address negotiation, a connected
local network, Internet access, and a network requiring sign-in. It displays
IPv4/IPv6 addresses, the IPv4 gateway, and the default connection. A failed
automatic attempt waits for manual retry or a new cable insertion, so office
DHCP or authentication failures do not cause repeated reconnect attempts.
Unmanaged adapters require IT to enable NetworkManager; enterprise wired
authentication must already be configured in the saved office profile.

Personal Wi-Fi supports WPA/WPA2, WPA2/WPA3 transition mode, and WPA3-only SAE.
During activation, the kiosk explicitly supplies the PSK through NetworkManager's
documented `passwd-file` option as well as saving it in the connection profile.
The temporary file is created exclusively with mode `0600` on Linux and removed
after success or failure. Invalid WPA2 keys and line breaks are rejected before
network changes. Failed activation removes only the attempted profile and tries
to restore the previous Wi-Fi connection. Enterprise Wi-Fi requires identity/EAP
configuration and is reported as unsupported by this password-only UI.

After installing the updated kiosk build, verify on the actual Pi:

- Join a WPA2/WPA3 office network and a WPA3-only test network with a valid
  password; repeat with a wrong password and confirm an actionable error.
- Reboot after joining and confirm the saved Wi-Fi connection reconnects.
- Plug in Ethernet with Wi-Fi connected, then unplug and reconnect it. Confirm
  the displayed connection and addresses follow the cable and default route.
- Repeat with the robot hotspot active; wired status should work without
  stopping the hotspot. Check local-only, DHCP failure, and captive portal cases.

Regression checks: `bun run test:wifi-ui`, `bun test tests/build tests/frontend`,
`bunx tsc --noEmit`, and `cargo test --manifest-path src-tauri/Cargo.toml
--bin VulcanStudio --no-default-features`. The browser suite mocks native IPC;
Rust tests validate command construction and secret cleanup. These checks do not
replace physical radio/cable validation. NetworkManager reference:
[connection activation and device management](https://networkmanager.pages.freedesktop.org/NetworkManager/NetworkManager/nmcli.html).
