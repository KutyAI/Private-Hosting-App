#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# ANSI escape codes for coloring
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0;0m' # No Color

echo -e "${BLUE}=========================================================${NC}"
echo -e "${BLUE}        🎮 MC Hosting - macOS Build & Package Wizard      ${NC}"
echo -e "${BLUE}=========================================================${NC}"
echo ""

# Ensure we are in the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Step 1: Install workspace dependencies
echo -e "${CYAN}[1/6] Installing monorepo dependencies...${NC}"
# Use --ignore-scripts to avoid native compilation issues on non-target Node environments (e.g. Node 26)
npm install --ignore-scripts
echo -e "${GREEN}✓ Dependencies successfully installed.${NC}\n"

# Step 2: Build shared types
echo -e "${CYAN}[2/6] Building shared packages...${NC}"
npm run build -w packages/shared-types
echo -e "${GREEN}✓ Shared types compiled.${NC}\n"

# Step 3: Build backend API
echo -e "${CYAN}[3/6] Building backend API service...${NC}"
npm run build -w apps/backend-api
echo -e "${GREEN}✓ Backend API compiled.${NC}\n"

# Step 4: Build host agent
echo -e "${CYAN}[4/6] Building host agent service...${NC}"
npm run build -w apps/host-agent
echo -e "${GREEN}✓ Host agent compiled.${NC}\n"

# Step 5: Packaging host agent as Tauri sidecars
echo -e "${CYAN}[5/6] Packaging host agent binaries via pkg...${NC}"
# Create tauri sidecar bin directory if not exists
mkdir -p "apps/desktop-ui/src-tauri/bin"

echo -e "Compiling macOS sidecar binaries (Apple Silicon & Intel)..."
npm run pkg:macos -w apps/host-agent

# Copy ARM64 sidecar
if [ -f "apps/host-agent/bin/host-agent-aarch64-apple-darwin" ]; then
    cp "apps/host-agent/bin/host-agent-aarch64-apple-darwin" "apps/desktop-ui/src-tauri/bin/host-agent-aarch64-apple-darwin"
    chmod +x "apps/desktop-ui/src-tauri/bin/host-agent-aarch64-apple-darwin"
    echo -e "${GREEN}✓ Apple Silicon sidecar copied: apps/desktop-ui/src-tauri/bin/host-agent-aarch64-apple-darwin${NC}"
else
    echo -e "${RED}✗ Error: host-agent-aarch64-apple-darwin not found!${NC}"
    exit 1
fi

# Copy x64 sidecar
if [ -f "apps/host-agent/bin/host-agent-x86_64-apple-darwin" ]; then
    cp "apps/host-agent/bin/host-agent-x86_64-apple-darwin" "apps/desktop-ui/src-tauri/bin/host-agent-x86_64-apple-darwin"
    chmod +x "apps/desktop-ui/src-tauri/bin/host-agent-x86_64-apple-darwin"
    echo -e "${GREEN}✓ Intel macOS sidecar copied: apps/desktop-ui/src-tauri/bin/host-agent-x86_64-apple-darwin${NC}"
else
    echo -e "${RED}✗ Error: host-agent-x86_64-apple-darwin not found!${NC}"
    exit 1
fi
echo ""

# Step 6: Compiling Tauri Application
echo -e "${CYAN}[6/6] Building Tauri Desktop Application...${NC}"

# Check available Rust targets
NATIVE_TARGET=$(rustc -vV | grep "host:" | awk '{print $2}')
echo -e "Native target detected: ${YELLOW}$NATIVE_TARGET${NC}"

# Check if rustup is available to install missing targets
HAS_RUSTUP=false
if command -v rustup &> /dev/null; then
    HAS_RUSTUP=true
fi

# Determine if we can build a universal binary or must build a native binary
CAN_BUILD_UNIVERSAL=false
if $HAS_RUSTUP; then
    # Check if both target triples are installed
    INSTALLED_TARGETS=$(rustup target list --installed)
    if echo "$INSTALLED_TARGETS" | grep -q "aarch64-apple-darwin" && echo "$INSTALLED_TARGETS" | grep -q "x86_64-apple-darwin"; then
        CAN_BUILD_UNIVERSAL=true
    fi
fi

if [ "$CAN_BUILD_UNIVERSAL" = true ]; then
    echo -e "${GREEN}Both aarch64-apple-darwin and x86_64-apple-darwin targets are available!${NC}"
    echo -e "Starting universal-apple-darwin compilation (creates a fat binary for both Apple Silicon and Intel)..."
    npm run tauri:build -w apps/desktop-ui -- --target universal-apple-darwin
else
    echo -e "${YELLOW}Warning: Cross-compilation targets are missing or rustup is not in use.${NC}"
    echo -e "Compiling a native macOS package (${YELLOW}$NATIVE_TARGET${NC}) instead..."
    echo -e "To compile a universal macOS package for both Intel and Apple Silicon later, run:"
    echo -e "  1. Install rustup: ${BLUE}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${NC}"
    echo -e "  2. Add the targets: ${BLUE}rustup target add aarch64-apple-darwin x86_64-apple-darwin${NC}"
    echo -e "  3. Re-run this build script."
    echo ""
    
    # Run build for the native target
    npm run tauri:build -w apps/desktop-ui
fi

echo -e "\n${GREEN}=========================================================${NC}"
echo -e "${GREEN} 🎉 Build Complete!${NC}"
echo -e "${GREEN}=========================================================${NC}"
echo -e "Bundles generated under: apps/desktop-ui/src-tauri/target/release/bundle/"
echo ""
