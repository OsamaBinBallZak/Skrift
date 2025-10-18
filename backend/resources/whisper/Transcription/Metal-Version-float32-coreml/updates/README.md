# Updates Folder

This folder provides optional update capabilities for the self-contained Metal-Version pipeline.

## 🎯 Purpose

The main pipeline is **self-contained and works perfectly as-is**. This updates folder is for:

- Updating to newer versions of whisper.cpp
- Getting latest Whisper model improvements
- Customizing the build configuration
- Development and experimentation

## 🚀 Quick Update

### Prerequisites
```bash
# Install build tools
brew install cmake git

# Optional: Python environment for development
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
```

### Update the Pipeline
```bash
cd updates
./update.sh
```

The script will:
1. ✅ Backup your current setup
2. ✅ Download latest whisper.cpp
3. ✅ Build with Metal acceleration
4. ✅ Optionally update the model
5. ✅ Test the new version

## 📁 Files

| File | Purpose |
|------|---------|
| `update.sh` | Main update script |
| `requirements-dev.txt` | Python dependencies for development |
| `README.md` | This file |
| `backup-YYYYMMDD-HHMMSS/` | Automatic backups |
| `update-history.log` | Update log |

## 🛠 What Gets Updated

### Automatic Updates
- ✅ **whisper.cpp** - Latest source code with bug fixes
- ✅ **Metal acceleration** - Latest GPU optimizations
- ✅ **Build system** - Optimized compilation flags

### Optional Updates (you choose)
- 🔄 **Whisper models** - Latest trained models (large download)
- 🔄 **RNNoise models** - Updated noise reduction
- 🔄 **Configuration** - Custom build options

## ⚠️ Safety Features

### Automatic Backups
- Every update creates a timestamped backup
- Located in `updates/backup-YYYYMMDD-HHMMSS/`
- Rollback instructions provided if issues occur

### Testing
- Builds are tested before replacement
- Metal acceleration verified
- Quick transcription test run

### Non-Destructive
- Your existing models are preserved by default
- Main `transcribe.sh` script unchanged
- Output folder untouched

## 🔄 Update Process Details

```bash
# 1. The script checks prerequisites
git --version
cmake --version

# 2. Creates backup
cp -r ../whisper.cpp updates/backup-20250703-194459/

# 3. Downloads latest source
git clone https://github.com/ggerganov/whisper.cpp.git

# 4. Builds with Metal
cmake -DWHISPER_METAL=ON -DCMAKE_BUILD_TYPE=Release
make -j8

# 5. Tests Metal support
./whisper-cli --help | grep gpu

# 6. Replaces old version
mv whisper.cpp-new ../whisper.cpp

# 7. Tests pipeline
./transcribe.sh test_file.wav
```

## 🐛 Troubleshooting

### "cmake not found"
```bash
brew install cmake
```

### "Build failed"
- Check Xcode command line tools: `xcode-select --install`
- Verify Apple Silicon Mac (required for Metal)
- Check available disk space (need ~2GB for build)

### "Metal not working after update"
- Verify on Apple Silicon Mac
- Check Metal support: `system_profiler SPDisplaysDataType | grep Metal`
- Try rebuilding: `rm -rf whisper.cpp && ./update.sh`

### "Performance worse after update"
- Check if Metal is enabled in logs: `use gpu = 1`
- Compare model versions (newer isn't always faster)
- Restore backup if needed

## 📊 When to Update

### ✅ Good Reasons to Update
- Security vulnerabilities reported
- Significant performance improvements
- New audio format support needed
- Bug affecting your use case

### ❌ Reasons NOT to Update
- Current version works perfectly
- Critical deadline approaching
- Limited time for testing
- No specific benefits needed

## 🔙 Rollback

If something goes wrong:

```bash
# Find your backup
ls updates/backup-*/

# Restore previous version
rm -rf whisper.cpp
cp -r updates/backup-20250703-194459/whisper.cpp .

# Test restored version
./transcribe.sh your_test_file.m4a
```

## 🔮 Future Enhancements

Planned updates folder improvements:
- Automatic model size optimization
- Custom model downloads (base, small, medium)
- RNNoise model updates
- Performance benchmarking
- Update notifications

## 💡 Development Mode

For active development:

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install development tools
pip install -r requirements-dev.txt

# Make changes to whisper.cpp source
cd updates/whisper.cpp-temp
# ... edit source files ...

# Rebuild and test
cmake --build build
./build/bin/whisper-cli test.wav
```

---

**Remember**: The main pipeline is designed to work without updates. Only use this folder when you specifically need newer versions or want to contribute to development.
