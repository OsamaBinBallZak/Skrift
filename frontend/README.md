# Audio Transcription Pipeline - Frontend

React + Electron desktop application for audio transcription.

## Features

- **Drag-and-drop** file upload
- **Real-time status** with activity tracking
- **System monitoring** (CPU, RAM, temperature)
- **Batch processing** with file queue
- **Clean UI** with dark/light themes
- **Live AI streaming** (token-by-token) with preserved formatting
- **One-click View of persisted outputs** (Copy Edit, Summary) without re-running
- **Paragraph integrity** preserved end-to-end (no unwanted normalization)
- **Accurate compile** to Markdown with YAML and exact enhanced text

## 🎯 System Overview

### Purpose
This application serves as the **frontend interface only** for a local voice transcription pipeline. It provides:
- **Batch processing management** for multiple audio files
- **Visual pipeline tracking** with real-time status updates
- **Integrated system resource monitoring** with CPU, RAM, and performance tracking
- **Configurable AI enhancement** with custom system prompts
- **Flexible export options** with YAML frontmatter and multiple formats
- **Global file management** with queue-based processing
- **Enhanced error handling** with detailed logging and recovery options
- **Manual editing capabilities** for all processing stages
- **Preview functionality** across all processing steps
- **Comprehensive batch processing controls** with pause/resume functionality
- **Intelligent interrupted processing recovery** to prevent file corruption

### Architecture
- **Frontend Framework**: React with TypeScript
- **UI Library**: Tailwind CSS + shadcn/ui components  
- **Desktop Platform**: Electron (frontend only - no processing)
- **State Management**: React Context + Local State
- **Configuration**: JSON-based with import/export capabilities
- **Styling**: Production-grade design system with complete token extraction

### Key Principles
1. **Frontend-Only Design**: No actual audio processing happens in this interface
2. **External Integration**: All processing is handled by external systems via IPC APIs
3. **Local Workflow**: Everything operates on local folders and files
4. **Status Tracking**: Each file has its own JSON metadata file for progress tracking
5. **Modular Pipeline**: Each step is independent and can be run separately
6. **Atomic Operations**: All file operations are atomic to prevent corruption
7. **Error Recovery**: Comprehensive error handling with detailed logging
8. **Corruption Prevention**: Interrupted processing restarts from the beginning to prevent partial file corruption

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18.0.0 or higher
- **npm** v8.0.0 or higher (or **yarn** v1.22.0+)
- **Git** for version control

### Installation

1. **Clone and setup:**
```bash
git clone <your-repository-url>
cd voice-transcription-pipeline
npm install
```

2. **Development mode:**
```bash
npm run dev
```

3. **Production build:**
```bash
npm run dist
```

### Available Scripts

```bash
# Development
npm run dev              # Start in development mode with DevTools
npm run start           # Start in production mode

# Building
npm run build           # Build renderer and create distributables
npm run dist            # Create distributable packages
npm run dist-all        # Build for all platforms (Windows, macOS, Linux)

# Maintenance
npm run clean           # Clean build directories
npm run lint            # Lint code with ESLint
npm run type-check      # TypeScript type checking
```

---

## 🔄 Pipeline Workflow

The application manages a **5-stage pipeline** that processes audio files through the following steps:

### 1. Upload Stage
**Purpose**: Manages input folder monitoring and file discovery
- **Input**: Local folder containing audio files (.m4a, .mp3, .wav, etc.)
- **Function**: Scans folder for unprocessed audio files
- **Output**: Files registered in pipeline with `unprocessed` status
- **Conversation Mode**: User can specify multi-speaker audio at upload time

### 2. Transcribe Stage  
**Purpose**: Converts audio to text using external transcription service
- **Input**: Raw audio files
- **External Process**: Speech-to-text conversion (Whisper, etc.)
- **Modes**: Standard transcription OR Conversation transcription with speaker diarization
- **Output**: Raw transcript text files
- **Features**: Real-time progress tracking, manual editing, batch processing

### 3. Sanitise Stage
**Purpose**: Cleans and fixes transcribed text using regex rules
- **Input**: Raw transcript text
- **Processing**: Remove filler words, fix punctuation, apply name mappings
- **Output**: Clean, readable transcript text
- **Features**: Before/after comparison, manual editing, speaker mapping

### 4. Enhance Stage (Optional)
**Purpose**: AI-powered text improvement using configurable system prompts
- **Input**: Sanitised transcript text
- **AI Processing**: Uses local LLM with custom system prompts
- **Enhancement Options**: Smart formatting, context analysis, full enhancement
- **Output**: AI-enhanced structured text
- **Features**: Skip option, preview mode, before/after comparison

