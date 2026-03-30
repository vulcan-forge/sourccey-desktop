#!/usr/bin/env python3
"""
Build Management Module for Sourccey Kiosk

Handles building, cleaning, and installing the Tauri application.
"""

import os
import sys
import subprocess
import json
import time
from pathlib import Path
from typing import Callable, Optional

# Add project root and shared directory to path for imports
# From setup/kiosk/components/setup_build.py:
# parent.parent.parent.parent = project root
# parent.parent.parent / "shared" = setup/shared
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

shared_dir = Path(__file__).parent.parent.parent / "shared"
if str(shared_dir) not in sys.path:
    sys.path.insert(0, str(shared_dir))

# Import directly from shared (like setup.py does)
from setup_javascript import get_bun_path # type: ignore
from setup_helper import wrap_command # type: ignore

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
    def recommend_cargo_jobs(self, total_mem_gib: Optional[float] = None) -> int:
        """
        Choose a conservative Cargo parallelism level based on available RAM.

        Defaults:
        - ~4GB devices (e.g., Raspberry Pi 4 4GB): 2 jobs
        - low-memory devices: 1 job
        - higher-memory devices: 3 jobs
        """
        if total_mem_gib is None:
            meminfo = Path("/proc/meminfo")
            if meminfo.exists():
                try:
                    for line in meminfo.read_text(encoding="utf-8").splitlines():
                        if line.startswith("MemTotal:"):
                            parts = line.split()
                            if len(parts) >= 2:
                                mem_total_kib = int(parts[1])
                                total_mem_gib = mem_total_kib / (1024 * 1024)
                            break
                except Exception:
                    total_mem_gib = None

        if total_mem_gib is None:
            return 1
        if total_mem_gib >= 7.0:
            return 3
        if total_mem_gib >= 3.5:
            return 2
        return 1

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

    def find_latest_deb(self, deb_locations: list[Path], product_patterns: list[str]) -> Optional[Path]:
        """Find the newest matching .deb across all known output/cache locations."""
        candidates: list[Path] = []

        for deb_dir in deb_locations:
            if not deb_dir.exists():
                continue
            for pattern in product_patterns:
                candidates.extend(deb_dir.glob(pattern))

        if not candidates:
            return None

        # Pick newest by mtime so stale cache artifacts do not override fresh builds.
        newest = max(candidates, key=lambda p: p.stat().st_mtime)
        return newest

    def build_tauri(self) -> Optional[Path]:
        """Build Tauri application"""

        self.print_status("Building Tauri application...")

        # Find bun executable
        bun_cmd = get_bun_path()

        # Install dependencies
        self.print_status("Installing dependencies...")
        install_cmd = [bun_cmd, "install"]
        wrapped_install_cmd, install_cwd = wrap_command(install_cmd, self.project_root)

        install_result = subprocess.run(
            wrapped_install_cmd,
            cwd=install_cwd,
            check=True,
            capture_output=True,
            text=True,
        )

        if install_result.returncode != 0:
            self.print_error("Failed to install dependencies")
            self.print_status(f"Install output: {install_result.stdout}")
            self.print_error(f"Install error: {install_result.stderr}")
            return None

        # Set up Cargo build environment
        self.print_status("Setting up build environment...")
        cargo_jobs = self.recommend_cargo_jobs()
        self.print_status(f"Auto-selected CARGO_BUILD_JOBS={cargo_jobs}")
        jobs_override = os.environ.get("SOURCCEY_CARGO_BUILD_JOBS", "").strip()
        if jobs_override:
            try:
                parsed = int(jobs_override)
                if parsed > 0:
                    cargo_jobs = parsed
                    self.print_status(f"Using overridden CARGO_BUILD_JOBS={cargo_jobs}")
            except ValueError:
                self.print_warning(
                    f"Ignoring invalid SOURCCEY_CARGO_BUILD_JOBS='{jobs_override}'. "
                    "Expected a positive integer."
                )
        build_env = self.setup_cargo_build_env(self.project_root, jobs=cargo_jobs)

        # Disable bundle signing for kiosk builds
        self.print_status("Disabling bundle signing for kiosk builds...")
        self.disable_bundle_signing()

        # Build Tauri as the real (non-root) user so Cargo crates and toolchains
        # are owned by the normal user, not root.
        self.print_status("Running Tauri build (this may take a while)...")
        real_user = os.environ.get("SUDO_USER") or os.environ.get("USER") or "pi"

        # Prepare env vars to pass through when dropping privileges with sudo -u.
        # We only forward the variables that matter for the Rust/Tauri build.
        env_keys_to_forward = [
            "PATH",
            "RUSTUP_TOOLCHAIN",
            "CARGO_BUILD_JOBS",
            "CARGO_TARGET_DIR",
            "CARGO_INCREMENTAL",
            "TAURI_UPDATER_ACTIVE",
            "TAURI_UPDATER_SIGNING_KEY",
            "TAURI_SIGNING_PRIVATE_KEY",
            "TAURI_SIGNING_PUBLIC_KEY",
        ]
        env_args = []
        for key in env_keys_to_forward:
            if key in build_env:
                env_args.append(f"{key}={build_env[key]}")

        # When running under sudo, explicitly drop to the real user and keep the
        # build environment. Otherwise run directly as the current user.
        tauri_build_args = ["run", "tauri:build", "--", "--bundles", "deb"]
        fallback_build_args = ["run", "tauri:build"]

        def _run_build(args: list[str], env_override: Optional[dict] = None):
            cmd = [bun_cmd, *args]
            print(" ".join(cmd))
            return subprocess.run(
                cmd,
                cwd=self.project_root,
                check=True,
                env=env_override,
            )

        if hasattr(os, "geteuid") and os.geteuid() == 0 and real_user != "root":
            build_cmd = [
                "sudo",
                "-u",
                real_user,
                "-H",
                "env",
                *env_args,
                bun_cmd,
                *tauri_build_args,
            ]
            build_cwd = self.project_root
            print(" ".join(build_cmd))

            try:
                build_result = subprocess.run(
                    build_cmd,
                    cwd=build_cwd,
                    check=True,
                )
            except subprocess.CalledProcessError:
                self.print_warning(
                    "Failed to build with '--bundles deb'. Retrying with default bundle targets."
                )
                fallback_cmd = [
                    "sudo",
                    "-u",
                    real_user,
                    "-H",
                    "env",
                    *env_args,
                    bun_cmd,
                    *fallback_build_args,
                ]
                print(" ".join(fallback_cmd))
                build_result = subprocess.run(
                    fallback_cmd,
                    cwd=build_cwd,
                    check=True,
                )
        else:
            try:
                build_result = _run_build(tauri_build_args, env_override=build_env)
            except subprocess.CalledProcessError:
                self.print_warning(
                    "Failed to build with '--bundles deb'. Retrying with default bundle targets."
                )
                build_result = _run_build(fallback_build_args, env_override=build_env)

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

        product_name = self.app_info['product_name']
        product_patterns = [
            f"{product_name}*.deb",
            f"{product_name.replace(' ', '')}*.deb",
            f"{product_name.replace(' ', '_')}*.deb",
        ]

        newest_deb = self.find_latest_deb(deb_locations, product_patterns)
        if newest_deb:
            self.print_success(f"Selected newest .deb: {newest_deb}")
            return newest_deb

        self.print_error(f"No .deb found matching patterns: {', '.join(product_patterns)}")
        return None

    #################################################################
    # Installation
    #################################################################

    def install_deb(self, deb_path: Path) -> bool:
        """Install the .deb package"""
        self.print_status(f"Installing {deb_path.name}...")

        # Force reinstall even when package version is unchanged (common in local kiosk builds).
        install_cmd = ["sudo", "apt", "install", "--reinstall", "-y", str(deb_path)]
        install_result = subprocess.run(
            install_cmd,
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
