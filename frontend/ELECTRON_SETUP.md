# Production-Ready Electron Setup Guide

This guide covers the complete setup and deployment of the Voice Transcription Pipeline as a production-ready Electron desktop application.

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18.0.0 or higher
- **npm** v8.0.0 or higher (or **yarn** v1.22.0+)
- **Git** for version control

### Installation

1. **Clone or setup the project:**
```bash
# If cloning from repository
git clone <your-repository-url>
cd voice-transcription-pipeline

# Install dependencies
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

## 📁 Project Structure

```
voice-transcription-pipeline/
├── main.js                 # Electron main process (production-ready)
├── preload.js              # Secure IPC bridge with validation
├── index.html              # Optimized HTML with error handling
├── App.tsx                 # React application entry point
├── package.json            # Production dependencies & build config
├── tailwind.config.js      # Complete design system configuration
├── postcss.config.js       # CSS optimization for production
├── styles/
│   └── globals.css         # Production-grade CSS with reset & optimization
├── components/             # React components
├── build/                  # Build assets (icons, etc.)
└── dist/                   # Distribution files (generated)
```

## 🔧 Configuration Features

### 🛡️ Security Hardening

- **Context Isolation**: Complete isolation between main and renderer processes
- **CSP Headers**: Strict Content Security Policy for XSS prevention
- **Input Validation**: All IPC calls are validated and sanitised
- **No Node Integration**: Renderer process has no direct Node.js access
- **Secure Preload**: Safe API exposure through contextBridge
- **Certificate Validation**: Proper SSL certificate handling

### ⚡ Performance Optimizations

- **Hardware Acceleration**: GPU acceleration enabled
- **Background Throttling**: Optimized CPU usage when backgrounded
- **Memory Management**: Proper cleanup and garbage collection
- **Lazy Loading**: Components and resources loaded on demand
- **CSS Optimization**: Minified and optimized stylesheets
- **Font Optimization**: System fonts with fallbacks

### 🎨 Visual Fidelity

- **Complete Design System**: Extracted from Figma with all tokens
- **Pixel Perfect**: Exact color matching and spacing
- **Responsive Layout**: Proper scaling across different screen sizes
- **Native Feel**: Platform-specific UI elements and behaviors
- **Smooth Animations**: Hardware-accelerated transitions
- **Custom Scrollbars**: Styled to match the application theme

## 🛠️ Development Commands

### Available Scripts

```bash
# Development
npm run dev              # Start in development mode with DevTools
npm run start           # Start in production mode

# Building
npm run build           # Build renderer and create distributables
npm run pack            # Create unpacked build for testing
npm run dist            # Create distributable packages
npm run dist-all        # Build for all platforms (Windows, macOS, Linux)

# Maintenance
npm run clean           # Clean build directories
npm run lint            # Lint code with ESLint
npm run type-check      # TypeScript type checking
```

### Development Features

- **Hot Reload**: Automatic restart on main process changes
- **DevTools**: Chrome DevTools integration
- **Error Logging**: Comprehensive error tracking
- **Performance Monitoring**: Load time and resource usage tracking
- **Source Maps**: For debugging in production builds

## 📦 Building for Distribution

### Single Platform Build

```bash
# Build for current platform
npm run dist
```

### Multi-Platform Build

```bash
# Build for all platforms
npm run dist-all
```

### Platform-Specific Builds

```bash
# Windows
npm run dist -- --win

# macOS
npm run dist -- --mac

# Linux
npm run dist -- --linux
```

### Build Outputs

The build process creates the following distributables:

**Windows:**
- `.exe` installer (NSIS)
- `.exe` portable application
- `.zip` archive

**macOS:**
- `.dmg` disk image
- `.zip` archive
- Universal binary (Intel + Apple Silicon)

**Linux:**
- `.AppImage` portable application
- `.deb` Debian package
- `.rpm` Red Hat package

## 🔒 Security Considerations

### Production Security Checklist

- ✅ Context isolation enabled
- ✅ Node integration disabled in renderer
- ✅ Remote module disabled
- ✅ Web security enabled
- ✅ CSP headers configured
- ✅ Input validation implemented
- ✅ External URL handling secured
- ✅ Certificate validation enabled

### Code Signing (Recommended for Distribution)

For production releases, you should sign your application:

**Windows:**
```bash
# Set environment variables
set CSC_LINK=path/to/certificate.p12
set CSC_KEY_PASSWORD=your_password

# Build with signing
npm run dist
```

**macOS:**
```bash
# Set environment variables
export CSC_LINK=path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password

