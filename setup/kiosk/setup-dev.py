#!/usr/bin/env python3
"""
Sourccey Kiosk Dev Setup Script

This script sets up the development environment for Sourccey Desktop on Raspberry Pi
and launches the app in kiosk mode using `bun tauri:kiosk`.

It handles:
- System dependencies check
- Git submodules setup
- Python environment setup
- JavaScript/Bun packages installation
- Running the dev kiosk command

Requirements:
- Python 3.10+
- Raspberry Pi OS (or similar Debian-based system)
- Internet connection
- Bun (JavaScript runtime)
- Rust (for Tauri)
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

shared_dir = Path(__file__).parent.parent / "shared"
if str(shared_dir) not in sys.path:
    sys.path.insert(0, str(shared_dir))

# Import shared utilities
from setup_python import PythonSetupManager  # type: ignore
from setup_javascript import JavaScriptSetupManager, get_bun_path  # type: ignore
from setup_rust import RustSetupManager  # type: ignore
from setup_git import GitSetupManager  # type: ignore

class Colors:
    """ANSI color codes for terminal output"""
    SUPPORTS_COLOR = (
        hasattr(sys.stdout, 'isatty') and sys.stdout.isatty() and
        os.environ.get('TERM') != 'dumb' and
        os.environ.get('NO_COLOR') is None
    )

    RED = '\033[0;31m' if SUPPORTS_COLOR else ''
    GREEN = '\033[0;32m' if SUPPORTS_COLOR else ''
    YELLOW = '\033[1;33m' if SUPPORTS_COLOR else ''
    BLUE = '\033[0;34m' if SUPPORTS_COLOR else ''
    CYAN = '\033[0;36m' if SUPPORTS_COLOR else ''
    NC = '\033[0m' if SUPPORTS_COLOR else ''

class DevKioskSetupScript:
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.errors = []
        self.warnings = []

        # Initialize shared setup managers
        self.python_manager = PythonSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error
        )
        self.javascript_manager = JavaScriptSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error
        )
        self.rust_manager = RustSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error
        )
        self.git_manager = GitSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error
        )

    def print_status(self, message: str, color: str = Colors.BLUE):
        """Print a status message with color"""
        print(f"{color}[INFO]{Colors.NC} {message}")

    def print_success(self, message: str):
        """Print a success message"""
        print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")

    def print_warning(self, message: str):
        """Print a warning message"""
        print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")
        self.warnings.append(message)

    def print_error(self, message: str):
        """Print an error message"""
        print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")
        self.errors.append(message)

    def print_header(self, message: str):
        """Print a header message"""
        print(f"\n{Colors.CYAN}{'='*60}{Colors.NC}")
        print(f"{Colors.CYAN}{message.center(60)}{Colors.NC}")
        print(f"{Colors.CYAN}{'='*60}{Colors.NC}\n")

    def detect_project_root(self) -> bool:
        """Verify project root and required files"""
        self.print_status("Checking project structure...")

        if not (self.project_root / "package.json").exists():
            self.print_error(f"Could not detect project root from script location")
            self.print_error(f"Expected package.json at: {self.project_root / 'package.json'}")
            return False

        self.print_success(f"Project root: {self.project_root}")
        return True

    def check_bun(self) -> bool:
        """Check if Bun is installed"""
        return self.javascript_manager.check_bun()

    def check_rust(self) -> bool:
        """Check if Rust is installed"""
        return self.rust_manager.check_rust()

    def check_python_version(self) -> bool:
        """Check if Python 3.10+ is installed"""
        return self.python_manager.check_python_version()

    def check_git(self) -> bool:
        """Check if Git is installed"""
        return self.git_manager.check_git_installed()

    def ensure_bun(self) -> bool:
        """Ensure Bun is installed"""
        return self.javascript_manager.ensure_bun()

    def setup_git_submodules(self, use_https: bool = False) -> bool:
        """Setup git submodules using the shared git setup module"""
        return self.git_manager.setup_git_submodules(use_https=use_https)

    def setup_python_environment(self) -> bool:
        """Setup Python environment for lerobot-vulcan"""
        return self.python_manager.setup_python_environment()

    def setup_bun_packages(self) -> bool:
        """Install Bun packages"""
        return self.javascript_manager.install_packages()

    def run_kiosk_dev(self) -> bool:
        """Run bun tauri:kiosk command"""
        self.print_status("Starting development kiosk mode...")

        bun_cmd = get_bun_path()

        # Get the real user's home for proper environment
        real_user = os.environ.get("SUDO_USER") or os.environ.get("USER") or "pi"

        # Set DISPLAY for X11
        env = os.environ.copy()
        env['DISPLAY'] = ':0.0'

        # Build the command - same as package.json tauri:kiosk
        # export DISPLAY=:0.0 && xhost +local: 2>/dev/null || true && bun tauri dev -- -- --kiosk
        xhost_cmd = "xhost +local: 2>/dev/null || true"
        tauri_cmd = f"{bun_cmd} tauri dev -- -- --kiosk"

        # Run xhost first (non-blocking if it fails)
        self.print_status("Configuring X11 permissions...")
        subprocess.run(xhost_cmd, shell=True, env=env)

        # Run the tauri dev command
        self.print_status("Launching Tauri in kiosk mode (this will block)...")
        self.print_status("Press Ctrl+C to exit")

        try:
            result = subprocess.run(
                tauri_cmd,
                shell=True,
                cwd=self.project_root,
                env=env
            )
            return result.returncode == 0
        except KeyboardInterrupt:
            self.print_status("\nReceived interrupt signal, exiting...")
            return True
        except Exception as e:
            self.print_error(f"Failed to run kiosk dev: {e}")
            return False

    def print_summary(self):
        """Print setup summary"""
        self.print_header("SETUP SUMMARY")

        if self.errors:
            self.print_error(f"Setup completed with {len(self.errors)} error(s):")
            for error in self.errors:
                print(f"  • {error}")
            print()

        if self.warnings:
            self.print_warning(f"Setup completed with {len(self.warnings)} warning(s):")
            for warning in self.warnings:
                print(f"  • {warning}")
            print()

    def run(self, use_https: bool = False) -> bool:
        """Run the complete dev kiosk setup process"""
        self.print_header("SOURCCEY KIOSK DEV SETUP")

        # Detect configuration
        self.print_header("DETECTING CONFIGURATION")

        if not self.detect_project_root():
            return False

        # Check system requirements
        self.print_header("CHECKING SYSTEM REQUIREMENTS")

        checks = [
            self.check_python_version(),
            self.check_bun(),
            self.check_rust(),
            self.check_git(),
        ]

        if not all(checks):
            self.print_error("System requirements check failed")
            self.print_error("Please install missing dependencies before continuing")
            return False

        # Setup project
        self.print_header("SETTING UP PROJECT")

        if not self.ensure_bun():
            self.print_error("Bun installation failed")
            return False

        if not self.setup_git_submodules(use_https=use_https):
            self.print_error("Git submodule setup failed")
            if not use_https:
                self.print_error("")
                self.print_error("This may be due to SSH connectivity issues.")
                self.print_error("Try running the setup with HTTPS instead:")
                self.print_error("")
                self.print_error("  python3 setup/kiosk/setup-dev.py --use-https")
                self.print_error("")
            else:
                self.print_error("Git submodule setup failed even with HTTPS.")
                self.print_error("Please check your internet connection and try again.")
            return False

        if not self.setup_python_environment():
            self.print_error("Python environment setup failed")
            return False

        if not self.setup_bun_packages():
            self.print_error("Bun packages installation failed")
            return False

        self.print_success("Project setup completed")

        # Run kiosk dev mode
        self.print_header("STARTING KIOSK DEV MODE")

        self.print_summary()

        if len(self.errors) == 0:
            return self.run_kiosk_dev()
        else:
            return False

################################################################
# Main function
################################################################

def main():
    parser = argparse.ArgumentParser(description='Sourccey Kiosk Dev Setup')
    parser.add_argument('--use-https', action='store_true',
                       help='Force HTTPS URLs instead of SSH for git operations')
    args = parser.parse_args()

    setup = DevKioskSetupScript()
    success = setup.run(use_https=args.use_https)

    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()
