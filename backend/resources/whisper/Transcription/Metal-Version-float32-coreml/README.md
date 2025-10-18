# Metal-Accelerated Audio Transcription Pipeline

A **self-contained**, high-quality audio transcription system using Whisper with Metal acceleration for Apple Silicon Macs.

## ✨ Features

- **Metal GPU Acceleration** - Leverages Apple Silicon (M1/M2/M3/M4) for fast processing
- **High-Quality Audio Processing** - Two-pass loudness normalization and noise reduction
- **Self-Contained** - No virtual environments, minimal dependencies
- **Portable** - Move anywhere and it works (with ffmpeg installed)
- **Production Ready** - Handles various audio formats with professional-grade preprocessing

## 🚀 Quick Start

### Prerequisites
- macOS with Apple Silicon (M1/M2/M3/M4)
- ffmpeg installed: `brew install ffmpeg`

### Usage
```bash
./transcribe.sh path/to/your/audio/file.m4a
```

### Example
```bash
./transcribe.sh ~/Downloads/meeting_recording.m4a
```

Output will be saved to `./output/meeting_recording.txt`

## 📋 What It Does

### Step 1: Audio Preprocessing
1. **Pass 1**: Analyzes audio loudness characteristics
   - Measures input loudness, range, and peak levels
   - Calculates optimal normalization parameters

2. **Pass 2**: Applies enhancement filters
   - Loudness normalization (targeting -16 LUFS for optimal speech recognition)
   - RNNoise-based noise reduction
   - Converts to 16kHz mono WAV (Whisper's preferred format)

### Step 2: AI Transcription
- Uses Whisper Large v3 model for highest accuracy
- Automatic language detection
- Metal GPU acceleration for fast processing
- Outputs timestamped text file

## 📁 Directory Structure

```
Metal-Version/
├── transcribe.sh                                    # Main script
├── whisper.cpp/
│   ├── build/
│   │   ├── bin/
│   │   │   ├── whisper-cli                         # Metal-enabled executable
│   │   │   └── ggml-metal.metal                    # Metal compute shaders
│   │   ├── ggml/src/                               # Core ML libraries
│   │   └── src/                                    # Whisper libraries
│   └── models/
│       └── ggml-large-v3.bin                       # Whisper Large v3 model (2.9GB)
├── rnnoise-models/
│   └── somnolent-hogwash-2018-09-01/
│       └── sh.rnnn                                 # Noise reduction model
├── output/                                         # Transcription results
└── README.md                                       # This file
```

## ⚡ Performance

- **Processing Speed**: ~15-20 seconds for 1 minute of audio
- **Model Size**: Large v3 (highest accuracy)
- **Memory Usage**: ~3GB GPU memory
- **Supported Formats**: MP3, M4A, WAV, MP4, and more (via ffmpeg)

## 🔧 Configuration

Edit `transcribe.sh` to customize:

```bash
THREAD_COUNT=6                    # CPU threads for processing
MODEL_PATH="./whisper.cpp/models/ggml-large-v3.bin"  # Model file
RNNOISE_MODEL_PATH="./rnnoise-models/somnolent-hogwash-2018-09-01/sh.rnnn"  # Noise reduction
```

## 📦 Self-Contained Design

This pipeline is **completely self-contained**:

✅ **No virtual environments** - No Python dependencies or version conflicts  
✅ **All libraries included** - Dynamic libraries (.dylib) bundled  
✅ **Portable** - Copy folder anywhere and it works  
✅ **No compilation** - Pre-built binaries ready to use  
✅ **Relative paths** - Script uses `./` paths, works from any location  

**Only external dependency**: `ffmpeg` (for audio preprocessing)

## 🎯 Use Cases

- **Meeting Transcription** - Convert recordings to searchable text
- **Content Creation** - Transcribe videos, podcasts, interviews
- **Research** - Process audio data for analysis
- **Accessibility** - Generate captions and transcripts
- **Note Taking** - Convert voice memos to text

## 🔍 Example Output

**Input**: `meeting.m4a` (1 minute 13 seconds)

**Processing Log**:
```
[INFO] Starting audio pre-processing pipeline...
[INFO] Pass 1/2: Analyzing audio loudness characteristics...
[INFO] Pass 2/2: Applying normalization, noise reduction, and converting to 16kHz mono WAV...
[INFO] Audio pre-processing complete. Processed file: './output/meeting_processed.wav'
[INFO] Starting transcription with whisper-cli...

whisper_init_with_params_no_state: use gpu = 1
whisper_backend_init_gpu: using Metal backend
ggml_metal_init: found device: Apple M4

[INFO] Transcription complete!
[INFO] Output file saved: './output/meeting.txt'
```

**Output File** (`./output/meeting.txt`):
```
[00:00:00.000 --> 00:00:13.440]   There's a balance between freedom and structure. I suppose it's chaos and order.
[00:00:13.440 --> 00:00:22.320]   Holy fuck, it's the same shit that people are striving towards. Everyone is.
[00:00:22.320 --> 00:00:27.880]   It's really hard to keep the balance, hard to keep the nuance. But if you make it fun,
```

## 🛠 Troubleshooting

### "ffmpeg: command not found"
```bash
brew install ffmpeg
```

### "Metal backend not found"
- Ensure you're on Apple Silicon Mac (M1/M2/M3/M4)
- Intel Macs will fall back to CPU processing (slower)

### "Model file not found"
- Ensure you're running the script from the Metal-Version directory
- Check that `./whisper.cpp/models/ggml-large-v3.bin` exists

### Permission denied
```bash
chmod +x transcribe.sh
```

## 📊 Comparison vs Other Setups

| Feature | This Pipeline | Typical Setup |
|---------|---------------|---------------|
| **Portability** | ✅ Self-contained | ❌ Virtual envs, dependencies |
| **Setup Time** | ✅ Instant | ❌ Hours of installation |
| **Metal Acceleration** | ✅ Built-in | ❌ Often requires manual setup |
| **Audio Quality** | ✅ Professional preprocessing | ❌ Basic conversion |
| **Size** | ❌ 2.9GB | ✅ Smaller |
| **Updates** | ❌ Manual | ✅ Package managers |

## 🔄 Updates

### Option 1: Automatic Updates (Recommended)
Use the built-in update system:
```bash
cd updates
./update.sh
```

This will:
- ✅ Backup your current setup
- ✅ Download latest whisper.cpp with Metal acceleration
- ✅ Optionally update models
- ✅ Test everything works

See `updates/README.md` for full details.

### Option 2: Manual Updates
To manually update components:
1. Replace files in respective directories
2. Update paths in `transcribe.sh` if needed
3. Test with a sample audio file

## 📝 License

This pipeline combines multiple open-source projects:
- **Whisper.cpp**: MIT License
- **RNNoise**: BSD License  
- **FFmpeg**: LGPL/GPL

---

**Total Size**: 2.9GB  
**Created**: July 2025  
**Optimized for**: Apple Silicon Macs with Metal acceleration
