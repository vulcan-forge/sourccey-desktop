#!/usr/bin/env python3
"""BQ34Z100 provisioning for Sourccey kiosk installations."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Callable


class BatterySetupManager:
    """Ensure the robot's BQ34Z100 contains the learned golden image."""

    I2C_DEVICE = Path("/dev/i2c-1")
    EXPECTED_DEVICE_TYPE = 0x0100
    GOLDEN_UPDATE_STATUS = 0x06
    CONFIGURE_MODULE = "lerobot_robot_sourccey.battery.configure_bq34z100"
    FLASH_MODULE = "lerobot_robot_sourccey.battery.golden.flash_bq34z100"

    def __init__(
        self,
        project_root: Path,
        print_status: Callable[[str], None],
        print_success: Callable[[str], None],
        print_warning: Callable[[str], None],
        print_error: Callable[[str], None],
    ):
        self.lerobot_path = project_root / "modules" / "lerobot-vulcan"
        self.python_path = self.lerobot_path / ".venv" / "bin" / "python"
        self.print_status = print_status
        self.print_success = print_success
        self.print_warning = print_warning
        self.print_error = print_error

    def _run(
        self, module: str, args: list[str], *, capture_output: bool
    ) -> subprocess.CompletedProcess:
        env = os.environ.copy()
        command = [str(self.python_path), "-m", module, *args]
        return subprocess.run(
            command,
            cwd=self.lerobot_path,
            env=env,
            capture_output=capture_output,
            text=capture_output,
        )

    @staticmethod
    def _json_value(payload: dict, key: str) -> int:
        value = payload[key]
        return int(value, 0) if isinstance(value, str) else int(value)

    def _read_json(self, args: list[str], label: str) -> dict | None:
        self.print_status(f"{label}...")
        try:
            result = self._run(self.CONFIGURE_MODULE, args, capture_output=True)
        except OSError as exc:
            self.print_error(f"{label} failed: {exc}")
            return None

        if result.returncode != 0:
            details = (result.stderr or result.stdout or "unknown I2C error").strip()
            self.print_error(f"{label} failed: {details}")
            return None
        try:
            payload = json.loads(result.stdout)
        except (json.JSONDecodeError, TypeError) as exc:
            self.print_error(f"{label} returned invalid data: {exc}")
            return None
        if not isinstance(payload, dict):
            self.print_error(f"{label} returned an unexpected JSON value")
            return None
        return payload

    def ensure_golden_image(self) -> bool:
        """Flash only an identified gauge whose learned status is not 0x06."""
        if not self.I2C_DEVICE.exists():
            self.print_warning(
                "Skipping BQ34Z100 provisioning because /dev/i2c-1 is unavailable"
            )
            return True
        if not self.python_path.is_file():
            self.print_error(
                f"BQ34Z100 setup requires the robot Python environment at {self.python_path}"
            )
            return False

        identity = self._read_json(["info"], "Reading BQ34Z100 identity")
        if identity is None:
            return False
        try:
            device_type = self._json_value(identity, "device_type")
        except (KeyError, TypeError, ValueError) as exc:
            self.print_error(f"Could not read BQ34Z100 device type: {exc}")
            return False
        if device_type != self.EXPECTED_DEVICE_TYPE:
            self.print_error(
                f"Refusing to flash unexpected battery gauge type 0x{device_type:04X}; "
                f"expected 0x{self.EXPECTED_DEVICE_TYPE:04X}"
            )
            return False

        status_payload = self._read_json(
            ["read-field", "--field", "update_status"],
            "Reading BQ34Z100 learning status",
        )
        if status_payload is None:
            return False
        try:
            update_status = self._json_value(status_payload, "value")
        except (KeyError, TypeError, ValueError) as exc:
            self.print_error(f"Could not read BQ34Z100 UpdateStatus: {exc}")
            return False

        if update_status == self.GOLDEN_UPDATE_STATUS:
            self.print_success(
                "BQ34Z100 already contains the learned golden image (UpdateStatus=0x06)"
            )
            return True

        self.print_warning(
            f"BQ34Z100 UpdateStatus is 0x{update_status:02X}, not 0x06; flashing the learned golden image"
        )
        try:
            flash_result = self._run(
                self.FLASH_MODULE, ["--profile", "bq"], capture_output=False
            )
        except OSError as exc:
            self.print_error(f"BQ34Z100 golden-image flash failed: {exc}")
            return False
        if flash_result.returncode != 0:
            self.print_error("BQ34Z100 golden-image flash failed")
            return False

        verified_payload = self._read_json(
            ["read-field", "--field", "update_status"],
            "Verifying BQ34Z100 learning status after flash",
        )
        if verified_payload is None:
            return False
        try:
            verified_status = self._json_value(verified_payload, "value")
        except (KeyError, TypeError, ValueError) as exc:
            self.print_error(f"Could not verify BQ34Z100 UpdateStatus: {exc}")
            return False
        if verified_status != self.GOLDEN_UPDATE_STATUS:
            self.print_error(
                f"BQ34Z100 flash completed but UpdateStatus is 0x{verified_status:02X}; expected 0x06"
            )
            return False

        self.print_success(
            "BQ34Z100 learned golden image flashed and verified successfully"
        )
        return True
