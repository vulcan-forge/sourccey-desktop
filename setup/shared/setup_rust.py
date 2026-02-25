#!/usr/bin/env python3
"""
Rust Setup Utilities for Sourccey Desktop
"""

import os
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable, Optional

from setup_helper import get_real_user_home, wrap_command

#################################################################
# Helper Functions
#################################################################


def find_user_binary(binary_name: str, search_dirs: list) -> Optional[Path]:
    """
    Find a binary executable, handling sudo scenarios on Linux.

    Args:
        binary_name: Name of the binary to find (e.g., 'cargo', 'rustc')
        search_dirs: List of relative directories to search in user's home

    Returns:
        Path to the binary if found, None otherwise
    """
    binary_path = shutil.which(binary_name)
    if binary_path:
        return Path(binary_path)

    user_home = get_real_user_home()
    search_paths = []
    binary_candidates = [binary_name]
    if os.name == "nt" and not binary_name.lower().endswith(".exe"):
        binary_candidates.append(f"{binary_name}.exe")

    if user_home:
        for search_dir in search_dirs:
            for candidate in binary_candidates:
                search_paths.append(Path(user_home) / search_dir / candidate)

    current_home = Path.home()
    for search_dir in search_dirs:
        for candidate in binary_candidates:
            search_paths.append(current_home / search_dir / candidate)

    if os.name != "nt":
        search_paths.extend(
            [
                Path(f"/usr/local/bin/{binary_name}"),
                Path(f"/usr/bin/{binary_name}"),
            ]
        )

    for path in search_paths:
        if path.exists() and path.is_file():
            bin_dir = str(path.parent)
            current_path = os.environ.get("PATH", "")
            if bin_dir not in current_path:
                os.environ["PATH"] = f"{bin_dir}{os.pathsep}{current_path}" if current_path else bin_dir
            return path

    return None


#################################################################
# Rust Setup Manager Class
#################################################################


class RustSetupManager:
    """Manager class for Rust-related setup operations"""

    def __init__(
        self,
        project_root: Path,
        print_status: Callable,
        print_success: Callable,
        print_warning: Callable,
        print_error: Callable,
    ):
        self.project_root = project_root
        self.print_status = print_status
        self.print_success = print_success
        self.print_warning = print_warning
        self.print_error = print_error
        self.system = platform.system()

    #################################################################
    # Rust Detection
    #################################################################

    def check_rust(self) -> bool:
        """Check if Rust is installed"""
        self.print_status("Checking Rust installation...")

        cargo_path = find_user_binary("cargo", [".cargo/bin"])
        if not cargo_path:
            self.print_error("Rust is not installed")
            self.print_error("Install Rust from https://rustup.rs/")
            return False

        try:
            wrapped_cmd, actual_cwd = wrap_command([str(cargo_path), "--version"], Path.cwd())
            version_result = subprocess.run(
                wrapped_cmd,
                cwd=actual_cwd,
                check=True,
                capture_output=True,
                text=True,
            )
            version = version_result.stdout.strip()
            version_text = f" ({version})" if version else ""
            self.print_success(f"Rust is installed at {cargo_path}{version_text}")
            return True
        except (subprocess.SubprocessError, OSError) as e:
            self.print_error(f"Failed to check Rust version: {e}")
            return False

    #################################################################
    # Rust Installation
    #################################################################

    def install_rust(self) -> bool:
        """Install Rust using rustup"""
        self.print_status("Installing Rust toolchain...")

        try:
            if self.system == "Windows":
                winget = shutil.which("winget")
                installed = False
                if winget:
                    self.print_status("Attempting Rust install via winget...")
                    winget_result = subprocess.run(
                        [
                            winget,
                            "install",
                            "-e",
                            "--id",
                            "Rustlang.Rustup",
                            "--accept-source-agreements",
                            "--accept-package-agreements",
                        ],
                        capture_output=True,
                        text=True,
                    )
                    installed = winget_result.returncode == 0
                    if not installed:
                        self.print_warning("winget install failed, falling back to rustup installer")

                if not installed:
                    powershell = shutil.which("powershell") or shutil.which("pwsh")
                    if not powershell:
                        self.print_error("PowerShell not found; cannot install Rust automatically")
                        self.print_error("Install Rust manually from https://rustup.rs/")
                        return False

                    installer_path = Path(tempfile.gettempdir()) / "rustup-init.exe"
                    download_result = subprocess.run(
                        [
                            powershell,
                            "-NoProfile",
                            "-ExecutionPolicy",
                            "Bypass",
                            "-Command",
                            f"Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile '{installer_path}'",
                        ],
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    if download_result.returncode != 0:
                        self.print_error("Failed to download rustup installer")
                        self.print_error(download_result.stderr.strip())
                        return False

                    run_result = subprocess.run(
                        [str(installer_path), "-y"],
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                    if run_result.returncode != 0:
                        self.print_error("rustup installer failed")
                        self.print_error(run_result.stderr.strip())
                        return False
            else:
                install_cmd = [
                    "bash",
                    "-lc",
                    "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
                ]
                wrapped_cmd, actual_cwd = wrap_command(install_cmd, Path(get_real_user_home()))
                result = subprocess.run(
                    wrapped_cmd,
                    cwd=actual_cwd,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    self.print_error("Failed to install Rust")
                    self.print_error(result.stderr.strip())
                    return False

            self.print_success("Rust installed successfully")
            return True
        except (subprocess.SubprocessError, OSError) as e:
            self.print_error(f"Unexpected error installing Rust: {e}")
            return False

    def ensure_rust(self) -> bool:
        """Ensure Rust is installed, install if not"""
        if self.check_rust():
            return True

        self.print_warning("Rust not found, attempting to install...")
        if not self.install_rust():
            return False
        return self.check_rust()


#################################################################
# Convenience Functions
#################################################################


def check_rust(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable,
) -> bool:
    """Convenience function for checking Rust installation"""
    manager = RustSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.check_rust()


def install_rust(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable,
) -> bool:
    """Convenience function for installing Rust"""
    manager = RustSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.install_rust()


def ensure_rust(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable,
) -> bool:
    """Convenience function for ensuring Rust is installed"""
    manager = RustSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.ensure_rust()
