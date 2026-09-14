#!/usr/bin/env python3
"""Provision only the Sourccey BQ34Z100 battery gauge."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from setup.kiosk.components.setup_battery import BatterySetupManager


def print_status(message: str) -> None:
    print(f"[INFO] {message}")


def print_success(message: str) -> None:
    print(f"[SUCCESS] {message}")


def print_warning(message: str) -> None:
    print(f"[WARNING] {message}")


def print_error(message: str) -> None:
    print(f"[ERROR] {message}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Identify, provision, and verify the BQ34Z100 battery gauge only."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reflash even when the gauge already reports UpdateStatus=0x06.",
    )
    args = parser.parse_args()

    if os.name != "nt" and hasattr(os, "geteuid") and os.geteuid() != 0:
        print_error("Battery provisioning requires root access.")
        print_error("Run: sudo python3 setup/kiosk/setup_battery.py")
        return 1

    manager = BatterySetupManager(
        PROJECT_ROOT,
        print_status,
        print_success,
        print_warning,
        print_error,
    )
    if not manager.ensure_golden_image(force=args.force):
        print_error("Battery gauge provisioning failed")
        return 1

    print_success("Battery gauge provisioning completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
