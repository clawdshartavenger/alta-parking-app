/**
 * First-run browser setup
 * Downloads Playwright Chromium if not present
 */

const { app, dialog } = require('electron');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path where Playwright stores browsers
function getPlaywrightBrowserPath() {
  const home = app.getPath('home');
  return path.join(home, 'Library', 'Caches', 'ms-playwright');
}

// Check if Chromium is already installed
function isChromiumInstalled() {
  const browserPath = getPlaywrightBrowserPath();
  if (!fs.existsSync(browserPath)) return false;
  
  const dirs = fs.readdirSync(browserPath);
  return dirs.some(d => d.startsWith('chromium'));
}

// Download Chromium using npx playwright install
async function downloadChromium(onProgress) {
  return new Promise((resolve, reject) => {
    onProgress('Downloading Chromium browser...');
    
    try {
      // Use npx to run playwright install chromium
      const result = execSync('npx playwright install chromium', {
        encoding: 'utf8',
        timeout: 300000, // 5 minute timeout
        cwd: app.getPath('userData'),
      });
      
      onProgress('Browser installed successfully!');
      resolve(true);
    } catch (err) {
      onProgress(`Error: ${err.message}`);
      reject(err);
    }
  });
}

// Show dialog and handle first-run setup
async function ensureBrowserInstalled(mainWindow) {
  if (isChromiumInstalled()) {
    return true;
  }
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'First-Time Setup',
    message: 'Alta Parking Monitor needs to download a browser component (~150MB) to work.',
    detail: 'This only happens once. The download will take 1-2 minutes on a typical connection.',
    buttons: ['Download Now', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
  });
  
  if (result.response === 1) {
    return false;
  }
  
  // Send status to renderer
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('setup-status', { 
      type: 'downloading', 
      message: 'Downloading browser...' 
    });
  }
  
  try {
    await downloadChromium((msg) => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('setup-status', { 
          type: 'progress', 
          message: msg 
        });
      }
    });
    
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('setup-status', { 
        type: 'complete', 
        message: 'Setup complete!' 
      });
    }
    
    return true;
  } catch (err) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Setup Failed',
      message: 'Failed to download browser component.',
      detail: `Error: ${err.message}\n\nYou can try running this command manually:\nnpx playwright install chromium`,
    });
    return false;
  }
}

module.exports = { ensureBrowserInstalled, isChromiumInstalled };
