# Batch Transcription with Persistent Whisper Model

## Overview

Batch transcription now uses a **persistent whisper-server** that keeps the 2.9 GB Whisper model loaded in memory for the entire batch, eliminating redundant model reloads between files.

## Architecture Changes

### Before (Single-File Approach)
```
For each file:
  1. Spawn whisper-cli process
  2. Load model from disk (~2-3 seconds)
  3. Transcribe audio
  4. Exit process (model unloaded)
  
20 files = 20 model loads = 40-60 seconds wasted
```

### After (Batch Server Approach)
```
Batch start:
  1. Start whisper-server once
  2. Load model ONCE (~2-3 seconds)
  
For each file:
  3. Preprocess audio with ffmpeg
  4. Send to server via HTTP POST
  5. Server transcribes (model already in memory)
  6. Return transcript

Batch end:
  7. Stop whisper-server (model unloaded)

20 files = 1 model load = ~2-3 seconds total
Savings: ~40-60 seconds for 20 files
```

## Implementation Details

### New Components

**BatchManager additions** (`backend/services/batch_manager.py`):
- `_start_whisper_server()` - Starts persistent server on port 8090
- `_stop_whisper_server()` - Gracefully stops server and cleans up
- `_wait_for_server_ready()` - Polls server health endpoint until ready
- `_preprocess_audio()` - Runs ffmpeg loudness normalization + noise reduction
- `_transcribe_via_server()` - Sends preprocessed audio to server via HTTP

### Server Configuration

The whisper-server is launched with optimized settings:
```bash
whisper-server \
  -m ggml-large-v3.bin \
  --host 127.0.0.1 \
  --port 8090 \
  -t 6 \                        # 6 threads
  -l auto \                     # Auto language detection
  --convert \                   # Enable ffmpeg conversion
  --entropy-thold 2.40 \
  --logprob-thold -1.00 \
  --no-speech-thold 0.60 \
  --word-thold 0.01 \
  --best-of 5 \
  --beam-size 5 \
  --vad \                       # Voice Activity Detection
  --vad-model ggml-silero-v5.1.2.bin
```

### API Endpoint

**POST http://127.0.0.1:8090/inference**

Request (multipart/form-data):
```
file: <audio_data> (audio/wav)
temperature: 0.1
response-format: json
```

Response (JSON):
```json
{
  "text": "Full transcription text...",
  "segments": [...],
  "tokens": [...]
}
```

### Audio Preprocessing

Each file is preprocessed before sending to server (same pipeline as `transcribe.sh`):

1. **Pass 1**: Analyze loudness with ffmpeg
   ```bash
   ffmpeg -i input.m4a -af loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json -f null -
   ```

2. **Pass 2**: Apply normalization + noise reduction
   ```bash
   ffmpeg -i input.m4a \
     -af "loudnorm=...,arnndn=m=rnnoise.rnnn" \
     -ar 16000 -ac 1 -c:a pcm_s16le \
     processed.wav
   ```

3. **Send** processed.wav to server

### Lifecycle

**Batch Start:**
```python
await batch_manager.start_transcribe_batch(file_ids, file_service, None)
  → _start_whisper_server()  # Launches server, loads model
  → _wait_for_server_ready() # Waits for HTTP 200/404
  → _process_batch()         # Processes files sequentially
```

**Per File:**
```python
for file in batch:
  → _transcribe_via_server(file_id, file_service)
    → _preprocess_audio()       # ffmpeg normalization
    → POST /inference           # Send to server
    → Save transcript + metadata
    → Update file status
```

**Batch End:**
```python
finally:
  → _stop_whisper_server()  # Graceful shutdown, cleanup
```

### Error Handling

- **Server startup failure**: Automatically cleans up and raises error
- **Transcription timeout**: 10 minute timeout per file
- **Server connection error**: Fails gracefully, continues to next file
- **3 consecutive failures**: Stops entire batch (same as before)
- **Batch cancellation**: Stops server immediately

