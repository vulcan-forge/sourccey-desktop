#!/usr/bin/env python3
"""
Sourccey Kiosk Setup Script

This script sets up a full kiosk environment for Sourccey Desktop on Raspberry Pi.
It handles:
- System dependencies (X11, Openbox, LightDM, Tauri build deps)
- Building and installing the Sourccey .deb package
- LightDM autologin configuration
- Openbox fullscreen configuration
- Session files for kiosk mode

Requirements:
- Python 3.10+
- Raspberry Pi OS (or similar Debian-based system)
- Root/sudo access
- Internet connection
- Bun (JavaScript runtime)
"""

import os
import sys
import subprocess
import shutil
import argparse
from pathlib import Path
from typing import Optional
from components.setup_swap import setup_swap_for_build

project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

shared_dir = Path(__file__).parent.parent / "shared"
if str(shared_dir) not in sys.path:
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

class KioskSetupScript:
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.errors = []
        self.warnings = []
        self.app_info = {}

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

    def print_header(self, message: str):
        """Print a header message"""
        print(f"\n{Colors.CYAN}{'='*60}{Colors.NC}")
        print(f"{Colors.CYAN}{message.center(60)}{Colors.NC}")
        print(f"{Colors.CYAN}{'='*60}{Colors.NC}\n")

    #################################################################
    # Configuration and detection functions
    #################################################################

    def detect_project_root(self) -> bool:
        """Verify project root and required files."""
        self.print_status("Checking project structure...")

        if not (self.project_root / "package.json").exists():
            self.print_error(f"Could not detect project root from script location")
            self.print_error(f"Expected package.json at: {self.project_root / 'package.json'}")
            return False

        self.print_success(f"Project root: {self.project_root}")
        return True

    #################################################################
    # Permission / ownership helpers
    #################################################################

    def fix_project_permissions(self) -> bool:
        """
        Ensure the project directory is owned by the non-root user, not root.

        This prevents build artifacts (.next, .tauri, node_modules, target, etc.)
        from ending up owned by root and breaking later `bun` / `tauri` commands.
        Additionally, it fixes ownership of common tooling directories in the
        user's home (bun, cargo, rustup, tauri, cache, local).
        """
        self.print_status("Ensuring correct ownership of project and tooling directories...")

        # Prefer the original user that invoked sudo
        user = os.environ.get("SUDO_USER") or os.environ.get("USER")
        if not user or user == "root":
            self.print_warning(
                "Could not determine non-root user for ownership; skipping chown."
            )
            return False

        # Resolve the user's home directory
        user_home = Path(f"/home/{user}")
        if not user_home.exists():
            user_home = Path.home()

        # Paths we want to ensure are owned by the real user
        paths_to_fix = [self.project_root]

        # Tooling directories under the user's home
        tooling_dirs = [
            user_home / ".bun",
            user_home / ".cargo",
            user_home / ".rustup",
            user_home / ".cache",
            user_home / ".local",
        ]

        # Include any .tauri* directories (e.g. .tauri, .tauri-target, etc.)
        tooling_dirs.extend(user_home.glob(".tauri*"))

        for path in tooling_dirs:
            if path.exists():
                paths_to_fix.append(path)

        try:
            for path in paths_to_fix:
                subprocess.run(
                    ["chown", "-R", f"{user}:{user}", str(path)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            self.print_success(
                "Ownership set to "
                f"{user}:{user} for: {', '.join(str(p) for p in paths_to_fix)}"
            )
            return True
        except subprocess.CalledProcessError as e:
            self.print_error(
                f"Failed to fix permissions: {e.stderr.strip() or e}"
            )
            return False
        except Exception as e:
            self.print_error(f"Unexpected error while fixing permissions: {e}")
            return False

    def detect_app_info(self) -> bool:
        """Read app configuration from tauri.conf.json, package.json, and Cargo.toml"""
        from components.app_config import detect_app_config

        self.app_info = detect_app_config(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning
        )
        return True

    #################################################################
    # Check functions
    #################################################################

    def check_command_exists(self, command: str) -> bool:
        """Check if a command exists in the system PATH"""
        return shutil.which(command) is not None

    def check_root_access(self) -> bool:
        """Check if script is running with root privileges"""
        self.print_status("Checking root access...")

        try:
            if os.geteuid() != 0:
                self.print_error("This script must be run with sudo/root privileges")
                self.print_error("Please run: sudo python3 setup/kiosk/setup.py")
                return False
            self.print_success("Running with root privileges")
            return True
        except AttributeError:
            self.print_error("Cannot determine user privileges on this platform")
            return False

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

    def check_uv(self) -> bool:
        """Check if uv is installed (optional but recommended)"""
        return self.python_manager.check_uv()

    #################################################################
    # System setup functions
    #################################################################
    def apt_install(self, packages: list) -> bool:
        """Install apt packages"""
        self.print_status(f"Installing packages: {' '.join(packages)}")

        try:
            install_result = subprocess.run(
                ["sudo", "apt", "install", "-y"] + packages,
                check=True,
                capture_output=True,
                text=True
            )

            if install_result is None or install_result.returncode != 0:
                self.print_error("Failed to install packages")
                self.print_status(f"Install output: {install_result.stdout}")
                self.print_error(f"Install error: {install_result.stderr}")
                return False

            self.print_success("Packages installed successfully")
            return True

        except Exception as e:
            self.print_error(f"Error installing packages: {e}")
            return False

    def install_system_packages(self) -> bool:
        """Install all system packages and dependencies"""
        from components.setup_system import install_system_packages

        return install_system_packages(
            self.print_status,
            self.print_success,
            self.print_error,
            self.print_warning,
            self.apt_install
        )

    def ensure_bun(self) -> bool:
        """Ensure Bun is installed (no Node.js fallback)"""
        return self.javascript_manager.ensure_bun()

    def setup_git_submodules(self, use_https: bool = True) -> bool:
        """Setup git submodules using the shared git setup module"""
        return self.git_manager.setup_git_submodules(use_https=use_https)

    def setup_python_environment(self) -> bool:
        """Setup Python environment for lerobot-vulcan"""
        return self.python_manager.setup_python_environment()

    def setup_bun_packages(self) -> bool:
        """Install Bun packages"""
        return self.javascript_manager.install_packages()

    def setup_swap_for_memory_intensive_builds(self) -> bool:
        """Setup swap space for memory-intensive builds like GTK compilation"""
        return setup_swap_for_build(
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
            size_gb=6
        )

    #################################################################
    # Build and cleanup functions (delegated to setup_build module)
    #################################################################

    def cleanup_old_builds(self, clean: bool = True) -> bool:
        """Clean up old build artifacts and processes"""
        from components.setup_build import cleanup_old_builds

        return cleanup_old_builds(
            self.project_root,
            self.app_info,
            clean,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error
        )

    def export_frontend(self) -> bool:
        """Export Next.js frontend to static assets"""
        from components.setup_build import export_frontend

        return export_frontend(
            self.project_root,
            self.app_info,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error
        )

    def build_tauri(self) -> Optional[Path]:
        """Build Tauri application"""
        from components.setup_build import build_tauri

        return build_tauri(
            self.project_root,
            self.app_info,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error
        )

    def install_deb(self, deb_path: Path) -> bool:
        """Install the .deb package"""
        from components.setup_build import install_deb

        return install_deb(
            deb_path,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error
        )

    #################################################################
    # Kiosk configuration functions (delegated to kiosk modules)
    #################################################################

    def write_file_as_root(self, path: str, content: str, mode: int = 0o644, executable: bool = False) -> bool:
        """Write file as root user"""
        from components.file_utils import write_file_as_root
        return write_file_as_root(path, content, mode, executable)

    def setup_session_files(self) -> bool:
        """Create desktop session and launcher files"""
        from components.setup_session import setup_session_files

        return setup_session_files(
            self.app_info['binary_name'],
            self.print_status,
            self.print_success,
            self.print_error,
            self.write_file_as_root
        )

    def configure_lightdm(self, user: str) -> bool:
        """Configure LightDM for autologin"""
        from components.setup_lightdm import configure_lightdm

        return configure_lightdm(
            user,
            self.app_info['binary_name'],
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
            self.write_file_as_root
        )

    def configure_openbox(self) -> bool:
        """Configure Openbox for fullscreen kiosk mode"""
        from components.setup_openbox import configure_openbox

        return configure_openbox(
            self.app_info['binary_name'],
            self.print_status,
            self.print_success,
            self.print_error,
        )

    def restart_lightdm(self) -> bool:
        """Restart LightDM to activate kiosk mode"""
        from components.setup_lightdm import restart_lightdm

        return restart_lightdm(
            self.print_status,
            self.print_success,
        )

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
            self.print_success("Kiosk setup completed successfully! 🎉")
            print()
            self.print_status("The system will now switch to kiosk mode")
            self.print_status("Your application will launch in fullscreen automatically")
            print()

    def run(self, no_clean: bool = False, use_https: bool = True) -> bool:
        """Run the complete kiosk setup process"""
        self.print_header("SOURCCEY KIOSK SETUP")

        # Check root access
        if not self.check_root_access():
            return False

        # Detect configuration
        self.print_header("DETECTING CONFIGURATION")

        if not self.detect_project_root():
            return False

        # Ensure project dir isn't owned by root before doing any builds.
        # This prevents later `bun tauri:kiosk` from failing with permission errors.
        self.fix_project_permissions()

        if not self.detect_app_info():
            return False

        # Check system requirements
        self.print_header("CHECKING SYSTEM REQUIREMENTS")

        checks = [
            self.check_python_version(),
            self.check_bun(),
            self.check_rust(),
            self.check_git(),
            self.check_uv(),
        ]

        if not all(checks):
            self.print_error("System requirements check failed")
            return False

        # System preparation
        self.print_header("PREPARING SYSTEM")

        if not self.install_system_packages():
            self.print_error("System package installation failed")
            return False

        if not self.setup_swap_for_memory_intensive_builds():
            self.print_error("Swap setup failed")
            return False

        if not self.ensure_bun():
            self.print_error("Bun installation failed")
            return False

        # Setup project
        self.print_header("SETTING UP PROJECT")

        if not self.setup_git_submodules(use_https=use_https):
            self.print_error("Git submodule setup failed")
            if not use_https:
                self.print_error("")
                self.print_error("This may be due to SSH connectivity issues.")
                self.print_error("Try running the setup with HTTPS instead:")
                self.print_error("")
                self.print_error("  sudo python3 setup/kiosk/setup.py --use-https")
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

        # Configure kiosk mode
        self.print_header("CONFIGURING KIOSK MODE")

        user = os.environ.get("SUDO_USER") or os.environ.get("USER") or "pi"

        if not self.setup_session_files():
            self.print_error("Session files creation failed")
            return False

        if not self.configure_lightdm(user):
            self.print_error("LightDM configuration failed")
            return False

        if not self.configure_openbox():
            self.print_error("Openbox configuration failed")
            return False

        self.print_success("Kiosk mode configured")

        # Build and install application
        self.print_header("BUILDING APPLICATION")

        if not self.cleanup_old_builds(clean=not no_clean):
            self.print_warning("Cleanup had issues, continuing...")

        deb_path = self.build_tauri()
        if not deb_path:
            self.print_error("Tauri build failed")
            return False

        if not self.install_deb(deb_path):
            self.print_error("Installation failed")
            return False

        # Restart LightDM
        self.print_header("ACTIVATING KIOSK MODE")

        self.print_summary()

        if len(self.errors) == 0:
            self.restart_lightdm()

        return len(self.errors) == 0

################################################################
# Main function
################################################################

def main():
    parser = argparse.ArgumentParser(description='Sourccey Kiosk Setup')
    parser.add_argument('--no-clean', action='store_true',
                       help='Preserve build artifacts (skip cleanup)')
    parser.add_argument('--use-https', action='store_true', default=True,
                       help='Use HTTPS URLs for git operations (default: True)')
    args = parser.parse_args()

    setup = KioskSetupScript()
    success = setup.run(no_clean=args.no_clean, use_https=args.use_https)

    if not success:
        sys.exit(1)

if __name__ == "__main__":
    main()
