#!/bin/bash
#
# ==============================================================================
# Metal-Version Pipeline Update Script
# ==============================================================================
#
# This script updates the self-contained transcription pipeline by:
# 1. Downloading the latest whisper.cpp from GitHub
# 2. Building with Metal acceleration
# 3. Downloading the latest Whisper models
# 4. Updating RNNoise models if needed
#
# Usage:
# cd updates && ./update.sh
#
# ==============================================================================

set -e
set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the updates directory
if [[ ! -f "../transcribe.sh" ]]; then
    log_error "Please run this script from the updates/ directory"
    log_error "cd updates && ./update.sh"
    exit 1
fi

# Check prerequisites
if ! command -v git &> /dev/null; then
    log_error "git is required but not installed"
    exit 1
fi

if ! command -v cmake &> /dev/null; then
    log_error "cmake is required but not installed. Install with: brew install cmake"
    exit 1
fi

if ! command -v make &> /dev/null; then
    log_error "make is required but not installed"
    exit 1
fi

log_info "Starting Metal-Version pipeline update..."

# Create backup
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
log_info "Creating backup in updates/$BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"
cp -r ../whisper.cpp "$BACKUP_DIR/" 2>/dev/null || log_warning "No existing whisper.cpp to backup"

# Clean up any existing build
log_info "Cleaning up existing build..."
rm -rf whisper.cpp-temp

# Clone latest whisper.cpp
log_info "Downloading latest whisper.cpp..."
git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git whisper.cpp-temp
cd whisper.cpp-temp

# Configure with Metal support
log_info "Configuring build with Metal support..."
cmake -B build \
    -DWHISPER_METAL=ON \
    -DWHISPER_COREML=OFF \
    -DWHISPER_OPENVINO=OFF \
    -DCMAKE_BUILD_TYPE=Release

# Build
log_info "Building whisper.cpp with Metal acceleration..."
cmake --build build --config Release -j $(sysctl -n hw.ncpu)

# Test the build
log_info "Testing the build..."
if [[ ! -f "build/bin/whisper-cli" ]]; then
    log_error "Build failed - whisper-cli not found"
    exit 1
fi

# Test Metal support
log_info "Verifying Metal support..."
if ./build/bin/whisper-cli --help | grep -q "gpu"; then
    log_success "Metal support confirmed"
else
    log_warning "Metal support not detected, but build completed"
fi

# Replace the old version
log_info "Installing new version..."
cd ..
rm -rf ../whisper.cpp
mv whisper.cpp-temp ../whisper.cpp

# Download latest models if requested
echo ""
echo "Do you want to update the Whisper model? (y/N)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    log_info "Downloading latest Whisper Large v3 model..."
    cd ../whisper.cpp/models
    
    # Backup existing model
    if [[ -f "ggml-large-v3.bin" ]]; then
        mv ggml-large-v3.bin "ggml-large-v3.bin.backup-$(date +%Y%m%d-%H%M%S)"
    fi
    
    # Download new model
    bash download-ggml-model.sh large-v3
    log_success "Model updated successfully"
    cd ../../updates
else
    # Copy the existing model back
    if [[ -f "$BACKUP_DIR/whisper.cpp/models/ggml-large-v3.bin" ]]; then
        log_info "Restoring existing model..."
        cp "$BACKUP_DIR/whisper.cpp/models/ggml-large-v3.bin" ../whisper.cpp/models/
    fi
fi

# Test the updated pipeline
log_info "Testing updated pipeline..."
cd ..
if [[ -f "output/Everyone is looking for the balance between freedom and structure.txt" ]]; then
    TEST_FILE="output/Everyone is looking for the balance between freedom and structure_processed.wav"
    if [[ -f "$TEST_FILE" ]]; then
        log_info "Running quick test with existing processed audio..."
        ./whisper.cpp/build/bin/whisper-cli \
            -m "./whisper.cpp/models/ggml-large-v3.bin" \
            -f "$TEST_FILE" \
            -t 6 \
            -l auto \
            --output-txt -of "./updates/test-output" \
            > /dev/null 2>&1
        
        if [[ -f "updates/test-output.txt" ]]; then
            log_success "Pipeline test successful!"
            rm -f updates/test-output.txt
        else
            log_warning "Pipeline test failed, but binaries were built"
        fi
    fi
fi

cd updates

# Update version info
echo "$(date): Updated whisper.cpp to latest version" >> update-history.log

log_success "Update completed successfully!"
log_info "Backup saved in: updates/$BACKUP_DIR"
log_info "Update history: updates/update-history.log"

echo ""
echo "You can now use the updated pipeline with:"
echo "  cd .. && ./transcribe.sh your_audio_file.m4a"
