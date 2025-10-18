#!/bin/bash

# Background startup script for Skrift
# Starts both backend and frontend in background and returns control to terminal

set -e  # Exit on error

echo "========================================="
echo "Skrift - Background Startup"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Function to check if backend is running (safe curl: fail-fast, short timeouts)
is_backend_running() {
    curl -fsS --connect-timeout 2 --max-time 5 http://localhost:8000/health > /dev/null 2>&1
}

# Start backend if not running
if is_backend_running; then
    echo -e "${YELLOW}Backend is already running${NC}"
else
    echo -e "${GREEN}Starting backend in background...${NC}"
    cd backend
    ./start_backend.sh start
    cd ..
    
    # Wait for backend to be ready
    echo "Waiting for backend to be ready..."
    for i in {1..30}; do
        if is_backend_running; then
            echo -e "${GREEN}✓ Backend is ready!${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}✗ Backend failed to start${NC}"
            echo "Check logs: tail -f backend/backend.log"
            exit 1
        fi
        sleep 1
        echo -n "."
    done
    echo ""
fi

# Start frontend
echo -e "${GREEN}Starting frontend in background...${NC}"
cd frontend

# Determine if a rebuild is needed by comparing source mtimes to dist
needs_rebuild() {
    # If dist missing, rebuild
    if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
        return 0
    fi

    # Newest mtime among source files (exclude dist)
    # macOS stat: -f %m returns epoch seconds
    local SRC_MTIME
    SRC_MTIME=$(find . \
        -path "./dist" -prune -o \
        -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.css" -o -name "*.scss" -o -name "*.json" -o -name "*.html" -o -name "*.md" \) \
        -print0 | xargs -0 stat -f "%m" 2>/dev/null | sort -nr | head -n1)
    if [ -z "$SRC_MTIME" ]; then
        # If we can't determine, be safe and rebuild
        return 0
    fi

    # mtime of the built entry file
    local DIST_MTIME
    DIST_MTIME=$(stat -f "%m" dist/index.html 2>/dev/null || echo 0)

    [ "$SRC_MTIME" -gt "$DIST_MTIME" ]
}

if needs_rebuild; then
    echo "Renderer is outdated or missing. Building frontend renderer..."
    # Only (re)install deps if node_modules is missing
    if [ ! -d "node_modules" ]; then
        npm install --silent
    fi
    # Build only the renderer (fast), not the full electron bundle
    npm run build-renderer
else
    echo "Renderer is up-to-date. Skipping rebuild."
fi

./start_frontend.sh start
cd ..

echo ""
echo "========================================="
echo -e "${GREEN}Skrift is running in background!${NC}"
echo "========================================="
echo ""
echo "🌐 Backend:  http://localhost:8000"
echo "🖥️  Frontend: Electron app starting..."
echo ""
echo "📋 Useful commands:"
echo "   Check status:    ./status.sh"
echo "   View logs:       tail -f backend/backend.log"
echo "                    tail -f frontend/frontend.log"
echo "   Stop all:        ./stop-all.sh"
echo ""
echo -e "${GREEN}✓ Terminal is ready for use!${NC}"
