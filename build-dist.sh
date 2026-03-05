#!/bin/bash

# Build a fresh packaged Skrift.app (Electron + renderer)
# Usage: from repo root
#   ./build-dist.sh

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get script dir (repo root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/frontend"

echo "========================================="
echo "Skrift - Building packaged app (dist)"
echo "========================================="

# Optional: ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}node_modules missing – running npm install (this may take a while)...${NC}"
  npm install
fi

# Clean previous build artifacts
echo -e "${YELLOW}Cleaning previous build artifacts (dist/, renderer-dist/)${NC}"
rm -rf dist renderer-dist

# Build new renderer + Electron bundle
echo -e "${GREEN}Running npm run dist...${NC}"
npm run dist

RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✓ New Skrift build created in frontend/dist${NC}"
  echo "   - DMG / ZIP / .app are under: $SCRIPT_DIR/frontend/dist"
  echo ""
else
  echo ""
  echo -e "${RED}✗ Build failed (npm run dist)${NC}"
  exit $RESULT
fi
