# Skrift

**Audio transcription and enhancement pipeline with Metal acceleration**

Transform iPhone voice recordings into polished, searchable text using local AI—no cloud, fully private.

[![macOS](https://img.shields.io/badge/macOS-Apple%20Silicon-blue)](https://www.apple.com/mac/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## ✨ Features

- 🎙️ **Metal-Accelerated Transcription** – 2-3x realtime speed using Whisper.cpp on Apple Silicon
- 🤖 **Local AI Enhancement** – Polish transcripts with MLX models (Qwen, Llama, etc.) running entirely offline
- 📝 **Smart Name Linking** – Automatic Obsidian-style `[[wikilinks]]` with disambiguation for common names
- 🎯 **Word-Level Sync** – Click any word to jump to that moment in the audio
- 📦 **Batch Processing** – Queue multiple files and let the backend handle them sequentially
- 🔒 **100% Private** – All processing happens locally on your Mac

---

## 🚀 Quick Start

### Prerequisites
- macOS with Apple Silicon (M1/M2/M3/M4)
- Python 3.8+
- Node.js 18+

### Installation

```bash
# Clone the repository
git clone https://github.com/OsamaBinBallZak/Skrift.git
cd Skrift

# Setup dependencies (optional - will auto-install on first run)
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

# Download models separately (see below)
```

### Running Skrift

```bash
# Start everything (backend + frontend)
./start-background.sh

# Check status
./status.sh

# Stop all services
./stop-all.sh
```

The Electron app will launch automatically. Your transcripts are saved to:
```
~/Documents/Voice Transcription Pipeline Audio Output/
```

---

## 📦 Dependencies Setup

Skrift uses a separate `Skrift_dependencies/` folder for large model files (13GB) to keep the repo lightweight.

**After cloning, you need to populate the dependencies folder:**

```bash
# 1. Create the dependencies folder
mkdir -p ~/Hackerman/Skrift_dependencies

# 2. Download Whisper models
# Place in: ~/Hackerman/Skrift_dependencies/whisper/

# 3. Download MLX models (e.g., from Hugging Face)
# Place in: ~/Hackerman/Skrift_dependencies/models-mlx/
# Example: Qwen3-4b-Instruct-2507-MLX-8bit

# The symlinks in backend/resources/ will automatically point to these
```

**Recommended MLX Models:**
- [Qwen/Qwen3-4B-Instruct-MLX](https://huggingface.co/Qwen) (4GB, 8-bit)
- [meta-llama/Llama-3.2-3B-MLX](https://huggingface.co/meta-llama) (3GB)

---

## 🎯 Workflow

1. **Upload** – Drag .m4a files into the app
2. **Transcribe** – Metal-accelerated Whisper generates transcript with word timings
3. **Sanitise** – Link names to `[[Obsidian]]` format, with disambiguation for shared nicknames
4. **Enhance** – Local MLX model polishes grammar, removes filler words, adds structure
5. **Export** – Generate markdown with YAML frontmatter ready for Obsidian

---

## 🛠️ Development

```bash
# Backend (Terminal 1)
cd backend
python3 main.py

# Frontend (Terminal 2)
cd frontend
npm run dev

# Lint & Type Check
cd frontend
npm run lint:fix
npm run type-check
```

See [`WARP.md`](./WARP.md) for detailed development guidance.

---

## 📖 Documentation

- **[WARP.md](./WARP.md)** – Full technical reference (architecture, API, development)
- **[Docs/QUICK_START.md](./Docs/QUICK_START.md)** – Detailed setup guide
- **[Docs/ARCHITECTURE.md](./Docs/ARCHITECTURE.md)** – System design and data flow
- **[Docs/DEVELOPMENT.md](./Docs/DEVELOPMENT.md)** – Developer guide with API reference

---

## 🏗️ Architecture

```
Skrift/
├── backend/              # FastAPI server (Python)
│   ├── api/             # 8 REST routers
│   ├── services/        # Business logic
│   ├── resources/       # Symlinks to models
│   └── config/          # Settings, names.json
├── frontend/            # Electron + React + TypeScript
│   ├── components/      # UI components
│   └── features/        # Tab components
└── Skrift_dependencies/ # Models (13GB, not in repo)
    ├── models-mlx/      # MLX models
    ├── whisper/         # Whisper binaries
    └── mlx-env/         # Python environment for MLX
```

**Key Design:**
- **Heartbeat status tracking** – Uses `lastActivityAt` timestamps instead of progress bars
- **Symlinked dependencies** – Large models stored separately, keeping repo at ~700MB
- **External MLX environment** – MLX dependencies isolated in `Skrift_dependencies/mlx-env/`

---

## ⚙️ Configuration

### Name Linking
Edit `backend/config/names.json`:
```json
{
  "people": [
    {
      "canonical": "[[John Doe]]",
      "aliases": ["John", "Johnny"],
      "short": "John"
    }
  ]
}
```

### MLX Enhancement
- **Settings → Enhancement** – Upload models, test generation, adjust temperature
- **Chat Templates** – Optionally apply model's chat template for better prompts
- **Dynamic Token Budget** – Output length scales with input (configurable)

---

## 🔧 Troubleshooting

**Backend won't start?**
```bash
lsof -ti:8000 | xargs kill -9
./start-background.sh
```

**Models not found?**
- Ensure `~/Hackerman/Skrift_dependencies/` exists
- Check symlinks: `ls -la backend/resources/`

**Audio won't play?**
- CSP allows `media-src http://localhost:8000`
- Backend supports HTTP 206 range requests

See logs: `tail -f backend/backend.log` or `tail -f frontend/frontend.log`

---

## 🤝 Contributing

This is a personal project, but feel free to fork and adapt! The codebase uses:
- **Backend:** FastAPI, Pydantic, Whisper.cpp, MLX
- **Frontend:** Electron, React, TypeScript, Tailwind CSS, Vite

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details

---

## 🙏 Acknowledgments

- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) for Metal-accelerated transcription
- [MLX](https://github.com/ml-explore/mlx) for local AI inference on Apple Silicon
- [Obsidian](https://obsidian.md) for the inspiration behind name linking

---

**Status:** Production-ready for personal use. Actively maintained.
