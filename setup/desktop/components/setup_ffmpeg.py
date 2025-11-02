#!/usr/bin/env python3
"""
FFmpeg setup script for Sourccey Desktop
Downloads and installs FFmpeg binaries for the current platform
"""

import os
import sys
import zipfile
import tarfile
import platform
import urllib.request
import shutil
import time
from pathlib import Path

class ProgressBar:
    """Simple terminal progress bar"""

    def __init__(self, total: int, description: str = "Progress"):
        self.total = total
        self.current = 0
        self.description = description
        self.start_time = time.time()
        self.last_update = 0

    def update(self, increment: int = 1):
        """Update progress bar"""
        if increment != 0:
            self.current += increment
        current_time = time.time()

        # Only update display every 0.1 seconds to avoid flickering
        if current_time - self.last_update >= 0.1 or self.current >= self.total:
            self._display()
            self.last_update = current_time

    def set_progress(self, current: int):
        """Set current progress without incrementing"""
        self.current = current
        current_time = time.time()

        # Only update display every 0.1 seconds to avoid flickering
        if current_time - self.last_update >= 0.1 or self.current >= self.total:
            self._display()
            self.last_update = current_time

    def _display(self):
        """Display the progress bar"""
        if self.total == 0:
            percent = 100
        else:
            percent = min(100, (self.current / self.total) * 100)

        # Calculate bar width (max 50 characters)
        bar_width = 50
        filled_width = int((percent / 100) * bar_width)
        bar = "█" * filled_width + "░" * (bar_width - filled_width)

        # Calculate speed and ETA
        elapsed = time.time() - self.start_time
        if elapsed > 0 and self.current > 0 and self.current < self.total:
            speed = self.current / elapsed
            if speed > 0:
                remaining_bytes = self.total - self.current
                eta_seconds = remaining_bytes / speed
                eta_str = f"ETA: {eta_seconds:.1f}s"
            else:
                eta_str = "Calculating..."
        elif self.current >= self.total:
            eta_str = "Complete"
        else:
            eta_str = "Starting..."

        # Format file size if applicable
        if hasattr(self, 'file_size') and self.file_size:
            current_size = (self.current / self.total) * self.file_size
            size_str = f"{self._format_size(current_size)}/{self._format_size(self.file_size)}"
        else:
            size_str = f"{self.current}/{self.total}"

        # Create the full progress line
        progress_line = f"{self.description}: [{bar}] {percent:.1f}% ({size_str}) {eta_str}"

        # Clear the line and print the progress bar
        print(f"\r{' ' * 120}\r{progress_line}", end="", flush=True)

        if self.current >= self.total:
            print()  # New line when complete

    @staticmethod
    def _format_size(size_bytes: int) -> str:
        """Format bytes to human readable format"""
        if size_bytes == 0:
            return "0B"
        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while size_bytes >= 1024 and i < len(size_names) - 1:
            size_bytes /= 1024.0
            i += 1
        return f"{size_bytes:.1f}{size_names[i]}"

class DownloadProgress:
    """Progress callback for urllib downloads"""

    def __init__(self, url: str, filename: str):
        self.url = url
        self.filename = filename
        self.progress_bar = None
        self.file_size = 0
        self.downloaded = 0

    def __call__(self, block_num: int, block_size: int, total_size: int):
        """Callback function for urllib.request.urlretrieve"""
        if total_size > 0:
            if self.progress_bar is None:
                self.file_size = total_size
                self.progress_bar = ProgressBar(total_size, f"Downloading {self.filename}")
                self.progress_bar.file_size = total_size

            self.downloaded = block_num * block_size
            self.progress_bar.set_progress(min(self.downloaded, total_size))
        else:
            # Unknown total size, show indeterminate progress
            if self.progress_bar is None:
                self.progress_bar = ProgressBar(0, f"Downloading {self.filename}")

            self.downloaded += block_size
            # Show a simple counter for unknown size
            print(f"\rDownloading {self.filename}: {ProgressBar._format_size(self.downloaded)} downloaded", end="", flush=True)