### 5. Export Stage
**Purpose**: Generate final documents with metadata and formatting
- **Input**: Enhanced text OR sanitised text (if enhancement skipped)
- **Processing**: Add YAML frontmatter, apply chosen format
- **Output**: Final formatted document ready for use
- **Features**: Multiple formats, preview mode, batch export

---

## 🏗️ Component Architecture

### Core Application (`App.tsx`)
**Primary orchestrator** that manages the entire application structure:
- **Tab Management**: Controls navigation between 6 main tabs
- **Global State**: Manages pipeline files and selected file state
- **Processing Lock**: Prevents concurrent operations
- **Context Provider**: Wraps app with EnhancementConfigProvider
- **Electron Integration**: Safe API calls with browser fallbacks

### Enhanced System Components

#### `SystemResourceMonitor.tsx`
**Real-time system monitoring** integrated into the main header:
- **Performance Tracking**: CPU, RAM, temperature monitoring
- **Processing Status**: Shows current operation and file being processed
- **Compact Design**: Optimized for header integration
- **Fallback Support**: Works in both Electron and browser environments

#### `GlobalFileSelector.tsx`
**Enhanced file management interface** with comprehensive features:
- **Error Handling**: Visual indicators and error log access
- **Processing Prevention**: Shows when operations are locked
- **File Metadata**: Duration, format, size display
- **Step Progress**: Visual pipeline completion tracking

### Tab Components

#### `UploadTab.tsx`
**File discovery with drag-and-drop support**:
- **Drag & Drop**: Native browser file selection
- **Format Validation**: Comprehensive file type checking
- **Conversation Mode**: Multi-speaker audio configuration
- **File Previews**: Preview files before upload

#### `TranscribeTab.tsx`
**Enhanced transcription interface**:
- **Batch Processing**: Process all unprocessed files
- **Real-time Status**: Shows "Transcribing..." with last activity time
- **Stale Detection**: Warns when transcription appears stuck (>2 min inactive)
- **Manual Editing**: Edit transcript content directly
- **Queue Management**: Pause/resume batch operations

#### `SanitiseTab.tsx`
**Advanced text cleaning interface**:
- **Before/After Comparison**: Side-by-side text editing
- **Speaker Configuration**: Conversation mode support
- **Manual Editing**: Direct text manipulation
- **Date Extraction**: Original file date handling

#### `EnhanceTab.tsx`
**AI-powered text improvement**:
- **Enhancement Options**: Configurable AI processing modes
- **System Prompt Integration**: Custom prompt configuration
- **Live Streaming**: Token-by-token SSE stream from the backend; UI renders incrementally
- **Exact Persistence**: On completion, the app saves the exact streamed buffer (no end-of-stream transforms)
- **View Persisted**: "View" buttons load persisted Copy Edit and Summary without starting LLM
- **Skip Option**: Bypass AI enhancement
- **Preview Functionality**: Before/after comparison

Streaming behavior and guarantees:
- SSE events: `start`, `plan`, `stats`, repeated `token`, and final `done`
- Multi-line SSE data is framed line-by-line to avoid truncation
- No post-processing at stream end—what streams is what is saved and viewed
- A targeted refresh runs once at completion so the selected file reflects persisted outputs immediately

Formatting guarantees:
- Paragraphs and soft line breaks (two spaces + newline) are preserved end-to-end
- Soft-wrap normalization is disabled for enhancement input
- The UI never replaces the streamed buffer at completion

#### `ExportTab.tsx`
**Final document generation**:
- **Format Selection**: Multiple output formats
- **YAML Frontmatter**: Enhanced metadata generation
- **Batch Export**: Process multiple ready files
- **Preview Mode**: Final document preview

#### `SettingsTab.tsx`
**Enhanced configuration management**:
- **Theme Management**: Light/dark/system theme support
- **Configuration Persistence**: Auto-save settings
- **Import/Export**: Configuration backup and sharing
- **System Information**: Platform and version details

---

## 📊 Data Structure

### Standardised PipelineFile Interface
```typescript
interface PipelineFile {
  id: string;
  name: string;
  size: string;
  status: 'unprocessed' | 'transcribing' | 'transcribed' | 'sanitising' | 'sanitised' | 'enhancing' | 'enhanced' | 'exporting' | 'exported' | 'error';
  path: string;
  addedTime: string;
  progress?: number; // 0-100, only during processing
  output?: string; // raw transcript
  sanitised?: string; // sanitised text
  exported?: string; // compiled path if present
  // Persisted enhancement fields (used by View and compile)
  enhanced_copyedit?: string;
  enhanced_summary?: string;
  enhanced_tags?: string[];
  error?: string;
  conversationMode: boolean; // Always present, not optional
  duration?: string; // Format: "HH:MM:SS"
  format?: 'm4a' | 'mp3' | 'wav' | 'flac';
  lastActivityAt?: string; // ISO timestamp
  steps: {
    transcribe: 'pending' | 'processing' | 'done' | 'error';
    sanitise:  'pending' | 'processing' | 'done' | 'error'; 
    enhance:   'pending' | 'processing' | 'done' | 'error' | 'skipped';
    export:    'pending' | 'processing' | 'done' | 'error';
  };
}
```

