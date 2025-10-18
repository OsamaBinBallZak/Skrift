#!/bin/bash

# Backend startup script with proper process management
# Prevents multiple instances and handles cleanup

BACKEND_DIR="/Users/tiurihartog/Hackerman/Skrift/backend"
PID_FILE="$BACKEND_DIR/backend.pid"
LOG_FILE="$BACKEND_DIR/backend.log"

cd "$BACKEND_DIR"

# Function to check if process is running
is_running() {
    [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

# Function to stop existing backend
stop_backend() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Stopping existing backend (PID: $pid)"
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
                echo "Force killing backend"
                kill -9 "$pid"
            fi
        fi
        rm -f "$PID_FILE"
    fi
    # Also kill any processes using port 8000
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
}

# Function to start backend
start_backend() {
    echo "Starting backend..."

    # Use external MLX venv at user-level to keep repo clean
    USER_MLX_VENV="/Users/tiurihartog/Hackerman/Skrift_dependencies/mlx-env"
    PYExec="$USER_MLX_VENV/bin/python"

    if [ ! -x "$PYExec" ]; then
        echo "Bootstrapping MLX venv at $USER_MLX_VENV ..."
        mkdir -p "$USER_MLX_VENV"
        python3 -m venv "$USER_MLX_VENV"
        "$PYExec" -m pip install --upgrade pip >/dev/null 2>&1 || true
        # Install backend requirements (includes FastAPI, etc.)
        "$PYExec" -m pip install -r "$BACKEND_DIR/requirements.txt" >/dev/null 2>&1 || true
        # Install mlx-lm for enhancement; ignore errors if offline
        "$PYExec" -m pip install --upgrade mlx-lm >/dev/null 2>&1 || true
    fi

    nohup "$PYExec" main.py > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"
    echo "Backend started with PID: $pid"
    echo "Logs: tail -f $LOG_FILE"
}

# Main logic
case "${1:-start}" in
    start)
        if is_running; then
            echo "Backend is already running (PID: $(cat "$PID_FILE"))"
            exit 1
        fi
        stop_backend  # Clean up any orphaned processes
        start_backend
        ;;
    stop)
        stop_backend
        echo "Backend stopped"
        ;;
    restart)
        stop_backend
        sleep 2
        start_backend
        ;;
    status)
        if is_running; then
            echo "Backend is running (PID: $(cat "$PID_FILE"))"
        else
            echo "Backend is not running"
        fi
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
