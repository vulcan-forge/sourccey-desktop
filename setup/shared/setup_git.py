#!/usr/bin/env python3
"""
Git Setup Utilities for Sourccey Desktop

This module handles git submodule initialization and updates with progress tracking.
Used by both desktop and kiosk setup scripts.
"""

import os
import sys
import subprocess
import re
import time
import shutil
from pathlib import Path
from typing import Callable, Optional

from setup_helper import should_run_as_user, wrap_command

#################################################################
# Git Progress Tracker
#################################################################

class GitProgressTracker:
    """Track and display git clone progress"""

    def __init__(self, operation_name: str, print_status: Callable, print_progress: Callable):
        self.operation_name = operation_name
        self.print_status = print_status
        self.print_progress = print_progress
        self.current_line = ""
        self.last_progress = ""
        self.has_output = False

        # Check if colors are supported
        self.supports_color = (
            hasattr(sys.stdout, 'isatty') and sys.stdout.isatty() and
            os.environ.get('TERM') != 'dumb' and
            os.environ.get('NO_COLOR') is None
        )

    def update_progress(self, line: str):
        """Update progress display with git output"""
        self.current_line = line.strip()
        self.has_output = True

        # Parse different types of git progress
        if "Cloning into" in line:
            repo_name = line.split("'")[1] if "'" in line else "repository"
            self._print_status(f"Cloning {repo_name}...")

        elif "remote:" in line:
            # Skip remote messages, they're usually just info
            pass

        elif "Receiving objects:" in line:
            # Parse: "Receiving objects:  45% (1234/2745), 1.23 MiB | 2.34 MiB/s"
            match = re.search(r'(\d+)% \((\d+)/(\d+)\)', line)
            if match:
                percent = match.group(1)
                current = match.group(2)
                total = match.group(3)

                # Extract speed if available
                speed_match = re.search(r'(\d+\.?\d*)\s*([KMGT]?i?B/s)', line)
                speed = f" at {speed_match.group(0)}" if speed_match else ""

                self._print_progress(f"Receiving objects: {percent}% ({current}/{total}){speed}")

        elif "Resolving deltas:" in line:
            # Parse: "Resolving deltas:  67% (1234/1845)"
            match = re.search(r'(\d+)% \((\d+)/(\d+)\)', line)
            if match:
                percent = match.group(1)
                current = match.group(2)
                total = match.group(3)
                self._print_progress(f"Resolving deltas: {percent}% ({current}/{total})")

        elif "Updating files:" in line:
            # Parse: "Updating files:  89% (1234/1387)"
            match = re.search(r'(\d+)% \((\d+)/(\d+)\)', line)
            if match:
                percent = match.group(1)
                current = match.group(2)
                total = match.group(3)
                self._print_progress(f"Updating files: {percent}% ({current}/{total})")

        elif "Submodule path" in line and "checked out" in line:
            # Parse: "Submodule path 'modules/lerobot-vulcan': checked out 'abc123'"
            path_match = re.search(r"'([^']+)'", line)
            commit_match = re.search(r"checked out '([^']+)'", line)
            if path_match and commit_match:
                path = path_match.group(1)
                commit = commit_match.group(1)[:8]  # Short commit hash
                self._print_status(f"Submodule {path}: checked out {commit}")

        elif line.startswith("fatal:") or line.startswith("error:"):
            # Don't overwrite progress with errors
            pass

        else:
            # For other lines, just show them as status
            if line.strip() and not line.startswith("remote:"):
                self._print_status(line.strip())

    def finish(self):
        """Clear any remaining progress line"""
        if self.supports_color and self.last_progress:
            print(f"\r{' ' * 80}\r", end='', flush=True)

        # If no output was shown, show a simple status
        if not self.has_output:
            self._print_status(f"{self.operation_name} completed")

    def show_timeout_warning(self, timeout_seconds: int):
        """Show a warning about approaching timeout"""
        self._print_status(f"Warning: Operation has been running for {timeout_seconds} seconds...")

    def _print_progress(self, message: str):
        """Print progress message, overwriting the previous line"""
        if self.supports_color:
            # Use carriage return to overwrite line
            print(f"\r{message}", end='', flush=True)
            self.last_progress = message
        else:
            self.print_status(message)

    def _print_status(self, message: str):
        """Print status message on a new line"""
        if self.supports_color and self.last_progress:
            # Clear the progress line first
            print(f"\r{' ' * 80}\r", end='', flush=True)
        self.print_status(message)
        self.last_progress = ""

