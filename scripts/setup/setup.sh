#!/bin/bash

# Exit on any error
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to run commands with error handling
run_command() {
    local cmd="$1"
    local error_msg="$2"

    print_status "Running: $cmd"
    if eval "$cmd"; then
        print_success "Command completed successfully"
    else
        print_error "$error_msg"
        exit 1
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Main setup function
main() {
    print_status "Starting Sourccey Desktop setup..."

    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d "modules/lerobot-vulcan" ]; then
        print_error "Please run this script from the root of the sourccey-desktop project"
        exit 1
    fi

    # Check required tools
    print_status "Checking required tools..."

    if ! command_exists uv; then
        print_error "uv is not installed. Please install uv first: https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
    fi

    if ! command_exists bun; then
        print_error "bun is not installed. Please install bun first: https://bun.sh/docs/installation"
        exit 1
    fi

    if ! command_exists git; then
        print_error "git is not installed. Please install git first"
        exit 1
    fi

    print_success "All required tools are available"

    # Step 1: Initialize and update git submodules
    print_status "Step 1: Initializing git submodules..."
    run_command "git submodule init" "Failed to initialize git submodules"
    run_command "git submodule update" "Failed to update git submodules"

    # Step 2: Setup Python environment in lerobot-vulcan
    print_status "Step 2: Setting up Python environment in modules/lerobot-vulcan..."
    cd modules/lerobot-vulcan

    print_status "Creating virtual environment with uv..."
    run_command "uv venv" "Failed to create virtual environment"

    print_status "Installing lerobot with sourccey, smolvla, and feetech dependencies..."
    run_command "uv install -e .[sourccey,smolvla,feetech]" "Failed to install lerobot dependencies"

    # Return to root directory
    cd ../..

    # Step 3: Install Bun packages
    print_status "Step 3: Installing Bun packages..."
    run_command "bun install" "Failed to install Bun packages"

    print_success "Setup completed successfully! 🎉"
    print_status "You can now start developing with:"
    print_status "  - Frontend: bun dev"
    print_status "  - Backend: cd modules/lerobot-vulcan && uv run lerobot-*"
}

# Run main function
main "$@"
