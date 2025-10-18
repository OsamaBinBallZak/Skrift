const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Production-ready asset path utility
 * Handles both development and ASAR packaged environments
 */

/**
 * Get the correct path to assets folder
 * @param {string} assetPath - Relative path within assets folder
 * @returns {string} Absolute path to asset
 */
function getAssetPath(assetPath = '') {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isPackaged = app ? app.isPackaged : false;
  
  let basePath;
  
  if (isDevelopment) {
    // Development: assets are in the project root
    basePath = path.join(__dirname, '..', '..', 'assets');
  } else if (isPackaged) {
    // Production: assets are in the resources folder
    basePath = path.join(process.resourcesPath, 'assets');
  } else {
    // Fallback for other environments
    basePath = path.join(__dirname, '..', '..', 'assets');
  }
  
  return path.join(basePath, assetPath);
}

/**
 * Get the correct path to build resources
 * @param {string} resourcePath - Relative path within build resources
 * @returns {string} Absolute path to build resource
 */
function getBuildResourcePath(resourcePath = '') {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isPackaged = app ? app.isPackaged : false;
  
  let basePath;
  
  if (isDevelopment) {
    // Development: build resources are in the build folder
    basePath = path.join(__dirname, '..', '..', 'build');
  } else if (isPackaged) {
    // Production: build resources are in the resources folder
    basePath = path.join(process.resourcesPath, 'build');
  } else {
    // Fallback
    basePath = path.join(__dirname, '..', '..', 'build');
  }
  
  return path.join(basePath, resourcePath);
}

/**
 * Get the application icon path for the current platform
 * @returns {string} Path to platform-specific icon
 */
function getIconPath() {
  const platform = process.platform;
  let iconName;
  
  switch (platform) {
    case 'win32':
      iconName = 'icon.ico';
      break;
    case 'darwin':
      iconName = 'icon.icns';
      break;
    default:
      iconName = 'icon.png';
  }
  
  return getBuildResourcePath(iconName);
}

/**
 * Verify that an asset exists
 * @param {string} assetPath - Path to check
 * @returns {boolean} Whether the asset exists
 */
function assetExists(assetPath) {
  try {
    const fullPath = getAssetPath(assetPath);
    return fs.existsSync(fullPath);
  } catch (error) {
    console.error('Error checking asset existence:', error);
    return false;
  }
}

/**
 * Get the user data directory
 * @returns {string} Path to user data directory
 */
function getUserDataPath() {
  return app ? app.getPath('userData') : path.join(require('os').homedir(), '.voice-transcription-pipeline');
}

/**
 * Get the logs directory
 * @returns {string} Path to logs directory
 */
function getLogsPath() {
  return app ? app.getPath('logs') : path.join(getUserDataPath(), 'logs');
}

/**
 * Get the temporary directory for the app
 * @returns {string} Path to temp directory
 */
function getTempPath() {
  return app ? app.getPath('temp') : require('os').tmpdir();
}

/**
 * Create directory if it doesn't exist
 * @param {string} dirPath - Directory path to create
 * @returns {boolean} Whether directory was created or already exists
 */
function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Error creating directory:', error);
    return false;
  }
}

/**
 * Get safe file path (sanitize filename)
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function getSafeFilename(filename) {
  // Remove or replace dangerous characters
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace dangerous characters
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .substring(0, 255); // Limit length
}

/**
 * Get the path for storing application preferences
 * @returns {string} Path to preferences file
 */
function getPreferencesPath() {
  return path.join(getUserDataPath(), 'preferences.json');
}

/**
 * Get the path for storing application state
 * @returns {string} Path to state file
 */
function getStatePath() {
  return path.join(getUserDataPath(), 'app-state.json');
}

module.exports = {
  getAssetPath,
  getBuildResourcePath,
  getIconPath,
  assetExists,
  getUserDataPath,
  getLogsPath,
  getTempPath,
  ensureDirectoryExists,
  getSafeFilename,
  getPreferencesPath,
  getStatePath,
};