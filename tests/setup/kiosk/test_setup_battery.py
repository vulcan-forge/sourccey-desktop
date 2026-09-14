from __future__ import annotations

import json
from types import SimpleNamespace

from setup.kiosk.components.setup_battery import BatterySetupManager


def _noop(*_args, **_kwargs):
    return None


def _manager_with_i2c(tmp_path) -> BatterySetupManager:
    manager = BatterySetupManager(tmp_path, _noop, _noop, _noop, _noop)
    manager.I2C_DEVICE = tmp_path / "i2c-1"
    manager.I2C_DEVICE.touch()
    manager.python_path.parent.mkdir(parents=True)
    manager.python_path.touch()
    return manager


def test_battery_provisioning_skips_learned_golden_image(monkeypatch, tmp_path):
    manager = _manager_with_i2c(tmp_path)
    commands = []
    responses = iter(
        [
            SimpleNamespace(
                returncode=0, stdout=json.dumps({"device_type": "0x0100"}), stderr=""
            ),
            SimpleNamespace(
                returncode=0, stdout=json.dumps({"value": "0x06"}), stderr=""
            ),
        ]
    )

    def fake_run(module, args, *, capture_output):
        commands.append((module, args, capture_output))
        return next(responses)

    monkeypatch.setattr(manager, "_run", fake_run)

    assert manager.ensure_golden_image() is True
    assert len(commands) == 2
    assert all(module != manager.FLASH_MODULE for module, _, _ in commands)


def test_battery_provisioning_flashes_and_verifies_unlearned_gauge(
    monkeypatch, tmp_path
):
    manager = _manager_with_i2c(tmp_path)
    commands = []
    responses = iter(
        [
            SimpleNamespace(
                returncode=0, stdout=json.dumps({"device_type": "0x0100"}), stderr=""
            ),
            SimpleNamespace(
                returncode=0, stdout=json.dumps({"value": "0x00"}), stderr=""
            ),
            SimpleNamespace(returncode=0, stdout=None, stderr=None),
            SimpleNamespace(
                returncode=0, stdout=json.dumps({"value": "0x06"}), stderr=""
            ),
        ]
    )

    def fake_run(module, args, *, capture_output):
        commands.append((module, args, capture_output))
        return next(responses)

    monkeypatch.setattr(manager, "_run", fake_run)

    assert manager.ensure_golden_image() is True
    flash_commands = [
        (args, capture)
        for module, args, capture in commands
        if module == manager.FLASH_MODULE
    ]
    assert flash_commands == [(["--profile", "bq"], False)]
    assert commands[-1][2] is True


def test_battery_provisioning_refuses_unexpected_gauge(monkeypatch, tmp_path):
    manager = _manager_with_i2c(tmp_path)
    commands = []

    def fake_run(module, args, *, capture_output):
        commands.append((module, args, capture_output))
        return SimpleNamespace(
            returncode=0, stdout=json.dumps({"device_type": "0x9999"}), stderr=""
        )

    monkeypatch.setattr(manager, "_run", fake_run)

    assert manager.ensure_golden_image() is False
    assert len(commands) == 1
