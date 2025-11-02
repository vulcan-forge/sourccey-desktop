#!/usr/bin/env python3
"""
Sourccey Desktop Setup Script

This script sets up the development environment for the Sourccey Desktop application.
It checks for required dependencies and installs all necessary packages.

Requirements:
- Python 3.10+
- Bun (JavaScript runtime)
- Cargo (Rust package manager)
- Git
- uv (Python package manager) - optional but recommended
"""

import os
import sys
import subprocess
import platform
import shutil
from pathlib import Path
from typing import Tuple, Optional

# Add the components directory to the Python path
components_dir = Path(__file__).parent / "components"
sys.path.insert(0, str(components_dir))

# Add the shared directory to the Python path
shared_dir = Path(__file__).parent.parent / "shared"
sys.path.insert(0, str(shared_dir))

# Import shared utilities
from setup_python import PythonSetupManager  # type: ignore
from setup_javascript import JavaScriptSetupManager  # type: ignore
from setup_rust import RustSetupManager  # type: ignore
from setup_git import GitSetupManager  # type: ignore

class Colors:
    """ANSI color codes for terminal output"""
    # Check if colors are supported
    SUPPORTS_COLOR = (
        hasattr(sys.stdout, 'isatty') and sys.stdout.isatty() and
        os.environ.get('TERM') != 'dumb' and
        os.environ.get('NO_COLOR') is None
    )

    RED = '\033[0;31m' if SUPPORTS_COLOR else ''
    GREEN = '\033[0;32m' if SUPPORTS_COLOR else ''
    YELLOW = '\033[1;33m' if SUPPORTS_COLOR else ''
    BLUE = '\033[0;34m' if SUPPORTS_COLOR else ''
    PURPLE = '\033[0;35m' if SUPPORTS_COLOR else ''
    CYAN = '\033[0;36m' if SUPPORTS_COLOR else ''
    WHITE = '\033[1;37m' if SUPPORTS_COLOR else ''
    NC = '\033[0m' if SUPPORTS_COLOR else ''

