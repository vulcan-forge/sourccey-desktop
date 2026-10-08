#!/usr/bin/env python3
"""Install and verify the kiosk's production hardware device aliases."""

from __future__ import annotations

import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
from typing import Callable


RULES_SOURCE = Path(__file__).resolve().parents[1] / "99-sourccey-hardware.rules"
RULES_DESTINATION = Path("/etc/udev/rules.d/99-sourccey-hardware.rules")
DEVICE_DIRECTORY = Path("/dev")
EXPECTED_ALIASES = (
    "robotLeftArm", "robotRightArm",
    "cameraFrontLeft", "cameraFrontRight",
    "cameraWristLeft", "cameraWristRight",
    "cameraFrontBottom", "lidarFront",
)


def setup_devices(
    print_status: Callable[[str], None],
    print_success: Callable[[str], None],
    print_warning: Callable[[str], None],
    print_error: Callable[[str], None],
) -> bool:
    """Install persistent rules, preserving other rule files and backing up changes.

    Missing hardware is reported separately from installation failure: robots may
    be provisioned with devices unplugged. This never opens a camera or serial bus.
    """
    if platform.system() != "Linux":
        print_error("Sourccey device mapping requires Linux")
        return False
    if shutil.which("udevadm") is None:
        print_error("udevadm is missing; install udev before setting up devices")
        return False

    prefix = [] if os.geteuid() == 0 else ["sudo"]
    print_status("Installing Sourccey hardware device mappings...")
    try:
        rules = RULES_SOURCE.read_text(encoding="utf-8")
        aliases = set(re.findall(r'SYMLINK\+="([^"]+)"', rules))
        if aliases != set(EXPECTED_ALIASES):
            print_error(f"The hardware rules at {RULES_SOURCE} have unexpected or missing aliases")
            return False

        # Another file assigning the same role could silently swap camera/arm
        # identities. Stop for a concrete conflict instead of rewriting that file.
        for other in RULES_DESTINATION.parent.glob("*.rules"):
            if other == RULES_DESTINATION:
                continue
            for line in other.read_text(encoding="utf-8").splitlines():
                if line.lstrip().startswith("#"):
                    continue
                for value in re.findall(r'SYMLINK\s*\+?=\s*"([^"]+)"', line):
                    duplicates = aliases.intersection(value.split())
                    if duplicates:
                        print_error(
                            f"Conflicting hardware aliases in {other}: {', '.join(sorted(duplicates))}. "
                            "Resolve the existing mapping before rerunning device setup."
                        )
                        return False

        def run(args: list[str]) -> None:
            subprocess.run(prefix + args, check=True, timeout=60)

        installed = RULES_DESTINATION.read_text(encoding="utf-8") if RULES_DESTINATION.exists() else None
        if installed != rules:
            run(["install", "-d", "-m", "755", str(RULES_DESTINATION.parent)])
            if installed is not None:
                backup = str(RULES_DESTINATION) + ".bak"
                run(["cp", "--backup=numbered", str(RULES_DESTINATION), backup])
                print_status(f"Backed up previous hardware rules to {backup}")
            run(["install", "-m", "644", str(RULES_SOURCE), str(RULES_DESTINATION)])
        else:
            print_status("Hardware rules already match; refreshing device aliases")

        run(["udevadm", "control", "--reload-rules"])
        for subsystem in ("tty", "video4linux"):
            run(["udevadm", "trigger", "--action=add", f"--subsystem-match={subsystem}"])
        run(["udevadm", "settle", "--timeout=30"])
        print_success(f"Hardware rules installed at {RULES_DESTINATION}")

        resolved = {}
        for alias in EXPECTED_ALIASES:
            path = DEVICE_DIRECTORY / alias
            if not path.exists():
                print_warning(f"Missing {path}: check the device cable and its production USB port")
                continue
            target = path.resolve()
            if target in resolved:
                print_error(f"{path} and {resolved[target]} both resolve to {target}; check the device mappings")
                return False
            resolved[target] = path
            print_status(f"{path} -> {target}")
        return True
    except (OSError, subprocess.SubprocessError) as exc:
        print_error(f"Hardware device setup failed: {exc}")
        return False
