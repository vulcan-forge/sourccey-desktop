# Kiosk device setup

The production and development kiosk installers install the mappings in
`99-sourccey-hardware.rules` through `components/setup_devices.py` after the
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
`/etc/udev/rules.d/99-sourccey-hardware.rules`, reloads udev, triggers serial and
camera devices, waits for events to settle, and reports the aliases it finds.
Unplugged devices produce warnings; installation or conflicting mappings fail
setup. Other rule files are preserved.

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