### Enhanced Status JSON Format
Each audio file has an associated JSON file tracking its progress:

```json
{
  "filename": "meeting-recording.m4a",
  "status": "sanitised",
  "processing_step": null,
  "conversation_mode": true,
  "transcription_type": "conversation",
  "original_date": "2025-01-06",
  "file_size": "24.5 MB",
  "duration": "00:12:34",
  "format": "m4a",
  "steps": {
    "transcribe": "done",
    "sanitise": "done", 
    "enhance": "not done",
    "export": "not done"
  },
  "error": null,
  "last_updated": "2025-01-06T18:45:00Z",
  "processing_speed": "2.5x",
  "estimated_remaining": "00:03:45"
}
```

---

## 🎨 Design System

### Production-Ready Visual Fidelity
- **Complete Design Tokens**: Extracted from Figma with pixel-perfect accuracy
- **Color System**: Comprehensive palette (primary, success, warning, error, processing)
- **Typography**: System fonts with optimized scaling and weights
- **Spacing**: Consistent 0.25rem base unit with responsive scaling
- **Shadows & Borders**: Production-grade visual effects

### Component Library
- **shadcn/ui Integration**: 40+ production-ready components
- **Custom Components**: Application-specific components with design tokens
- **Responsive Design**: Mobile-first approach with proper breakpoints
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support

### Theme Support
- **Light/Dark Modes**: Complete theme implementation
- **System Theme**: Automatic detection and following of OS preferences
- **Theme Persistence**: Settings saved across application restarts

---

## 🔧 Electron Integration

### Production-Ready Architecture
- **Security Hardening**: Context isolation, CSP headers, input validation
- **Performance Optimization**: Hardware acceleration, memory management
- **Multi-Platform Support**: Windows, macOS, Linux builds
- **Code Signing**: Ready for production distribution

### IPC API Structure
```typescript
// File Operations
electronAPI.dialog.selectFiles()
electronAPI.dialog.selectFolder()
electronAPI.dialog.saveFile()

// System Monitoring
electronAPI.system.getResources()
electronAPI.system.getInfo()

// Pipeline Operations
electronAPI.pipeline.startTranscription()
electronAPI.pipeline.startSanitise()
electronAPI.pipeline.startEnhancement()
electronAPI.pipeline.startExport()

// Theme Management
electronAPI.theme.setTheme()
electronAPI.theme.getSystemTheme()
```

### Fallback Handling
- **Browser Mode**: Graceful degradation when Electron APIs unavailable
- **Error Boundaries**: Comprehensive error handling and user feedback
- **Progressive Enhancement**: Core functionality works in both environments

---

## 🔗 Integration Points

### Enhanced HTML Element IDs
Every interactive element has a unique ID for external automation:

**Basic Controls:**
- `btn-upload-audio` - Start file upload process
- `btn-start-transcription` - Begin transcription
- `btn-pause-transcription` - Pause current transcription
- `btn-retry-transcription` - Retry failed transcription
- `btn-sanitise` - Run text sanitisation
- `btn-run-enhancement` - Start AI enhancement
- `btn-export-md` - Export final document
- `file-selector-global` - Global file selector dropdown

**Batch Processing Controls:**
- `btn-batch-transcribe-all` - Main batch transcription trigger
- `btn-pause-batch` - Pause batch processing
- `btn-resume-batch` - Resume batch processing

**Preview and Editing Controls:**
- `btn-preview-transcript` - Show transcript preview
- `btn-edit-transcript` - Enable transcript editing
- `btn-save-transcript` - Save transcript changes
- `btn-toggle-comparison` - Show/hide before/after comparison

### Backend Requirements
The frontend is ready for integration with the following backend APIs:

Enhancement streaming contract (SSE):
- Use MLX `stream_generate` for true token streaming
- SSE events must frame multi-line data with one `data:` line per logical line
- Final `done` must be the concatenation of emitted token chunks (no extra transforms)
- No heartbeats are required; the UI hides the spinner on the first token

Compile behavior:
- compiled.md contains YAML frontmatter + the exact `enhanced_copyedit`
- Paragraphs and soft breaks are preserved; no normalization is applied at compile time

1. **System Resource Monitoring**: CPU, memory, temperature tracking
2. **File Metadata Extraction**: Duration, format, size information
3. **Batch Processing**: Sequential file processing with pause/resume
4. **Manual Editing**: Save transcript and sanitised text edits
5. **Preview Content Loading**: Load content for frontend previews
6. **Error Logging**: Comprehensive error tracking and log access

---

## 🚨 Troubleshooting