#################################################################
# Git Setup Manager Class
#################################################################

class GitSetupManager:
    """Manager class for Git-related setup operations"""

    def __init__(
        self,
        project_root: Path,
        print_status: Callable,
        print_success: Callable,
        print_warning: Callable,
        print_error: Callable
    ):
        self.project_root = project_root
        self.print_status = print_status
        self.print_success = print_success
        self.print_warning = print_warning
        self.print_error = print_error

    #################################################################
    # Git Command Execution
    #################################################################

    def _get_git_env(self) -> dict:
        """Get environment with SSH settings"""
        env = os.environ.copy()
        env['GIT_SSH_COMMAND'] = 'ssh -o StrictHostKeyChecking=no'
        return env

    def _run_git_command(self, command: list, cwd: Path, **kwargs):
        """Run a git command, automatically running as user when sudo is detected"""
        wrapped_cmd, actual_cwd = wrap_command(command, cwd)
        return subprocess.run(wrapped_cmd, cwd=actual_cwd, env=self._get_git_env(), **kwargs)

    def run_git_command_with_progress(
        self,
        command: list,
        cwd: Path,
        operation_name: str,
        timeout: Optional[int] = None
    ) -> bool:
        """Run a git command and show real-time progress

        Args:
            command: Git command to run
            cwd: Working directory
            operation_name: Name of the operation for progress tracking
            timeout: Optional timeout in seconds
        """
        tracker = GitProgressTracker(operation_name, self.print_status, self.print_status)

        try:
            # Add --progress flag to git commands to force progress output
            if "git" in command and "submodule" in command:
                if "update" in command:
                    command = command + ["--progress"]

            # Automatically wrap to run as user when sudo is detected
            full_cmd, actual_cwd = wrap_command(command, cwd)
            env = self._get_git_env()

            # Start the process with SSH settings
            process = subprocess.Popen(
                full_cmd,
                cwd=actual_cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                env=env
            )

            # Read output line by line with timeout handling
            start_time = time.time()
            timeout_warning_shown = False

            while True:
                elapsed_time = time.time() - start_time

                # Check for timeout
                if timeout and elapsed_time > timeout:
                    process.terminate()
                    try:
                        process.wait(timeout=5)  # Give it 5 seconds to terminate gracefully
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()

                    tracker.finish()
                    self.print_error(f"Git command timed out after {timeout} seconds")
                    return False

                # Show timeout warning at 80% of timeout duration
                if timeout and not timeout_warning_shown and elapsed_time > (timeout * 0.8):
                    tracker.show_timeout_warning(int(elapsed_time))
                    timeout_warning_shown = True

                line = process.stdout.readline()
                if not line:
                    break

                tracker.update_progress(line)

            # Wait for process to complete
            return_code = process.wait()

            # Clear any remaining progress
            tracker.finish()

            if return_code != 0:
                self.print_warning(f"Git command failed with return code {return_code}. Your git repositories and submodules may still be working fine.")
                return False

            return True

        except Exception as e:
            tracker.finish()
            self.print_error(f"Failed to run git command: {e}")
            return False

    #################################################################
    # Git LFS Management
    #################################################################

    def check_git_lfs_installed(self) -> bool:
        """Check if Git LFS is installed"""
        self.print_status("Checking Git LFS installation...")

        if not shutil.which("git-lfs"):
            self.print_status("Git LFS is not installed")
            self.print_status("Please install Git LFS: sudo apt install git-lfs")
            return False

        try:
            result = subprocess.run(
                ["git", "lfs", "version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0]
                self.print_success(f"Git LFS is installed: {version}")
            else:
                self.print_success("Git LFS is installed")
        except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
            self.print_success("Git LFS is installed")

        return True

    def install_git_lfs(self) -> bool:
        """Install Git LFS using apt"""
        self.print_status("Installing Git LFS...")

        try:
            # Update package list
            subprocess.run(
                ["sudo", "apt", "update"],
                check=True,
                capture_output=True,
                text=True
            )

            # Install Git LFS
            result = subprocess.run(
                ["sudo", "apt", "install", "-y", "git-lfs"],
                check=True,
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                self.print_success("Git LFS installed successfully")
                return True
            else:
                self.print_error("Failed to install Git LFS")
                return False

        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to install Git LFS: {e}")
            return False

    def setup_git_lfs(self) -> bool:
        """Setup Git LFS for the repository"""
        self.print_status("Setting up Git LFS...")

        try:
            # Initialize Git LFS
            result = subprocess.run(
                ["git", "lfs", "install"],
                cwd=self.project_root,
                check=True,
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                self.print_success("Git LFS initialized successfully")

                # Configure Git LFS to use local temp directory to avoid cross-device link issues
                self.print_status("Configuring Git LFS to avoid cross-device link issues...")

                # Set LFS temp directory to project directory to avoid cross-device issues
                lfs_temp_dir = self.project_root / ".git" / "lfs" / "tmp"
                lfs_temp_dir.mkdir(parents=True, exist_ok=True)

                # Fix ownership if running as root via sudo
                sudo_user = os.environ.get("SUDO_USER")
                if hasattr(os, 'geteuid') and os.geteuid() == 0 and sudo_user and sudo_user != "root":
                    # Fix ownership of the entire .git/lfs directory, not just temp
                    lfs_dir = self.project_root / ".git" / "lfs"
                    if lfs_dir.exists():
                        subprocess.run(
                            ["chown", "-R", f"{sudo_user}:{sudo_user}", str(lfs_dir)],
                            check=False
                        )

                # Configure Git LFS to use local temp directory
                subprocess.run(
                    ["git", "config", "lfs.tempdir", str(lfs_temp_dir)],
                    cwd=self.project_root,
                    check=True,
                    capture_output=True,
                    text=True
                )

                self.print_success("Git LFS configured for local temp directory")
                return True
            else:
                self.print_error("Failed to initialize Git LFS")
                return False

        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to setup Git LFS: {e}")
            return False

    def clean_git_lfs_cache(self) -> bool:
        """Clean Git LFS cache to resolve corrupted objects"""
        self.print_status("Cleaning Git LFS cache...")

        try:
            # Clean LFS cache
            result = subprocess.run(
                ["git", "lfs", "prune"],
                cwd=self.project_root,
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                self.print_success("Git LFS cache cleaned")
                return True
            else:
                self.print_warning(f"Git LFS cache clean had issues: {result.stderr}")
                return True  # Don't fail setup for cache clean issues

        except subprocess.CalledProcessError as e:
            self.print_warning(f"Failed to clean Git LFS cache: {e}")
            return True  # Don't fail setup for cache clean issues

    def pull_git_lfs_files(self) -> bool:
        """Pull Git LFS files for the repository"""
        self.print_status("Pulling Git LFS files...")

        try:
            # Check if there are any LFS files to pull (automatically runs as user if sudo)
            wrapped_cmd, actual_cwd = wrap_command(["git", "lfs", "ls-files"], self.project_root)
            lfs_files_result = subprocess.run(
                wrapped_cmd,
                cwd=actual_cwd,
                capture_output=True,
                text=True
            )

            if lfs_files_result.returncode != 0 or not lfs_files_result.stdout.strip():
                self.print_status("No LFS files found in main repository")
                return True

            # Pull LFS files (automatically runs as user if sudo)
            wrapped_cmd, actual_cwd = wrap_command(["git", "lfs", "pull"], self.project_root)
            result = subprocess.run(
                wrapped_cmd,
                cwd=actual_cwd,
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                self.print_success("Git LFS files pulled successfully")
                return True
            else:
                # Check for cross-device link errors
                if "invalid cross-device link" in result.stderr.lower():
                    self.print_warning("Cross-device link error detected, cleaning cache and retrying...")
                    self.clean_git_lfs_cache()

                    # Retry pull
                    wrapped_cmd, actual_cwd = wrap_command(["git", "lfs", "pull"], self.project_root)
                    retry_result = subprocess.run(
                        wrapped_cmd,
                        cwd=actual_cwd,
                        capture_output=True,
                        text=True
                    )

                    if retry_result.returncode == 0:
                        self.print_success("Git LFS files pulled successfully after cache clean")
                        return True
                    else:
                        self.print_error(f"Failed to pull Git LFS files after retry: {retry_result.stderr}")
                        return False

                # Check if it's just a "no files to pull" error
                elif "no files to pull" in result.stderr.lower() or "nothing to pull" in result.stderr.lower():
                    self.print_status("No LFS files to pull (already up to date)")
                    return True
                else:
                    self.print_error(f"Failed to pull Git LFS files: {result.stderr}")
                    return False

        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to pull Git LFS files: {e}")
            return False

    def pull_git_lfs_from_submodules(self) -> bool:
        """Pull Git LFS files from all submodules"""
        self.print_status("Pulling Git LFS files from submodules...")

        try:
            # Get list of submodules (automatically runs as user when sudo is detected)
            result = self._run_git_command(
                ["git", "submodule", "status"],
                self.project_root,
                capture_output=True,
                text=True
            )

            if result.returncode != 0:
                self.print_status("No submodules found or submodule status failed")
                return True

            submodule_lines = result.stdout.strip().split('\n')
            if not submodule_lines or submodule_lines == ['']:
                self.print_status("No submodules found")
                return True

            success = True
            for line in submodule_lines:
                if not line.strip():
                    continue

                # Parse submodule path from status line
                # Format: " 1234567abcdef path/to/submodule (commit-hash)"
                parts = line.strip().split()
                if len(parts) >= 2:
                    submodule_path = parts[1]
                    full_path = self.project_root / submodule_path

                    if full_path.exists():
                        self.print_status(f"Pulling LFS files from submodule: {submodule_path}")

                        try:
                            # Check if submodule has LFS files (automatically runs as user if sudo)
                            wrapped_cmd, actual_cwd = wrap_command(["git", "lfs", "ls-files"], full_path)
                            lfs_files_result = subprocess.run(
                                wrapped_cmd,
                                cwd=actual_cwd,
                                capture_output=True,
                                text=True
                            )

                            if lfs_files_result.returncode != 0 or not lfs_files_result.stdout.strip():
                                self.print_status(f"No LFS files found in submodule: {submodule_path}")
                                continue

                            # Pull LFS files from this submodule (automatically runs as user if sudo)
                            wrapped_cmd, actual_cwd = wrap_command(["git", "lfs", "pull"], full_path)
                            lfs_result = subprocess.run(
                                wrapped_cmd,
                                cwd=actual_cwd,
                                capture_output=True,
                                text=True
                            )

                            if lfs_result.returncode == 0:
                                self.print_success(f"LFS files pulled from {submodule_path}")
                            else:
                                # Check if it's just a "no files to pull" error
                                if "no files to pull" in lfs_result.stderr.lower() or "nothing to pull" in lfs_result.stderr.lower():
                                    self.print_status(f"LFS files already up to date in {submodule_path}")
                                else:
                                    self.print_warning(f"Failed to pull LFS files from {submodule_path}: {lfs_result.stderr}")
                                    success = False

                        except subprocess.CalledProcessError as e:
                            self.print_warning(f"Failed to pull LFS files from {submodule_path}: {e}")
                            success = False
                    else:
                        self.print_warning(f"Submodule path does not exist: {submodule_path}")
                        success = False

            if success:
                self.print_success("Git LFS files pulled from all submodules")
            else:
                self.print_warning("Some submodules failed to pull LFS files")

            return success

        except Exception as e:
            self.print_error(f"Failed to pull Git LFS files from submodules: {e}")
            return False

    def ensure_git_lfs(self) -> bool:
        """Ensure Git LFS is installed and configured"""
        # Check if Git LFS is installed
        if not self.check_git_lfs_installed():
            # Try to install it
            if not self.install_git_lfs():
                return False

        # Setup Git LFS
        if not self.setup_git_lfs():
            return False

        # Pull LFS files from main repository
        if not self.pull_git_lfs_files():
            return False

        # Pull LFS files from submodules
        if not self.pull_git_lfs_from_submodules():
            # Don't fail completely if submodule LFS fails
            self.print_warning("Some submodule LFS files may not be available")

        return True

    def check_git_installed(self) -> bool:
        """Check if Git is installed"""
        self.print_status("Checking Git installation...")

        if not shutil.which("git"):
            self.print_error("Git is not installed")
            self.print_error("Please install Git from https://git-scm.com/")
            return False

        try:
            result = subprocess.run(
                ["git", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0]
                self.print_success(f"Git is installed: {version}")
            else:
                self.print_success("Git is installed")
        except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
            self.print_success("Git is installed")

        return True

    #################################################################
    # Submodule Management
    #################################################################

    def initialize_git_submodules(self) -> bool:
        """Initialize git submodules with 30-second timeout"""
        self.print_status("Initializing git submodules...")

        try:
            # Check if submodules are already initialized
            result = self._run_git_command(
                ["git", "submodule", "status"],
                self.project_root,
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                self.print_status("Git submodules already initialized")
                return True

            # Show timeout information with clear spacing
            print()
            self.print_status("⏱️  30-second timeout for git submodule init")
            print()

            # Initialize submodules with progress tracking and 30-second timeout
            if not self.run_git_command_with_progress(
                ["git", "submodule", "init"],
                self.project_root,
                "Initializing submodules",
                timeout=30
            ):
                self.print_error("Git submodule initialization failed or timed out after 30 seconds")
                self.print_error("This may be due to network issues or repository access problems")
                self.print_error("Please check your internet connection and try again")
                return False

            self.print_success("Git submodules initialized")
            return True

        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to initialize git submodules: {e}")
            return False

    def handle_submodule_changes(self) -> bool:
        """Handle any uncommitted changes in submodules"""
        submodule_path = self.project_root / "modules" / "lerobot-vulcan"

        if not submodule_path.exists():
            return True

        try:
            # Check if there are uncommitted changes
            status_result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=submodule_path,
                capture_output=True,
                text=True,
                env=self._get_git_env()
            )

            if status_result.returncode == 0 and status_result.stdout.strip():
                # Stash any uncommitted changes
                subprocess.run(["git", "stash"], cwd=submodule_path, check=True, env=self._get_git_env())
                self.print_success("Changes stashed successfully")

            return True

        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to handle submodule changes: {e}")
            return False

    def update_git_submodules(self) -> bool:
        """Update git submodules to the versions pinned in the repo"""
        self.print_status("Cloning and updating git submodules...")

        try:
            if not self.run_git_command_with_progress(
                ["git", "submodule", "update", "--init", "--recursive"],
                self.project_root,
                "Cloning submodules"
            ):
                # Check if submodule actually exists and is valid despite error code
                submodule_path = self.project_root / "modules" / "lerobot-vulcan"
                git_dir = submodule_path / ".git"

                # Check if submodule exists and has valid git directory/file
                if submodule_path.exists():
                    # Check if it's a valid git repo (either .git directory or .git file pointing to .git/modules)
                    if git_dir.exists() or (git_dir.is_file() and self.project_root / ".git" / "modules" / "modules" / "lerobot-vulcan").exists():
                        # Submodule exists and is valid, consider it success even if return code != 0
                        self.print_status("Submodule validation: submodule directory exists and appears valid")
                        self.print_success("Git submodules updated to recorded commits")
                        return True

                self.print_error("Git submodule update failed")
                self.print_error("This may be due to:")
                self.print_error("  - Network connectivity issues")
                self.print_error("  - Repository access permissions")
                self.print_error("  - Invalid submodule URLs")
                self.print_error("  - Authentication problems")
                self.print_error("Please check your internet connection and repository access")
                return False

            self.print_success("Git submodules updated to recorded commits")
            return True

        except subprocess.CalledProcessError as e:
            # Check if submodule actually exists and is valid despite exception
            submodule_path = self.project_root / "modules" / "lerobot-vulcan"
            git_dir = submodule_path / ".git"

            if submodule_path.exists():
                # Check if it's a valid git repo (either .git directory or .git file)
                if git_dir.exists() or (git_dir.is_file() and self.project_root / ".git" / "modules" / "modules" / "lerobot-vulcan").exists():
                    # Submodule exists and is valid, consider it success even if exception occurred
                    self.print_status("Submodule validation: submodule directory exists and appears valid")
                    self.print_success("Git submodules updated to recorded commits")
                    return True

            self.print_error(f"Failed to update git submodules: {e}")
            return False

    def notify_stashed_changes(self):
        """Notify user about any stashed changes"""
        submodule_path = self.project_root / "modules" / "lerobot-vulcan"

        if not submodule_path.exists():
            return

        try:
            stash_list = subprocess.run(
                ["git", "stash", "list"],
                cwd=submodule_path,
                capture_output=True,
                text=True
            )
            if "Setup script stash" in stash_list.stdout:
                self.print_status(
                    "Note: Any previous changes were stashed. "
                    "Use 'git stash pop' in the submodule to recover them."
                )
        except subprocess.CalledProcessError:
            # Ignore errors here, this is just a notification
            pass

    #################################################################
    # HTTPS URL Conversion
    #################################################################

    def convert_gitmodules_to_https(self, gitmodules_path: Path):
        """Convert SSH URLs in .gitmodules to HTTPS URLs"""
        # Create backup first
        self.backup_gitmodules(gitmodules_path)

        # Read current content
        content = gitmodules_path.read_text()

        # Convert git@github.com: to https://github.com/
        content = re.sub(
            r'git@github\.com:([^/]+)/([^\.]+)\.git',
            r'https://github.com/\1/\2.git',
            content
        )

        # Write back the modified content
        gitmodules_path.write_text(content)

        # Verify the conversion worked
        self.verify_https_conversion(gitmodules_path)

    def verify_https_conversion(self, gitmodules_path: Path):
        """Verify that HTTPS conversion was successful"""
        try:
            content = gitmodules_path.read_text()
            if "git@github.com:" in content:
                self.print_warning("Warning: Some SSH URLs may not have been converted to HTTPS")
            else:
                self.print_success("Successfully converted all SSH URLs to HTTPS")
        except Exception as e:
            self.print_warning(f"Could not verify HTTPS conversion: {e}")

    def backup_gitmodules(self, gitmodules_path: Path) -> Path:
        """Create a backup of the original .gitmodules file"""
        backup_path = gitmodules_path.with_suffix('.gitmodules.backup')
        shutil.copy2(gitmodules_path, backup_path)
        return backup_path

    def restore_gitmodules_from_backup(self, gitmodules_path: Path):
        """Restore original .gitmodules from backup"""
        backup_path = gitmodules_path.with_suffix('.gitmodules.backup')

        if backup_path.exists():
            shutil.copy2(backup_path, gitmodules_path)
            backup_path.unlink()  # Remove backup file
            return True
        else:
            self.print_warning("No backup file found to restore")
            return False

    #################################################################
    # Debug and Troubleshooting
    #################################################################

    def debug_submodule_config(self):
        """Debug submodule configuration to help troubleshoot issues"""
        try:
            self.print_status("Debugging submodule configuration...")

            # Check .gitmodules content
            gitmodules_path = self.project_root / ".gitmodules"
            if gitmodules_path.exists():
                content = gitmodules_path.read_text()
                self.print_status(f".gitmodules content:\n{content}")
            else:
                self.print_warning(".gitmodules file not found")

            # Check git config for submodules
            result = subprocess.run(
                ["git", "config", "--list", "--file", ".gitmodules"],
                cwd=self.project_root,
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                self.print_status(f"Git submodule config:\n{result.stdout}")
            else:
                self.print_warning("Could not read git submodule config")

        except Exception as e:
            self.print_warning(f"Debug failed: {e}")

    #################################################################
    # Main Setup Method
    #################################################################

    def setup_git_submodules(self, use_https: bool = False) -> bool:
        """Main function to setup git submodules with progress tracking

        Args:
            use_https: If True, force HTTPS URLs instead of SSH
        """
        self.print_status("Setting up git submodules...")

        if use_https:
            self.print_status("Using HTTPS URLs for git operations")
            # Convert .gitmodules to HTTPS before any operations
            gitmodules_path = self.project_root / ".gitmodules"
            if gitmodules_path.exists():
                self.convert_gitmodules_to_https(gitmodules_path)
        else:
            self.print_status("Using SSH URLs for git operations (with HTTPS fallback)")

        # Check git installation first
        if not self.check_git_installed():
            return False

        # Ensure Git LFS is available
        if not self.ensure_git_lfs():
            self.print_error("Git LFS setup failed")
            return False

        # Initialize submodules
        if not self.initialize_git_submodules():
            return False

        # If using HTTPS, we need to re-initialize submodules after URL conversion
        if use_https:
            self.print_status("Re-initializing submodules with HTTPS URLs...")

            # Show timeout information with clear spacing
            print()
            self.print_status("⏱️  30-second timeout for git submodule init")
            print()

            if not self.run_git_command_with_progress(
                ["git", "submodule", "init"],
                self.project_root,
                "Re-initializing submodules with HTTPS",
                timeout=30
            ):
                self.print_error("Failed to re-initialize submodules with HTTPS URLs")
                return False

        # Handle any uncommitted changes
        if not self.handle_submodule_changes():
            return False

        # Update submodules
        if not self.update_git_submodules():
            if use_https:
                self.print_error("HTTPS submodule update failed. Running debug information...")
                self.debug_submodule_config()
            return False

        # Notify about stashed changes
        self.notify_stashed_changes()

        # Restore original .gitmodules if we converted to HTTPS
        if use_https:
            gitmodules_path = self.project_root / ".gitmodules"
            if gitmodules_path.exists():
                self.restore_gitmodules_from_backup(gitmodules_path)

        return True


#################################################################
# Convenience Functions
#################################################################

def setup_git_submodules(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable,
    use_https: bool = False
) -> bool:
    """Convenience function for setting up git submodules"""
    manager = GitSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.setup_git_submodules(use_https)


def check_git_installed(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for checking if Git is installed"""
    manager = GitSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.check_git_installed()


def ensure_git_lfs(
    project_root: Path,
    print_status: Callable,
    print_success: Callable,
    print_warning: Callable,
    print_error: Callable
) -> bool:
    """Convenience function for ensuring Git LFS is available"""
    manager = GitSetupManager(
        project_root, print_status, print_success, print_warning, print_error
    )
    return manager.ensure_git_lfs()

