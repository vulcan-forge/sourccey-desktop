#!/usr/bin/env python3
"""
App Configuration Module for Sourccey Kiosk

Detects app configuration from various config files.
"""

import json
from pathlib import Path
from typing import Callable, Dict

class AppConfigDetector:
    def __init__(self, project_root: Path, print_status: Callable,
                 print_success: Callable, print_warning: Callable):
        self.project_root = project_root
        self.print_status = print_status
        self.print_success = print_success
        self.print_warning = print_warning

    def read_package_json(self) -> Dict[str, str]:
        """Read configuration from package.json"""
        pkg_json = self.project_root / "package.json"
        info = {}

        if pkg_json.exists():
            try:
                with open(pkg_json) as f:
                    pkg_data = json.load(f)
                    info['package_name'] = pkg_data.get('name', 'sourccey-desktop')
                    info['version'] = pkg_data.get('version', '0.0.0')
            except Exception as e:
                self.print_warning(f"Could not read package.json: {e}")

        return info

    def read_tauri_config(self) -> Dict[str, str]:
        """Read configuration from tauri.conf.json"""
        tauri_conf = self.project_root / "src-tauri" / "tauri.conf.json"
        info = {}

        if tauri_conf.exists():
            try:
                with open(tauri_conf) as f:
                    tauri_data = json.load(f)
                    info['product_name'] = tauri_data.get('productName', 'Sourccey')
            except Exception as e:
                self.print_warning(f"Could not read tauri.conf.json: {e}")

        return info

    def read_cargo_toml(self) -> Dict[str, str]:
        """Read configuration from Cargo.toml"""
        cargo_toml = self.project_root / "src-tauri" / "Cargo.toml"
        info = {}

        if cargo_toml.exists():
            try:
                with open(cargo_toml) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('name ='):
                            info['binary_name'] = line.split('=')[1].strip().strip('"\'')
                            break
            except Exception as e:
                self.print_warning(f"Could not read Cargo.toml: {e}")

        return info

    def detect(self) -> Dict[str, str]:
        """Detect all app configuration"""
        self.print_status("Detecting app configuration...")

        info = {}

        # Read from various config files
        info.update(self.read_package_json())
        info.update(self.read_tauri_config())
        info.update(self.read_cargo_toml())

        # Fallback defaults
        info.setdefault('product_name', 'Sourccey')
        info.setdefault('binary_name', 'sourccey')
        info.setdefault('package_name', 'sourccey-desktop')
        info.setdefault('version', '0.0.0')

        self.print_success("App configuration detected:")
        self.print_status(f"  Product Name: {info['product_name']}")
        self.print_status(f"  Binary Name: {info['binary_name']}")
        self.print_status(f"  Package Name: {info['package_name']}")
        self.print_status(f"  Version: {info['version']}")

        return info


def detect_app_config(project_root: Path, print_status, print_success,
                     print_warning) -> Dict[str, str]:
    """Convenience function for detecting app configuration"""
    detector = AppConfigDetector(
        project_root, print_status, print_success, print_warning
    )
    return detector.detect()
