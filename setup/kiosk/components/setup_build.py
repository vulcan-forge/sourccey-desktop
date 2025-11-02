#!/usr/bin/env python3
"""
Build Management Module for Sourccey Kiosk

Handles building, cleaning, and installing the Tauri application.
"""

import os
import subprocess
import json
import time
from pathlib import Path
from typing import Callable, Optional

from setup.shared.setup_javascript import get_bun_path

#################################################################
# Build Manager Class
#################################################################

class BuildManager:
    def __init__(self, project_root: Path, app_info: dict,
                 print_status: Callable, print_success: Callable,
                 print_warning: Callable, print_error: Callable):
        self.project_root = project_root
        self.app_info = app_info
        self.print_status = print_status
        self.print_success = print_success
        self.print_warning = print_warning
        self.print_error = print_error

    #################################################################
    # Helper Functions
    #################################################################
    def setup_cargo_build_env(self, project_root: Path, jobs: int = 1) -> dict:
        """Set up environment variables for Cargo builds to reduce memory usage"""
        env = os.environ.copy()

        # Get the real user's home directory (works both with and without sudo)
        real_user = os.environ.get('SUDO_USER', os.environ.get('USER', 'sourccey'))
        user_home = Path(f"/home/{real_user}") if real_user != 'root' else Path.home()

        # Add cargo bin to PATH - this ensures rustup/cargo can be found when running with sudo
        cargo_bin = user_home / ".cargo" / "bin"
        if cargo_bin.exists():
            cargo_bin_str = str(cargo_bin)
            current_path = env.get('PATH', '')
            if cargo_bin_str not in current_path:
                env['PATH'] = f"{cargo_bin_str}:{current_path}"
            self.print_status(f"Added cargo bin to PATH: {cargo_bin_str}")

        # Set rustup to use stable toolchain explicitly
        env['RUSTUP_TOOLCHAIN'] = 'stable'

        # Limit parallel compilation to reduce memory usage
        env['CARGO_BUILD_JOBS'] = str(jobs)

        # Set target directory to project-specific location
        env['CARGO_TARGET_DIR'] = str(project_root / "src-tauri" / "target")

        # Additional optimizations for memory-constrained builds
        env['CARGO_INCREMENTAL'] = '0'  # Disable incremental compilation (saves memory)

        # Disable updater for kiosk builds
        env['TAURI_UPDATER_ACTIVE'] = 'false'
        env['TAURI_UPDATER_SIGNING_KEY'] = ''  # Disable signing
        env['TAURI_SIGNING_PRIVATE_KEY'] = ''  # Disable private key
        env['TAURI_SIGNING_PUBLIC_KEY'] = ''   # Disable public key

        # Ensure .env file exists (empty is fine for dotenv)
        env_file = self.project_root / ".env"
        if not env_file.exists():
            self.print_status("Creating empty .env file...")
            env_file.touch()

        return env

    def disable_bundle_signing(self) -> bool:
        """Disable bundle signing for kiosk builds"""
        self.print_status("Disabling bundle signing for kiosk build...")

        try:
            tauri_conf_path = self.project_root / "src-tauri" / "tauri.conf.json"

            if not tauri_conf_path.exists():
                self.print_warning("tauri.conf.json not found, skipping signing configuration")
                return True

            # Read current config
            with open(tauri_conf_path, 'r') as f:
                config = json.load(f)

            # Disable updater
            if 'plugins' in config and 'updater' in config['plugins']:
                config['plugins']['updater']['active'] = False

            # Disable updater artifacts creation
            if 'bundle' in config:
                config['bundle']['createUpdaterArtifacts'] = False

            # Write back the modified config
            with open(tauri_conf_path, 'w') as f:
                json.dump(config, f, indent=4)

            self.print_success("Bundle signing disabled in tauri.conf.json")
            return True

        except Exception as e:
            self.print_error(f"Failed to disable bundle signing: {e}")
            return False

    #################################################################
    # Cleanup Functions
    #################################################################

    def cleanup_old_builds(self, clean: bool = True) -> bool:
        """Clean up old build artifacts and processes"""
        if not clean:
            self.print_status("Skipping cleanup (--no-clean enabled)")
            return True

        self.print_status("Cleaning up old builds and processes...")

        binary_name = self.app_info['binary_name']
        user = os.environ.get("SUDO_USER") or os.environ.get("USER") or "pi"

        # Kill running processes gracefully
        self.print_status(f"Stopping any running {binary_name} processes...")
        subprocess.run(f"pkill -f '{self.project_root}/src-tauri/target/release/{binary_name}'", shell=True)

        # Give processes time to terminate
        self.print_status("Giving processes time to terminate...")
        time.sleep(1)

        # Force kill any remaining processes
        self.print_status(f"Force killing any remaining {binary_name} processes...")
        subprocess.run(f"pkill -9 -f '{self.project_root}/src-tauri/target/release/{binary_name}'", shell=True)

        # Remove build artifacts
        self.print_status("Removing build artifacts...")
        dirs_to_remove = [
            self.project_root / ".next",
            self.project_root / "out",
            self.project_root / "src-tauri" / "target",
            self.project_root / ".tauri-target"
        ]

        for dir_path in dirs_to_remove:
            if dir_path.exists():
                self.print_status(f"  Removing {dir_path.name}...")
                if not subprocess.run(["rm", "-rf", str(dir_path)]):
                    # Try with sudo if failed
                    subprocess.run(["sudo", "rm", "-rf", str(dir_path)])

        self.print_success("Cleanup completed")
        return True

    #################################################################
    # Tauri Build
    #################################################################

    def build_tauri(self) -> Optional[Path]:
        """Build Tauri application"""

        self.print_status("Building Tauri application...")

        # Find bun executable
        bun_cmd = get_bun_path()

        # Install dependencies
        self.print_status("Installing dependencies...")
        install_cmd = f"{bun_cmd} install"

        install_result = subprocess.run(
            install_cmd,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
            cwd=self.project_root
        )

        if install_result.returncode != 0:
            self.print_error("Failed to install dependencies")
            self.print_status(f"Install output: {install_result.stdout}")
            self.print_error(f"Install error: {install_result.stderr}")
            return None

        # Set up Cargo build environment
        self.print_status("Setting up build environment...")
        build_env = self.setup_cargo_build_env(self.project_root, jobs=1)

        # Disable bundle signing for kiosk builds
        self.print_status("Disabling bundle signing for kiosk builds...")
        self.disable_bundle_signing()

        # Build Tauri - simple approach
        self.print_status("Running Tauri build (this may take a while)...")
        build_cmd = f"{bun_cmd} tauri build"
        print(build_cmd)

        build_result = subprocess.run(
            build_cmd,
            shell=True,
            check=True,
            capture_output=False,
            cwd=self.project_root,
            env=build_env
        )

        if build_result.returncode != 0:
            self.print_error("Build failed!")
            return None

        # Find the .deb file
        self.print_status("Finding .deb file...")
        deb_locations = [
            self.project_root / ".tauri-target" / "release" / "bundle" / "deb",
            Path.home() / ".cargo-tauri-target" / "release" / "bundle" / "deb",
            self.project_root / "src-tauri" / "target" / "release" / "bundle" / "deb"
        ]

        product_pattern = f"{self.app_info['product_name'].replace(' ', '')}*.deb"

        for deb_dir in deb_locations:
            if deb_dir.exists():
                debs = sorted(deb_dir.glob(product_pattern))
                if debs:
                    self.print_success(f"Found .deb at {deb_dir}")
                    return debs[0]

        self.print_error(f"No .deb found matching pattern: {product_pattern}")
        return None

    #################################################################
    # Installation
    #################################################################

    def install_deb(self, deb_path: Path) -> bool:
        """Install the .deb package"""
        self.print_status(f"Installing {deb_path.name}...")

        install_cmd = f"sudo apt install -y {str(deb_path)}"
        install_result = subprocess.run(
            install_cmd,
            shell=True,
            check=True,
            capture_output=True,
            text=True,
        )

        if install_result is None or install_result.returncode != 0:
            self.print_error("Failed to install .deb package")
            self.print_status(f"Install output: {install_result.stdout}")
            self.print_error(f"Install error: {install_result.stderr}")
            return False

        self.print_success(f"Install output: {install_result.stdout}")
        return True

#################################################################
# Convenience Functions
#################################################################

def cleanup_old_builds(project_root: Path, app_info: dict, clean: bool,
                       print_status, print_success, print_warning, print_error) -> bool:
    """Convenience function for cleaning up old builds"""
    manager = BuildManager(
        project_root, app_info, print_status, print_success,
        print_warning, print_error
    )
    return manager.cleanup_old_builds(clean)

def build_tauri(project_root: Path, app_info: dict,
                print_status, print_success, print_warning, print_error) -> Optional[Path]:
    """Convenience function for building Tauri"""
    manager = BuildManager(
        project_root, app_info, print_status, print_success,
        print_warning, print_error
    )
    return manager.build_tauri()


def install_deb(deb_path: Path, print_status, print_success, print_warning, print_error) -> bool:
    """Convenience function for installing deb"""
    # Create a minimal manager just for this
    manager = BuildManager(
        Path(), {}, print_status, print_success,
        print_warning, print_error
    )
    return manager.install_deb(deb_path)
