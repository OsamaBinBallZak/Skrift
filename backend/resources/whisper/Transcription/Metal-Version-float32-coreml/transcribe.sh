#!/bin/bash
#
# ==============================================================================
# Metal + CoreML Float32 Precision Transcription Wrapper Script
# ==============================================================================
#
# This script provides a simple interface to the Metal + CoreML accelerated Whisper pipeline.
# It performs two key steps:
# 1. Pre-processes the input audio file using ffmpeg for optimal quality.
# 2. Runs the transcription using Float32 CoreML (Apple Neural Engine) + Metal GPU acceleration.
#
# Usage:
# ./transcribe.sh <path_to_your_audio_file>
#
# Example:
# ./transcribe.sh my_meeting.m4a
#
# ==============================================================================

set -e
set -o pipefail

# --- Configuration ---
WHISPER_CLI_PATH="./whisper.cpp/build/bin/whisper-cli"
MODEL_PATH="./whisper.cpp/models/ggml-large-v3.bin"
VAD_MODEL_PATH="./whisper.cpp/models/ggml-silero-v5.1.2.bin"
RNNOISE_MODEL_PATH="./rnnoise-models/somnolent-hogwash-2018-09-01/sh.rnnn" # A good general-purpose model
THREAD_COUNT=6

# --- Script Logic ---
log_info_t() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

if [ -z "$1" ]; then
    echo -e "\033[1;31m[ERROR]\033[0m Usage: $0 <path_to_audio_file> [output_directory]"
    echo "Example: $0 my_meeting.m4a /path/to/output"
    exit 1
fi

INPUT_FILE="$1"
FILENAME=$(basename "$INPUT_FILE")
FILENAME_NO_EXT="${FILENAME%.*}"

# Use custom output directory if provided, otherwise use default
if [ -n "$2" ]; then
    OUTPUT_DIR="$2"
else
    OUTPUT_DIR="./output"
fi

PROCESSED_WAV_FILE="${OUTPUT_DIR}/${FILENAME_NO_EXT}_processed.wav"

# Create output directory
mkdir -p "$OUTPUT_DIR"

if [ ! -f "$INPUT_FILE" ]; then
    echo -e "\033[1;31m[ERROR]\033[0m Input file '$INPUT_FILE' does not exist."
    exit 1
fi

# --- Step 1: Audio Pre-processing with ffmpeg ---
log_info_t "Starting audio pre-processing pipeline..."

# Pass 1: Analyze loudness for normalization
log_info_t "Pass 1/2: Analyzing audio loudness characteristics..."
# Add -hide_banner to reduce noise and -nostdin to prevent any TTY prompts that could block in detached mode
LOUDSTATS=$(ffmpeg -hide_banner -nostdin -i "$INPUT_FILE" -af loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json -f null - 2>&1 | grep -A 20 '"input_i"')
measured_i=$(echo "$LOUDSTATS" | grep '"input_i"' | sed 's/.*"input_i" : "\([^"]*\)".*/\1/')
measured_lra=$(echo "$LOUDSTATS" | grep '"input_lra"' | sed 's/.*"input_lra" : "\([^"]*\)".*/\1/')
measured_tp=$(echo "$LOUDSTATS" | grep '"input_tp"' | sed 's/.*"input_tp" : "\([^"]*\)".*/\1/')
measured_thresh=$(echo "$LOUDSTATS" | grep '"input_thresh"' | sed 's/.*"input_thresh" : "\([^"]*\)".*/\1/')
offset=$(echo "$LOUDSTATS" | grep '"target_offset"' | sed 's/.*"target_offset" : "\([^"]*\)".*/\1/')

# Pass 2: Apply filters and convert to required format.
log_info_t "Pass 2/2: Applying normalization, noise reduction, and converting to 16kHz mono WAV..."
ffmpeg -hide_banner -nostdin -i "$INPUT_FILE" -hide_banner -y -af \
"loudnorm=I=-16:LRA=11:TP=-1.5:measured_I=$measured_i:measured_LRA=$measured_lra:measured_tp=$measured_tp:measured_thresh=$measured_thresh:offset=$offset,arnndn=m=$RNNOISE_MODEL_PATH" \
-ar 16000 -ac 1 -c:a pcm_s16le "$PROCESSED_WAV_FILE"

log_info_t "Audio pre-processing complete. Processed file: '$PROCESSED_WAV_FILE'"

# --- Step 2: Run Transcription with whisper-cli ---
log_info_t "Starting transcription with whisper-cli..."

# Ensure dynamic libraries from the local build are found by the loader (fixes @rpath libwhisper*.dylib)
export DYLD_LIBRARY_PATH="$(pwd)/whisper.cpp/build/src:$(pwd)/whisper.cpp/build/ggml/src:$(pwd)/whisper.cpp/build/ggml/src/ggml-metal:$(pwd)/whisper.cpp/build/ggml/src/ggml-blas:${DYLD_LIBRARY_PATH}"

# Optional flags
# Enable word timestamps output for debugging only when ENABLE_WTS=1
WTS_FLAG=()
if [ "${ENABLE_WTS:-0}" = "1" ]; then
  WTS_FLAG=(-owts)
fi

# SRT is for human export; keep it but do not use it for editor highlighting
SRT_FLAG=(-osrt)

# Conditional DTW: gate behind env toggle or model presence to avoid stalls
DTW_FLAG=()
DTW_MODEL_DIR="./whisper.cpp/models/dtw/large.v3"
DTW_MODEL_FILE="./whisper.cpp/models/large.v3.dtw"
if [ "${WHISPER_DTW:-0}" = "1" ]; then
  DTW_FLAG=(--dtw large.v3)
elif [ -d "$DTW_MODEL_DIR" ] || [ -f "$DTW_MODEL_FILE" ]; then
  DTW_FLAG=(--dtw large.v3)
else
  echo "[WARN] DTW model not found; skipping --dtw large.v3"
fi

"$WHISPER_CLI_PATH" \
    -m "$MODEL_PATH" \
    -f "$PROCESSED_WAV_FILE" \
    -t "$THREAD_COUNT" \
    -l auto \
    --output-txt -ojf --split-on-word "${SRT_FLAG[@]}" "${WTS_FLAG[@]}" "${DTW_FLAG[@]}" \
    -of "${OUTPUT_DIR}/${FILENAME_NO_EXT}" \
    --print-progress \
    --temperature 0.1 \
    --best-of 5 \
    --beam-size 5 \
    --entropy-thold 2.40 \
    --logprob-thold -1.00 \
    --no-speech-thold 0.60 \
    --word-thold 0.01 \
    --prompt "Transcribe with proper punctuation and capitalization."

# If JSON was produced, and a .wts exists, we can remove it to avoid duplication (unless explicitly kept)
JSON_OUT="${OUTPUT_DIR}/${FILENAME_NO_EXT}.json"
WTS_OUT="${OUTPUT_DIR}/${FILENAME_NO_EXT}.wts"
if [ -f "$JSON_OUT" ] && [ -f "$WTS_OUT" ] && [ "${ENABLE_WTS:-0}" != "1" ]; then
  rm -f "$WTS_OUT" || true
fi

echo ""
log_info_t "\033[1;32mTranscription complete!\033[0m"
log_info_t "Output file saved: '${OUTPUT_DIR}/${FILENAME_NO_EXT}.txt'"

# Clean up processed WAV file (optional)
# rm "$PROCESSED_WAV_FILE"
