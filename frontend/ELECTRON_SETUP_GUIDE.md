# ELECTRON_SETUP_GUIDE.md

## Overview
This guide provides instructions on setting up the Electron application with Vite and resolving common issues encountered during development.

## Prerequisites
- Node.js and npm installed.
- Electron and Vite are configured in the `package.json`.

## Setting Up Vite
1. **Adjust Vite Configuration**: Ensure the `vite.config.ts` file has proper path imports and builds with correct path resolutions.
   
   ```typescript
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import * as path from 'path';

   export default defineConfig({
     plugins: [react()],
     resolve: {
       alias: {
         '@': path.resolve(__dirname, 'src'),
         // other aliases...
       },
     },
     // other config...
   });
   ```

## Common Issues and Fixes
1. **Missing Icon Warning**
   - Ensure the app icon is located at `build/icon.icns`.
   - You can use a placeholder icon located at `/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/ApplicationsFolderIcon.icns`.

2. **CSP and Security Warnings in Development**
   - Development builds may generate CSP (Content Security Policy) and web security warnings.
   - These warnings do not affect production and can be ignored during development.

3. **Vite CJS Deprecation Warning**
   - The warning is generally harmless but can be addressed by following the latest Vite documentation.

## Running the App
Run the application using:

```sh
npm run dev
```

This command starts both frontend (Vite) and Electron processes using concurrent execution.

## Best Practices
- Use TypeScript across the project for type safety.
- Regularly update dependencies.
- Address security warnings before production deployment.
- Ensure proper Content Security Policies are in place for production builds.

## Contributing
For contributing, ensure that all changes adhere to the latest project guidelines and update the documentation as needed.

---

Refer to this guide for troubleshooting common setup and development issues. Keep abreast of any project-specific changes by visiting the repository documentation (if available).
