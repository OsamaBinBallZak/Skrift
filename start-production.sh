#!/bin/bash

# Production startup script for Skrift
# This script ensures the app is properly built and starts both backend and frontend

set -e  # Exit on error

echo "========================================="
echo "Skrift - Production Startup"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a process is running
is_running() {
    pgrep -f "$1" > /dev/null
}

# Function to wait for a service to be ready
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW}Waiting for $name to be ready...${NC}"
    while ! curl -fsS --connect-timeout 2 --max-time 5 "$url" > /dev/null 2>&1; do
        if [ $attempt -ge $max_attempts ]; then
            echo -e "${RED}$name failed to start after $max_attempts attempts${NC}"
            return 1
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done
    echo -e "\n${GREEN}$name is ready!${NC}"
    return 0
}

# Check if backend is already running
if is_running "uvicorn.*app:app"; then
    echo -e "${YELLOW}Backend is already running${NC}"
else
    echo -e "${GREEN}Starting backend...${NC}"
    cd backend
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        echo "Creating Python virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment and install dependencies
    source venv/bin/activate
    echo "Installing backend dependencies..."
    pip install -q -r requirements.txt
    
    # Start backend in background
    echo "Starting backend server..."
    nohup uvicorn app:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
    
    # Wait for backend to be ready
    if wait_for_service "http://localhost:8000/health" "Backend"; then
        echo -e "${GREEN}Backend started successfully${NC}"
    else
        echo -e "${RED}Failed to start backend${NC}"
        exit 1
    fi
    
    cd ..
fi

# Check if frontend needs to be built
echo -e "${GREEN}Checking frontend build...${NC}"
cd frontend

if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "Frontend build not found. Building..."
    npm install
    npm run build
else
    echo "Frontend build exists. Checking if it's up to date..."
    # Check if any source files are newer than the build
    if find src -type f -newer dist/index.html | grep -q .; then
        echo "Source files have changed. Rebuilding..."
        npm run build
    else
        echo "Build is up to date."
    fi
fi

# Start the frontend
echo -e "${GREEN}Starting frontend...${NC}"
npm start &

cd ..

echo ""
echo "========================================="
echo -e "${GREEN}Skrift is running!${NC}"
echo "========================================="
echo "Backend: http://localhost:8000"
echo "Frontend: Starting Electron app..."
echo ""
echo "Logs:"
echo "  Backend: ./backend.log"
echo "  Frontend: Check console output"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Keep the script running and handle cleanup
trap 'echo -e "\n${YELLOW}Shutting down services...${NC}"; pkill -f "uvicorn.*app:app"; pkill -f "electron"; exit' INT TERM

# Wait indefinitely
while true; do
    sleep 1
done
