#!/bin/bash

echo "========================================================="
echo " 🎮 MC Hosting - Automated Monorepo Setup Wizard (Unix/macOS)"
echo "========================================================="
echo ""

# Step 1: Check Node.js installation
echo "[1/3] Checking Node.js environment..."
if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is NOT installed!"
    echo "Please download and install Node.js (v18 or higher) from:"
    echo "https://nodejs.org/"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v)
echo "[OK] Found Node.js version: $NODE_VERSION"
echo ""

# Step 2: Install workspace dependencies
echo "[2/3] Installing monorepo dependencies (npm install)..."
echo "This may take a moment. Please wait..."
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Installation failed! Please check your internet connection."
    exit 1
fi
echo "[OK] Monorepo dependencies successfully installed."
echo ""

# Step 3: Copy Environment Configurations
echo "[3/3] Setting up local environment configurations (.env)..."

# backend-api env
if [ ! -f "apps/backend-api/.env" ]; then
    echo "[OK] copying apps/backend-api/.env.example to .env"
    cp "apps/backend-api/.env.example" "apps/backend-api/.env"
else
    echo "[INFO] apps/backend-api/.env already exists, skipping."
fi

# desktop-ui env
if [ ! -f "apps/desktop-ui/.env" ]; then
    echo "[OK] copying apps/desktop-ui/.env.example to .env"
    cp "apps/desktop-ui/.env.example" "apps/desktop-ui/.env"
else
    echo "[INFO] apps/desktop-ui/.env already exists, skipping."
fi

# host-agent env
if [ ! -f "apps/host-agent/.env" ]; then
    echo "[OK] copying apps/host-agent/.env.example to .env"
    cp "apps/host-agent/.env.example" "apps/host-agent/.env"
else
    echo "[INFO] apps/host-agent/.env already exists, skipping."
fi

echo ""
echo "========================================================="
echo " 🎉 Setup Completed Successfully!"
echo "========================================================="
echo ""
echo "You are now ready to run the MC Hosting development suite."
echo ""
echo "Simply run:"
echo "   ==> ./start.sh"
echo "or run:"
echo "   ==> npm run dev"
echo ""
chmod +x start.sh 2>/dev/null || true