### Memory Management

**During batch:**
- Whisper model: ~2.9 GB (persistent)
- CoreML encoder: Additional memory on Neural Engine
- Server process: ~3-4 GB total memory footprint
- Temp files: Cleaned up after each file

**After batch:**
- Server terminated
- Model unloaded from memory
- Temp directory removed (`/tmp/whisper_batch_<pid>`)

## Performance Improvements

### Time Savings

**Before (20 files):**
- Model load × 20 = 40-60 seconds
- Transcription × 20 = Variable (depends on audio length)
- **Total overhead**: 40-60 seconds

**After (20 files):**
- Model load × 1 = 2-3 seconds
- Transcription × 20 = Variable (same as before)
- **Total overhead**: 2-3 seconds

**Net improvement**: ~40-60 seconds saved for 20 files (~2-3 seconds per file)

### Memory Efficiency

- Model stays resident during batch (no repeated loads)
- Metal/CoreML resources stay warm
- Fewer syscalls and process spawns
- Better GPU memory management

## Testing

### Manual Test
```bash
cd /Users/tiurihartog/Hackerman/Skrift/backend
python3 test_batch_transcription.py
```

Test script:
1. Finds 2-3 untranscribed files
2. Starts batch transcription
3. Monitors progress
4. Reports timing and success/failure
5. Verifies cleanup

### Integration Test

Use the frontend "Batch Transcribe All" button:
1. Upload 5+ audio files
2. Click "Batch Transcribe All"
3. Monitor batch progress dropdown
4. Verify all files transcribed
5. Check logs for server start/stop messages

## Logs

Look for these log messages:

```
✅ Whisper server started successfully on port 8090
📤 Sending <file_id> to whisper server for transcription...
✅ File <file_id> transcribed successfully
✅ Batch <batch_id> completed
✅ Whisper server stopped
```

## Fallback Behavior

- **Single-file transcription**: Still uses `transcribe.sh` (no server)
- **Manual transcription**: Unaffected by batch changes
- **Conversation mode**: Not yet supported in batch (uses fallback)

## Future Improvements

### Potential Optimizations

1. **Keep server running between batches**
   - Start on first batch
   - Keep alive for 5 minutes after last batch
   - Reduces startup time for subsequent batches

2. **Streaming transcription**
   - Use WebSocket endpoint for real-time progress
   - Show partial transcripts as they arrive

3. **Parallel preprocessing**
   - Preprocess next file while current one transcribes
   - Overlapping I/O and compute

4. **Smart model selection**
   - Use smaller models (base, medium) for short files
   - Switch models without restarting server

### Known Limitations

- Server must be on localhost (no remote transcription)
- One batch at a time (server port conflict)
- No conversation mode support in batch yet
- Requires ffmpeg installed on system

## Troubleshooting

### Server won't start

**Check binary exists:**
```bash
ls -la backend/resources/whisper/Transcription/Metal-Version-float32-coreml/whisper.cpp/build/bin/whisper-server
```

**Check model exists:**
```bash
ls -lh backend/resources/whisper/Transcription/Metal-Version-float32-coreml/whisper.cpp/models/ggml-large-v3.bin
```

**Check port is available:**
```bash
lsof -i :8090
```

### Server hangs

**Check logs** in backend console for stderr output

**Kill manually:**
```bash
pkill -f whisper-server
```

### Transcriptions empty

**Check ffmpeg installed:**
```bash
which ffmpeg
```

**Check audio preprocessing logs** for ffmpeg errors

### Performance not improving

- Verify server stays running (check process list)
- Confirm model only loads once (check logs)
- Test with 5+ files to see cumulative savings

---

## Summary

The persistent whisper-server approach eliminates redundant model loading during batch transcription, saving **~2-3 seconds per file**. For typical batch sizes (10-20 files), this results in **20-60 seconds** of time savings while maintaining identical transcription quality.

The implementation is fully automatic—users simply click "Batch Transcribe All" and the optimization happens transparently.