# Build with signing
npm run dist
```

## 🎨 Design System

### Color Palette

The application uses a comprehensive color system extracted from the design:

- **Primary**: Slate-based neutral palette
- **Success**: Green palette for completed states
- **Warning**: Amber palette for warnings
- **Error**: Red palette for errors
- **Processing**: Blue palette for active states

### Typography

- **Font Stack**: System fonts with Inter fallback
- **Sizes**: Responsive scale from 12px to 48px
- **Weights**: Light (300) to Bold (700)
- **Line Heights**: Optimized for readability

### Spacing

- **Base Unit**: 0.25rem (4px)
- **Scale**: 0.25rem to 6rem
- **Component Spacing**: Consistent padding and margins

## 🔧 Backend Integration

### IPC Handlers Ready for Backend

The application includes production-ready IPC handlers for:

- **File Operations**: Select, read, write, delete
- **Pipeline Operations**: Transcription, sanitisation, enhancement, export
- **System Monitoring**: CPU, memory, disk usage
- **Error Handling**: Logging and user notifications

### Integration Points

```javascript
// Example: Integrate your transcription backend
ipcMain.handle('pipeline-start-transcription', async (event, fileId, options) => {
  // Replace with your backend API call
  const result = await yourBackend.startTranscription(fileId, options);
  return result;
});
```

## 🚨 Troubleshooting

### Common Issues and Solutions

#### 1. Application Won't Start

**Symptom**: Electron app crashes on startup
**Solutions**:
```bash
# Check Node.js version
node --version  # Should be 18+

# Clear dependencies and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for errors
npm run dev
```

#### 2. Styling Issues

**Symptom**: Components look broken or unstyled
**Solutions**:
- Verify `tailwind.config.js` is configured correctly
- Check that `globals.css` is being loaded
- Ensure PostCSS is processing Tailwind classes
- Check browser DevTools for CSS errors

#### 3. Build Failures

**Symptom**: `npm run dist` fails
**Solutions**:
```bash
# Clean build directory
npm run clean

# Check TypeScript errors
npm run type-check

# Build step by step
npm run build-renderer
npm run pack
```

#### 4. Performance Issues

**Symptom**: Application is slow or unresponsive
**Solutions**:
- Check system resource usage
- Monitor memory leaks in DevTools
- Optimize React components with React.memo
- Reduce bundle size with code splitting

#### 5. IPC Communication Issues

**Symptom**: Frontend can't communicate with backend
**Solutions**:
- Verify preload script is loaded
- Check IPC handler registration in main.js
- Validate argument types in IPC calls
- Check error logs in both processes

### Debug Mode

Enable comprehensive logging:

```bash
# Windows
set DEBUG=* && npm run dev

# macOS/Linux
DEBUG=* npm run dev
```

### Performance Profiling

```bash
# Start with performance monitoring
npm run dev -- --enable-logging --trace-warnings
```

## 📋 Production Deployment Checklist

Before deploying to users:

### Code Quality
- [ ] All TypeScript errors resolved
- [ ] ESLint warnings addressed
- [ ] All tests passing
- [ ] Code reviewed and approved

### Security
- [ ] Application signed with valid certificate
- [ ] All security headers configured
- [ ] No sensitive data in logs
- [ ] External dependencies audited

### Performance
- [ ] Bundle size optimized
- [ ] Memory usage tested
- [ ] Startup time acceptable (<3 seconds)
- [ ] No memory leaks detected

### User Experience
- [ ] Error handling graceful
- [ ] Loading states implemented
- [ ] Keyboard navigation working
- [ ] Screen reader compatibility

### Distribution
- [ ] Installers tested on target platforms
- [ ] Auto-updater configured (if applicable)
- [ ] Installation/uninstallation tested
- [ ] User documentation complete

## 📞 Support

### Getting Help

1. **Check Documentation**: Review this guide and inline comments
2. **Check Issues**: Look for similar problems in the repository
3. **Enable Debug Mode**: Use debug logging to identify issues
4. **Check System Requirements**: Ensure compatible OS and Node.js version

### Reporting Issues

When reporting issues, include:
- Operating system and version
- Node.js and npm versions
- Complete error messages
- Steps to reproduce
- Expected vs actual behavior

---

## 🎉 Success!

Your Voice Transcription Pipeline is now ready for production! The application includes:

- **🛡️ Enterprise-grade security** with context isolation and input validation
- **⚡ Optimized performance** with hardware acceleration and memory management
- **🎨 Pixel-perfect design** matching your original Figma specifications
- **🔧 Production-ready build system** with multi-platform support
- **📱 Professional user experience** with error handling and accessibility

Ready to process audio files with confidence! 🎵→📝