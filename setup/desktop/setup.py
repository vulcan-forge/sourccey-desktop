#!/usr/bin/env python3
"""
Sourccey Desktop Setup Script

This script sets up the development environment for the Sourccey Desktop app.
It validates project structure, ensures required tooling exists, and then
initializes project dependencies.
"""

import argparse
import os
import sys
from pathlib import Path

project_root = Path(__file__).parent.parent.parent
shared_dir = Path(__file__).parent.parent / "shared"
if str(shared_dir) not in sys.path:
    sys.path.insert(0, str(shared_dir))

from setup_git import GitSetupManager  # type: ignore
from setup_javascript import JavaScriptSetupManager  # type: ignore
from setup_python import PythonSetupManager  # type: ignore
from setup_rust import RustSetupManager  # type: ignore


class Colors:
    """ANSI color codes for terminal output"""

    SUPPORTS_COLOR = (
        hasattr(sys.stdout, "isatty")
        and sys.stdout.isatty()
        and os.environ.get("TERM") != "dumb"
        and os.environ.get("NO_COLOR") is None
    )

    RED = "\033[0;31m" if SUPPORTS_COLOR else ""
    GREEN = "\033[0;32m" if SUPPORTS_COLOR else ""
    YELLOW = "\033[1;33m" if SUPPORTS_COLOR else ""
    BLUE = "\033[0;34m" if SUPPORTS_COLOR else ""
    CYAN = "\033[0;36m" if SUPPORTS_COLOR else ""
    NC = "\033[0m" if SUPPORTS_COLOR else ""


class SetupScript:
    def __init__(self):
        self.project_root = project_root
        self.errors = []
        self.warnings = []

        self.python_manager = PythonSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )
        self.javascript_manager = JavaScriptSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )
        self.rust_manager = RustSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )
        self.git_manager = GitSetupManager(
            self.project_root,
            self.print_status,
            self.print_success,
            self.print_warning,
            self.print_error,
        )

    #################################################################
    # Print functions
    #################################################################

    def print_status(self, message: str, color: str = Colors.BLUE):
        print(f"{color}[INFO]{Colors.NC} {message}")

    def print_success(self, message: str):
        print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")

    def print_warning(self, message: str):
        print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")
        self.warnings.append(message)

    def print_error(self, message: str):
        print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")
        self.errors.append(message)

    def print_header(self, message: str):
        print(f"\n{Colors.CYAN}{'=' * 60}{Colors.NC}")
        print(f"{Colors.CYAN}{message.center(60)}{Colors.NC}")
        print(f"{Colors.CYAN}{'=' * 60}{Colors.NC}\n")

    #################################################################
    # Check / ensure functions
    #################################################################

    def check_python_version(self) -> bool:
        return self.python_manager.check_python_version()

    def check_git(self) -> bool:
        return self.git_manager.check_git_installed()

    def check_uv(self) -> bool:
        return self.python_manager.check_uv()

    def ensure_bun(self) -> bool:
        return self.javascript_manager.ensure_bun()

    def ensure_rust(self) -> bool:
        return self.rust_manager.ensure_rust()

    def check_project_structure(self) -> bool:
        self.print_status("Checking project structure...")

        required_files = ["package.json", "src-tauri/Cargo.toml"]
        required_dirs = ["src", "src-tauri"]

        missing_files = [
            file_path
            for file_path in required_files
            if not (self.project_root / file_path).exists()
        ]
        missing_dirs = [
            dir_path for dir_path in required_dirs if not (self.project_root / dir_path).exists()
        ]

        if missing_files or missing_dirs:
            self.print_error("Project structure is incomplete:")
            for file_path in missing_files:
                self.print_error(f"  Missing file: {file_path}")
            for dir_path in missing_dirs:
                self.print_error(f"  Missing directory: {dir_path}")
            self.print_error("Run this script from the sourccey-desktop repository.")
            return False

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
        return self.git_manager.setup_git_submodules(use_https=use_https)

    def setup_python_environment(self) -> bool:
        return self.python_manager.setup_python_environment(desktop=True)

    def setup_bun_packages(self) -> bool:
        return self.javascript_manager.install_packages()

    #################################################################
    # Summary and main functions
    #################################################################

    def print_summary(self):
        self.print_header("SETUP SUMMARY")

        if self.errors:
            self.print_error(f"Setup completed with {len(self.errors)} error(s):")
            for error in self.errors:
                print(f"  - {error}")
            print()

        if self.warnings:
            self.print_warning(f"Setup completed with {len(self.warnings)} warning(s):")
            for warning in self.warnings:
                print(f"  - {warning}")
            print()

        if not self.errors:
            self.print_success("Setup completed successfully.")
            print()
            self.print_status("You can now start developing with:")
            self.print_status("  - Desktop app: bun tauri dev")
            self.print_status("If Bun was just installed, reload your terminal or run: source ~/.zshrc")
            print()

    def run(self, use_https: bool = False) -> bool:
        self.print_header("SOURCCEY DESKTOP SETUP")

        self.print_header("CHECKING SYSTEM REQUIREMENTS")

        required_checks = [
            self.check_project_structure(),
            self.check_python_version(),
            self.check_git(),
        ]

        # Optional tool, do not fail setup if missing.
        self.check_uv()

        if not all(required_checks):
            self.print_error("System requirements check failed.")
            return False

        if not self.ensure_bun():
            self.print_error("Bun setup failed.")
            return False

        if not self.ensure_rust():
            self.print_error("Rust setup failed.")
            return False

        self.print_header("SETTING UP PROJECT")

        if not self.setup_git_submodules(use_https=use_https):
            self.print_error("Git submodule setup failed.")

            if not use_https:
                self.print_error("")
                self.print_error("This might be due to SSH connectivity issues.")
                self.print_error("Try running setup with HTTPS instead:")
                self.print_error("")
                self.print_error("  python3 setup/desktop/setup.py --use-https")
                self.print_error("")
                self.print_error("This will use HTTPS URLs instead of SSH for git operations.")
            else:
                self.print_error("Git submodule setup failed even with HTTPS.")
                self.print_error("Check your internet connection and try again.")
            return False

        setup_steps = [
            self.setup_python_environment(),
            self.setup_bun_packages(),
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
    setup_script = SetupScript()
    return setup_script.run(use_https=use_https)


def main():
    parser = argparse.ArgumentParser(description="Sourccey Desktop Setup")
    parser.add_argument(
        "--use-https",
        action="store_true",
        default=False,
        help="Force HTTPS URLs instead of SSH for git operations",
    )
    args = parser.parse_args()

    setup_script = SetupScript()
    success = setup_script.run(use_https=args.use_https)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