### Common Issues

#### View button is disabled even though status.json has content
- The PipelineFile must carry `enhanced_copyedit`/`enhanced_summary` fields. The app now maps them through the file transform.
- After streaming completes, a targeted refresh updates the selected file so View enables immediately.

#### Formatting changes at the end of streaming
- Fixed by (1) proper SSE multi-line framing, (2) removing end-of-stream post-processing, and (3) persisting the exact streamed buffer from refs.
- The UI no longer overwrites the live buffer at completion.

#### MLX streaming error like `generate_step() got an unexpected keyword argument 'temperature'`
- Use `stream_generate` instead of `generate(stream=true)`; temperature may be unsupported in some streaming APIs.
- The backend now uses `stream_generate` and handles streaming-only mode cleanly.

#### Application Won't Start
```bash
# Check Node.js version (should be 18+)
node --version

# Clear dependencies and reinstall
rm -rf node_modules package-lock.json
npm install

# Start in development mode
npm run dev
```

#### Styling Issues
- Verify `tailwind.config.js` configuration
- Check that `globals.css` is loading properly
- Ensure PostCSS is processing Tailwind classes
- Check browser DevTools for CSS errors

#### Build Failures
```bash
# Clean build directory
npm run clean

# Check TypeScript errors
npm run type-check

# Build step by step
npm run build
npm run pack
```

#### Electron API Issues
- Verify preload script is loaded correctly
- Check IPC handler registration in main.js
- Validate argument types in IPC calls
- Review error logs in both main and renderer processes

### Debug Mode
```bash
# Enable comprehensive logging
DEBUG=* npm run dev

# Performance monitoring
npm run dev -- --enable-logging --trace-warnings
```

---

## 📁 File Structure

```
voice-transcription-pipeline/
├── App.tsx                           # Main React application
├── main.js                          # Electron main process
├── preload.js                       # Secure IPC bridge
├── package.json                     # Dependencies & build config
├── tailwind.config.js               # Complete design system
├── styles/
│   └── globals.css                  # Production CSS with optimization
├── components/
│   ├── SystemResourceMonitor.tsx    # Real-time system monitoring
│   ├── GlobalFileSelector.tsx       # Enhanced file management
│   ├── UploadTab.tsx                # Drag-and-drop file upload
│   ├── TranscribeTab.tsx            # Batch transcription interface
│   ├── SanitiseTab.tsx              # Text cleaning with preview
│   ├── EnhanceTab.tsx               # AI enhancement interface
│   ├── ExportTab.tsx                # Multi-format export
│   ├── SettingsTab.tsx              # Configuration management
│   ├── LoadingSpinner.tsx           # Production loading states
│   ├── hooks/
│   │   └── useElectronSafe.ts       # Safe Electron API integration
│   └── ui/                          # shadcn/ui component library
├── src/
│   ├── hooks/
│   │   └── useElectronAPI.ts        # Electron API hooks
│   ├── lib/
│   │   └── utils.js                 # Utility functions
│   └── types/
│       └── electron.d.ts            # TypeScript definitions
└── dist/                            # Distribution files
```

---

## 🎉 Production Ready Features

### ✅ **FULLY IMPLEMENTED**

- **🛡️ Enterprise Security**: Context isolation, CSP headers, input validation
- **⚡ Performance Optimized**: Hardware acceleration, memory management
- **🎨 Pixel-Perfect Design**: Complete Figma design token extraction
- **📱 Responsive Interface**: Mobile-first with proper breakpoints
- **🔧 Comprehensive Error Handling**: Detailed logging and recovery options
- **🎛️ Real-time System Monitoring**: CPU, memory, temperature tracking
- **📋 Batch Processing**: Sequential processing with pause/resume controls
- **✏️ Manual Editing**: Edit transcripts and sanitised text directly
- **👁️ Preview Functionality**: Before/after comparison across all stages
- **🌓 Theme Support**: Light/dark/system theme with persistence
- **🔄 Safe Electron Integration**: Browser fallbacks and error boundaries

### 🚀 **READY FOR DEPLOYMENT**

The application is production-ready with:
- Multi-platform builds (Windows, macOS, Linux)
- Code signing preparation
- Comprehensive documentation
- Performance optimization
- Security hardening
- Professional user experience

Ready to process audio files with confidence! 🎵→📝

---

## 📞 Support

### Getting Help
1. **Documentation**: Review this README and `ELECTRON_SETUP.md`
2. **Debug Mode**: Enable debug logging to identify issues
3. **System Requirements**: Ensure compatible OS and Node.js version
4. **File Structure**: Verify all required files are present

### Reporting Issues
Include when reporting problems:
- Operating system and version
- Node.js and npm versions
- Complete error messages
- Steps to reproduce
- Expected vs actual behavior

---

*Last updated: January 2025*