class SetupScript:
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

    #################################################################
    # Print functions
    #################################################################
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

    #################################################################
    # Check functions
    #################################################################

    def check_command_exists(self, command: str) -> bool:
        """Check if a command exists in the system PATH"""
        return shutil.which(command) is not None

    def get_command_version(self, command: str) -> Optional[str]:
        """Get the version of a command if it exists"""
        try:
            result = subprocess.run([command, "--version"],
                                 capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return result.stdout.strip().split('\n')[0]
        except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
            pass
        return None

    def check_python_version(self) -> bool:
        """Check if Python 3.10+ is installed"""
        return self.python_manager.check_python_version()

    def check_bun(self) -> bool:
        """Check if Bun is installed"""
        return self.javascript_manager.check_bun()

    def check_rust(self) -> bool:
        """Check if Rust is installed"""
        return self.rust_manager.check_rust()

    def check_git(self) -> bool:
        """Check if Git is installed"""
        return self.git_manager.check_git_installed()

    def check_uv(self) -> bool:
        """Check if uv is installed (optional but recommended)"""
        return self.python_manager.check_uv()

    def check_project_structure(self) -> bool:
        """Check if we're in the correct project directory"""
        self.print_status("Checking project structure...")

        required_files = ["package.json", "src-tauri/Cargo.toml"]
        required_dirs = ["src", "src-tauri"]

        missing_files = []
        missing_dirs = []

        for file_path in required_files:
            if not (self.project_root / file_path).exists():
                missing_files.append(file_path)

        for dir_path in required_dirs:
            if not (self.project_root / dir_path).exists():
                missing_dirs.append(dir_path)

        if missing_files or missing_dirs:
            self.print_error("Project structure is incomplete:")
            for file_path in missing_files:
                self.print_error(f"  Missing file: {file_path}")
            for dir_path in missing_dirs:
                self.print_error(f"  Missing directory: {dir_path}")
            self.print_error("Please run this script from the root of the sourccey-desktop project")
            return False

        # Check for modules/lerobot-vulcan specifically
        modules_dir = self.project_root / "modules"

        if not modules_dir.exists():
            self.print_status("Creating modules directory...")
            modules_dir.mkdir(parents=True, exist_ok=True)
            self.print_success("Modules directory created")

        self.print_success("Project structure is correct")
        return True

    #################################################################
    # Setup functions
    #################################################################

    def setup_git_submodules(self, use_https: bool = False) -> bool:
        """Setup git submodules using the shared git setup module"""
        return self.git_manager.setup_git_submodules(use_https=use_https)

    def setup_python_environment(self) -> bool:
        """Setup Python environment for lerobot-vulcan"""
        return self.python_manager.setup_python_environment()

    def setup_bun_packages(self) -> bool:
        """Install Bun packages"""
        return self.javascript_manager.install_packages()

    def setup_ffmpeg(self) -> bool:
        """Setup FFmpeg if not already present"""
        self.print_status("Checking FFmpeg installation...")

        ffmpeg_path = self.project_root / "tools" / "ffmpeg"

        # Check if FFmpeg is already installed
        if platform.system() == "Windows":
            ffmpeg_binary = ffmpeg_path / "ffmpeg.exe"
        else:
            ffmpeg_binary = ffmpeg_path / "ffmpeg"

        if ffmpeg_binary.exists():
            self.print_success("FFmpeg is already installed")
            return True

        # Import and call the FFmpeg setup function
        try:
            # Add the setup directory to Python path temporarily
            import sys
            setup_dir = str(self.project_root / "setup")
            if setup_dir not in sys.path:
                sys.path.insert(0, setup_dir)

            from setup_ffmpeg import setup_ffmpeg # type: ignore
            success = setup_ffmpeg()
            if success:
                self.print_success("FFmpeg installed successfully")
            return success
        except ImportError as e:
            self.print_warning("FFmpeg setup module not found, skipping FFmpeg installation")
            return True
        except Exception as e:
            self.print_error(f"Failed to install FFmpeg: {e}")
            return False

    #################################################################
    # Summary and main functions
    #################################################################

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

        if not self.errors:
            self.print_success("Setup completed successfully! 🎉")
            print()
            self.print_status("You can now start developing with:")
            self.print_status("  • Desktop app: bun tauri dev")
            print()

    def print_header(self, message: str):
        """Print a header message"""
        print(f"\n{Colors.CYAN}{'='*60}{Colors.NC}")
        print(f"{Colors.CYAN}{message.center(60)}{Colors.NC}")
        print(f"{Colors.CYAN}{'='*60}{Colors.NC}\n")

    def run(self, use_https: bool = False) -> bool:
        """Run the complete setup process"""
        self.print_header("SOURCCEY DESKTOP SETUP")

        # Check system requirements
        self.print_header("CHECKING SYSTEM REQUIREMENTS")

        checks = [
            self.check_python_version(),
            self.check_bun(),
            self.check_rust(),
            self.check_git(),
            self.check_project_structure()
        ]

        # Check optional tools (don't fail if missing)
        self.check_uv()

        if not all(checks):
            self.print_error("System requirements check failed. Please install missing dependencies.")
            return False

        # Setup project
        self.print_header("SETTING UP PROJECT")

        # Try git submodules setup first
        if not self.setup_git_submodules(use_https=use_https):
            self.print_error("Git submodule setup failed.")

            # If we weren't already using HTTPS, suggest the fallback
            if not use_https:
                self.print_error("")
                self.print_error("This might be due to SSH connectivity issues.")
                self.print_error("Try running the setup with HTTPS instead:")
                self.print_error("")
                self.print_error("  python setup/setup.py --use-https")
                self.print_error("")
                self.print_error("This will use HTTPS URLs instead of SSH for git operations.")
            else:
                self.print_error("Git submodule setup failed even with HTTPS.")
                self.print_error("Please check your internet connection and try again.")

            return False

        # Continue with other setup steps
        setup_steps = [
            self.setup_python_environment(),
            self.setup_bun_packages(),
            self.setup_ffmpeg()
        ]

        if not all(setup_steps):
            self.print_error("Project setup failed.")
            return False

        self.print_summary()
        return len(self.errors) == 0

################################################################
# Main function
################################################################
def setup(use_https: bool = False):
    """Main entry point"""
    setup = SetupScript()
    success = setup.run(use_https=use_https)
    return success

import argparse

def main():
    parser = argparse.ArgumentParser(description='Sourccey Desktop Setup')
    parser.add_argument('--use-https', action='store_true', default=False,
                       help='Force HTTPS URLs instead of SSH for git operations')
    args = parser.parse_args()

    setup = SetupScript()
    success = setup.run(use_https=args.use_https)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
