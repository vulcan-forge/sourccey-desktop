"""Exercise the desktop's embedded motor discovery with simulated serial ports."""
import ast
import contextlib
import io
import json
import re
import subprocess
import sys
import types
from pathlib import Path
from unittest.mock import patch


def test_discovery_pings_each_motor_and_deduplicates_aliases():
    service = Path('src-tauri/src/modules/control/services/configuration/calibration_service.rs').read_text()
    script = re.search(r'const DESKTOP_LIST_SERIAL_PORTS_SCRIPT: &str = r#"\n(.*?)\n"#;', service, re.S).group(1)
    probe_script = ast.literal_eval(next(n.value for n in ast.parse(script).body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'PROBE_SCRIPT' for t in n.targets)))
    feetech = types.ModuleType('lerobot.motors.feetech')
    closed = []

    class Bus:
        def __init__(self, port, motors):
            self.is_connected = False
        def connect(self, handshake):
            self.is_connected = True
        def set_baudrate(self, baudrate):
            assert baudrate == 1_000_000
        def ping(self, motor_id, num_retry):
            assert num_retry == 1
            return 0 if motor_id in range(1, 7) else None
        def disconnect(self, disable_torque):
            assert not disable_torque
            closed.append(True)

    feetech.FeetechMotorsBus = Bus
    serial = types.ModuleType('serial')
    serial_tools = types.ModuleType('serial.tools')
    serial_tools.list_ports = types.SimpleNamespace(comports=lambda: [types.SimpleNamespace(device=p) for p in ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/busy']])
    modules = {'serial': serial, 'serial.tools': serial_tools, 'lerobot': types.ModuleType('lerobot'), 'lerobot.motors': types.ModuleType('lerobot.motors'), 'lerobot.motors.feetech': feetech}
    output = io.StringIO()
    with patch.dict(sys.modules, modules), patch.object(sys, 'argv', ['-c', '/dev/robotLeftArm']), contextlib.redirect_stdout(output):
        exec(probe_script, {})
    assert json.loads(output.getvalue())['motorIds'] == list(range(1, 7))
    assert closed == [True]

    def resolve(path, *args, **kwargs):
        aliases = {'/dev/robotLeftArm': '/dev/ttyUSB0', '/dev/robotRightArm': '/dev/ttyUSB1'}
        return Path(aliases.get(str(path), str(path)))

    def run(args, **kwargs):
        assert kwargs['timeout'] == 15
        if args[-1] == '/dev/busy':
            raise subprocess.TimeoutExpired(args, 15)
        ids = list(range(1, 7)) if args[-1] == '/dev/robotLeftArm' else list(range(7, 12))
        return types.SimpleNamespace(stdout=json.dumps({'motorIds': ids, 'probeError': None}))

    output = io.StringIO()
    with patch.dict(sys.modules, modules), patch.object(Path, 'resolve', resolve), patch.object(Path, 'exists', lambda p: str(p) in ('/dev/robotLeftArm', '/dev/robotRightArm')), patch.object(subprocess, 'run', run), contextlib.redirect_stdout(output):
        exec(script, {})
    results = {p['port']: p for p in json.loads(output.getvalue())}
    assert set(results) == {'/dev/robotLeftArm', '/dev/robotRightArm', '/dev/busy'}
    assert results['/dev/robotLeftArm']['motorIds'] == list(range(1, 7))
    assert results['/dev/robotLeftArm']['suggestedArm'] == 'left'
    assert results['/dev/robotLeftArm']['isComplete']
    assert results['/dev/robotRightArm']['motorIds'] == list(range(7, 12))
    assert results['/dev/robotRightArm']['suggestedArm'] == 'right'
    assert not results['/dev/robotRightArm']['isComplete']
    assert results['/dev/busy']['probeError'] == 'Motor probe timed out'


def test_discovery_deduplicates_macos_ports_and_preserves_windows_ports():
    service = Path('src-tauri/src/modules/control/services/configuration/calibration_service.rs').read_text()
    script = re.search(r'const DESKTOP_LIST_SERIAL_PORTS_SCRIPT: &str = r#"\n(.*?)\n"#;', service, re.S).group(1)
    serial = types.ModuleType('serial')
    serial_tools = types.ModuleType('serial.tools')
    modules = {'serial': serial, 'serial.tools': serial_tools}
    def run(args, **kwargs):
        return types.SimpleNamespace(stdout=json.dumps({'motorIds': [1], 'probeError': None}))
    for platform, ports, expected in [
        ('darwin', ['/dev/tty.usbmodem1', '/dev/cu.usbmodem1', '/dev/cu.usbmodem2'], {'/dev/cu.usbmodem1', '/dev/cu.usbmodem2'}),
        ('win32', ['COM3', 'COM8'], {'COM3', 'COM8'}),
    ]:
        serial_tools.list_ports = types.SimpleNamespace(comports=lambda: [types.SimpleNamespace(device=p) for p in ports])
        output = io.StringIO()
        with patch.dict(sys.modules, modules), patch.object(sys, 'platform', platform), patch.object(Path, 'resolve', lambda p: p), patch.object(Path, 'exists', lambda p: False), patch.object(subprocess, 'run', run), contextlib.redirect_stdout(output):
            exec(script, {})
        assert {p['port'] for p in json.loads(output.getvalue())} == expected
