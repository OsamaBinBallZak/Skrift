#!/bin/bash

# Frontend startup script with proper process management
# Prevents multiple instances and handles cleanup

FRONTEND_DIR="/Users/tiurihartog/Hackerman/THE APP V2.0/frontend"
PID_FILE="$FRONTEND_DIR/frontend.pid"
LOG_FILE="$FRONTEND_DIR/frontend.log"

cd "$FRONTEND_DIR"

# Function to check if process is running
is_running() {
    [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

# Function to stop existing frontend
stop_frontend() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping existing frontend (PID: $pid)"
            kill "$pid"
            # Wait up to 10 seconds for graceful shutdown
            for i in {1..10}; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    break
                fi
                sleep 1
            done
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo "Force killing frontend"
                kill -9 "$pid"
            fi
        fi
        rm -f "$PID_FILE"
    fi
    # Also kill any npm/electron processes
    pkill -f "npm start" 2>/dev/null || true
    pkill -f "electron" 2>/dev/null || true
}

# Function to start frontend
start_frontend() {
    echo "Starting frontend..."
    # Start Electron directly so we capture the real Electron PID
    if [ -x "./node_modules/.bin/electron" ]; then
        nohup ./node_modules/.bin/electron . > "$LOG_FILE" 2>&1 &
    else
        # Fallback to npm start if electron binary not found
        nohup npm start > "$LOG_FILE" 2>&1 &
    fi
    local pid=$!
    echo "$pid" > "$PID_FILE"
    # Try to resolve to the actual Electron PID (parent may exit quickly)
    sleep 1
    # Prefer the main Electron binary process
    ELECTRON_PID=$(pgrep -f "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ." | head -n1)
    if [ -z "$ELECTRON_PID" ]; then
        ELECTRON_PID=$(pgrep -f "[e]lectron .*THE APP V2.0/frontend" | head -n1)
    fi
    if [ -n "$ELECTRON_PID" ]; then
        echo "$ELECTRON_PID" > "$PID_FILE"
        echo "Resolved Electron PID: $ELECTRON_PID"
    fi
    echo "Frontend started with PID: $(cat "$PID_FILE")"
    echo "Logs: tail -f $LOG_FILE"
}

# Main logic
case "${1:-start}" in
    start)
        if is_running; then
            echo "Frontend is already running (PID: $(cat "$PID_FILE"))"
            exit 1
        fi
        stop_frontend  # Clean up any orphaned processes
        start_frontend
        ;;
    stop)
        stop_frontend
        echo "Frontend stopped"
        ;;
    restart)
        stop_frontend
        sleep 2
        start_frontend
        ;;
    status)
        if is_running; then
            echo "Frontend is running (PID: $(cat "$PID_FILE"))"
        else
            echo "Frontend is not running"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