def download(url: str, filename: str, max_retries: int = 3) -> None:
    """Download a file from URL with progress bar and retry logic"""
    print(f"Starting download from {url}...")

    for attempt in range(max_retries):
        try:
            progress = DownloadProgress(url, filename)
            urllib.request.urlretrieve(url, filename, progress)
            print(f"✅ Downloaded {filename}")
            return
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"\n⚠️  Download attempt {attempt + 1} failed: {e}")
                print(f"Retrying... ({max_retries - attempt - 1} attempts remaining)")
                # Clean up partial download
                if os.path.exists(filename):
                    os.remove(filename)
                time.sleep(2)  # Wait before retry
            else:
                print(f"\n❌ Failed to download {url} after {max_retries} attempts: {e}")
                raise

def extract_with_progress(archive_path: str, extract_to: Path, archive_type: str) -> None:
    """Extract archive with progress bar"""
    print(f"Extracting {archive_path}...")

    if archive_type == "zip":
        with zipfile.ZipFile(archive_path, "r") as zip_ref:
            file_list = zip_ref.namelist()
            progress = ProgressBar(len(file_list), f"Extracting {archive_path}")

            for i, file_info in enumerate(zip_ref.infolist()):
                zip_ref.extract(file_info, extract_to)
                progress.update()

    elif archive_type == "tar":
        with tarfile.open(archive_path, "r") as tar:
            members = tar.getmembers()
            progress = ProgressBar(len(members), f"Extracting {archive_path}")

            for member in members:
                tar.extract(member, extract_to)
                progress.update()

    print(f"✅ Extracted {archive_path}")

def setup_ffmpeg() -> bool:
    """
    Setup FFmpeg by downloading platform-specific binaries

    Returns:
        bool: True if setup successful, False otherwise
    """
    try:
        # Get project root (assuming this script is in setup/ directory)
        project_root = Path(__file__).parent.parent
        out_dir = project_root / "tools" / "ffmpeg"
        out_dir.mkdir(parents=True, exist_ok=True)

        # Check if FFmpeg is already installed
        if platform.system() == "Windows":
            ffmpeg_binary = out_dir / "ffmpeg.exe"
        else:
            ffmpeg_binary = out_dir / "ffmpeg"

        if ffmpeg_binary.exists():
            print("✅ FFmpeg is already installed")
            return True

        system = platform.system().lower()

        if "linux" in system:
            url = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
            filename = "ffmpeg.tar.xz"
            download(url, filename)

            extract_with_progress(filename, out_dir, "tar")

            # Move the binary into tools/ffmpeg/ffmpeg
            print("Organizing files...")
            for root, dirs, files in os.walk(out_dir):
                if "ffmpeg" in files and not files[0].endswith(".exe"):
                    src = os.path.join(root, "ffmpeg")
                    dst = out_dir / "ffmpeg"
                    shutil.move(src, dst)
                    break
            os.remove(filename)

        elif "windows" in system:
            url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
            filename = "ffmpeg.zip"
            download(url, filename)

            extract_with_progress(filename, out_dir, "zip")

            # Move the binary into tools/ffmpeg/ffmpeg.exe
            print("Organizing files...")
            for root, dirs, files in os.walk(out_dir):
                if "ffmpeg.exe" in files:
                    src = os.path.join(root, "ffmpeg.exe")
                    dst = out_dir / "ffmpeg.exe"
                    shutil.move(src, dst)
                    break
            os.remove(filename)

        elif "darwin" in system:
            url = "https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip"
            filename = "ffmpeg.zip"
            download(url, filename)

            extract_with_progress(filename, out_dir, "zip")

            # Move the binary into tools/ffmpeg/ffmpeg
            print("Organizing files...")
            src = out_dir / "ffmpeg"
            dst = out_dir / "ffmpeg"
            if dst.exists():
                dst.unlink()
            shutil.move(src, dst)
            os.remove(filename)

        else:
            print(f"❌ Unsupported system: {system}")
            return False

        print(f"✅ FFmpeg installed to {out_dir.absolute()}")
        return True

    except Exception as e:
        print(f"\n❌ Failed to setup FFmpeg: {e}")
        return False

if __name__ == "__main__":
    success = setup_ffmpeg()
    sys.exit(0 if success else 1)
