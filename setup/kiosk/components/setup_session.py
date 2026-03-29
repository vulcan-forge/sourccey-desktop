#!/usr/bin/env python3
"""
Session Files Module for Sourccey Kiosk

Creates desktop session files and launcher scripts for kiosk mode.
"""

from typing import Callable

class SessionFilesCreator:
    def __init__(self, print_status: Callable, print_success: Callable,
                 print_error: Callable, write_file_as_root: Callable):
        self.print_status = print_status
        self.print_success = print_success
        self.print_error = print_error
        self.write_file_as_root = write_file_as_root

    def create_desktop_entry(self, binary_name: str, session_name: str) -> bool:
        """Create desktop session entry"""
        self.print_status("Creating desktop session entry...")

        session_content = f"""[Desktop Entry]
Name={binary_name.capitalize()} Kiosk (Openbox)
Exec=/usr/local/bin/{session_name}
Type=Application
"""

        if not self.write_file_as_root(
            f"/usr/share/xsessions/{session_name}.desktop",
            session_content,
            mode=0o644
        ):
            self.print_error("Failed to create desktop entry")
            return False

        self.print_success("Desktop session entry created")
        return True

    def create_launcher_script(self, binary_name: str, package_name: str, session_name: str) -> bool:
        """Create session launcher script"""
        self.print_status("Creating launcher script...")

        binary_name_lower = binary_name.lower()
        package_name_compact = package_name.replace("-", "")
        package_name_underscore = package_name.replace("-", "_")

        launcher_content = f"""#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${{DISPLAY:-:0}}"
export SOURCCEY_APP_MODE="kiosk"
xset s off -dpms || true
xset s noblank || true

APP_BIN=""
for candidate in \\
    "/usr/bin/{binary_name}" \\
    "/usr/bin/{binary_name_lower}" \\
    "/usr/bin/{package_name}" \\
    "/usr/bin/{package_name_compact}" \\
    "/usr/bin/{package_name_underscore}"
do
    if [ -x "$candidate" ]; then
        APP_BIN="$candidate"
        break
    fi
done

if [ -z "$APP_BIN" ]; then
    echo "Could not find Sourccey binary for kiosk launch." >&2
    sleep 5
    exit 1
fi

openbox-session &
exec "$APP_BIN" --kiosk
"""

        if not self.write_file_as_root(
            f"/usr/local/bin/{session_name}",
            launcher_content,
            mode=0o755,
            executable=True
        ):
            self.print_error("Failed to create launcher script")
            return False

        self.print_success("Launcher script created")
        return True

    def create_all(self, binary_name: str, package_name: str, session_name: str) -> bool:
        """Create all session files"""
        self.print_status("Creating session files...")

        if not self.create_desktop_entry(binary_name, session_name):
            return False

        if not self.create_launcher_script(binary_name, package_name, session_name):
            return False

        self.print_success("All session files created")
        return True


def setup_session_files(binary_name: str, package_name: str, session_name: str, print_status, print_success,
                       print_error, write_file_as_root) -> bool:
    """Convenience function for creating session files"""
    creator = SessionFilesCreator(
        print_status, print_success, print_error, write_file_as_root
    )
    return creator.create_all(binary_name, package_name, session_name)
