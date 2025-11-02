#!/usr/bin/env python3
"""
Swap Management Module for Sourccey Kiosk

Handles creating and managing swap space for memory-intensive builds.
"""

import os
import subprocess
import shutil
from pathlib import Path
from typing import Callable, Optional, Tuple

#################################################################
# Swap Manager Class
#################################################################

class SwapManager:
    def __init__(self, print_status: Callable, print_success: Callable,
                 print_warning: Callable, print_error: Callable):
        self.print_status = print_status
        self.print_success = print_success
        self.print_warning = print_warning
        self.print_error = print_error

    #################################################################
    # Swap Detection
    #################################################################

    def get_current_swap(self) -> dict:
        """Get current swap configuration"""
        try:
            result = subprocess.run(['swapon', '--show'],
                                  capture_output=True, text=True, check=True)

            swap_info = {}
            for line in result.stdout.strip().split('\n')[1:]:  # Skip header
                if line.strip():
                    parts = line.split()
                    if len(parts) >= 4:
                        name = parts[0]
                        swap_type = parts[1]
                        size = parts[2]
                        used = parts[3] if len(parts) > 3 else "0B"
                        swap_info[name] = {
                            'type': swap_type,
                            'size': size,
                            'used': used
                        }

            return swap_info
        except subprocess.CalledProcessError:
            return {}

    def check_swap_sufficient(self, min_total_gb: int = 6) -> bool:
        """Check if total swap is sufficient"""
        swap_info = self.get_current_swap()

        total_gb = 0
        for swap_data in swap_info.values():
            size_str = swap_data['size']
            if size_str.endswith('G'):
                total_gb += int(size_str[:-1])
            elif size_str.endswith('M'):
                total_gb += int(size_str[:-1]) / 1024

        return total_gb >= min_total_gb

    #################################################################
    # Swap Management
    #################################################################

    def disable_zram(self) -> bool:
        """Disable zram swap to free up RAM"""
        self.print_status("Disabling zram swap...")

        try:
            # Check if zram exists
            result = subprocess.run(['swapon', '--show'],
                                  capture_output=True, text=True)

            zram_devices = [line for line in result.stdout.split('\n')
                          if '/dev/zram' in line]

            if not zram_devices:
                self.print_status("No zram devices found")
                return True

            # Disable each zram device
            for line in zram_devices:
                device = line.split()[0]
                self.print_status(f"Disabling {device}...")
                subprocess.run(['sudo', 'swapoff', device], check=True)

            self.print_success("Zram disabled successfully")
            return True

        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to disable zram: {e}")
            return False

    def create_swap_file(self, size_gb: int = 6) -> bool:
        """Create a swap file"""
        swapfile_path = Path('/swapfile')

        self.print_status(f"Creating {size_gb}GB swap file...")

        try:
            # Create swap file
            subprocess.run(['sudo', 'fallocate', '-l', f'{size_gb}G', str(swapfile_path)],
                         check=True)

            # Set permissions
            subprocess.run(['sudo', 'chmod', '600', str(swapfile_path)], check=True)

            # Format as swap
            subprocess.run(['sudo', 'mkswap', str(swapfile_path)], check=True)

            # Activate swap
            subprocess.run(['sudo', 'swapon', str(swapfile_path)], check=True)

            self.print_success(f"Swap file created and activated ({size_gb}GB)")
            return True

        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to create swap file: {e}")
            return False

    def make_swap_permanent(self) -> bool:
        """Make swap file permanent in /etc/fstab"""
        self.print_status("Making swap permanent...")

        try:
            # Check if already in fstab
            with open('/etc/fstab', 'r') as f:
                fstab_content = f.read()

            if '/swapfile' in fstab_content:
                self.print_status("Swap file already in /etc/fstab")
                return True

            # Add to fstab
            fstab_entry = '/swapfile none swap sw 0 0\n'
            subprocess.run(['sudo', 'sh', '-c', f'echo "{fstab_entry}" >> /etc/fstab'],
                         check=True)

            self.print_success("Swap file added to /etc/fstab")
            return True

        except subprocess.CalledProcessError as e:
            self.print_error(f"Failed to update /etc/fstab: {e}")
            return False

    #################################################################
    # Main Setup Function
    #################################################################

    def setup_swap(self, size_gb: int = 6, disable_zram: bool = True) -> bool:
        """Main function to set up swap for memory-intensive builds"""

        self.print_status("Setting up swap for memory-intensive builds...")

        # Check current swap
        current_swap = self.get_current_swap()
        self.print_status(f"Current swap: {current_swap}")

        # Check if we already have sufficient swap
        if self.check_swap_sufficient(size_gb):
            self.print_success(f"Sufficient swap already available ({size_gb}GB+)")
            return True

        # Disable zram if requested
        if disable_zram:
            if not self.disable_zram():
                return False

        # Create swap file
        if not self.create_swap_file(size_gb):
            return False

        # Make permanent
        if not self.make_swap_permanent():
            self.print_warning("Swap created but not made permanent")

        # Verify final state
        final_swap = self.get_current_swap()
        self.print_success(f"Final swap configuration: {final_swap}")

        return True

#################################################################
# Convenience Functions
#################################################################

def setup_swap_for_build(print_status, print_success, print_warning, print_error,
                        size_gb: int = 6) -> bool:
    """Convenience function to set up swap for builds"""
    manager = SwapManager(print_status, print_success, print_warning, print_error)
    return manager.setup_swap(size_gb=size_gb, disable_zram=True)

def check_swap_status(print_status, print_success, print_warning, print_error) -> bool:
    """Check current swap status"""
    manager = SwapManager(print_status, print_success, print_warning, print_error)

    swap_info = manager.get_current_swap()
    print_status(f"Current swap configuration: {swap_info}")

    is_sufficient = manager.check_swap_sufficient()
    if is_sufficient:
        print_success("Swap is sufficient for memory-intensive builds")
    else:
        print_warning("Swap may be insufficient for memory-intensive builds")

    return is_sufficient
