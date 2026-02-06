/**
 * Alta Parking Monitor - Electron Main Process
 * 
 * Responsibilities:
 * - Create and manage BrowserWindow
 * - Handle IPC messages from renderer
 * - Manage monitor lifecycle with AbortController
 * - Show native macOS notifications
 */

const { app, BrowserWindow, ipcMain, Notification, Menu, dialog, shell } = require('electron');
const path = require('path');
const { saveCredentials, loadCredentials } = require('./keychain');
const { startMonitor } = require('../monitor/parking');

let mainWindow = null;
let monitorAbortController = null;

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/clawdshartavenger/alta-parking-app/releases/latest';
const RELEASES_PAGE = 'https://github.com/clawdshartavenger/alta-parking-app/releases/latest';
const CURRENT_VERSION = require('../../package.json').version;

/**
 * Set up the application menu with Check for Updates
 */
function createMenu() {
  const template = [
    {
      label: 'Alta Parking Monitor',
      submenu: [
        { label: 'About Alta Parking Monitor', role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: () => checkForUpdates(true)
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: 'Close', accelerator: 'CmdOrCtrl+W', role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Check for updates from GitHub releases (manual download approach)
 */
async function checkForUpdates() {
  sendStatus('checking', 'Checking for updates...');
  
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { 'User-Agent': 'Alta-Parking-Monitor' }
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    const release = await response.json();
    const latestVersion = release.tag_name.replace(/^v/, '');
    
    if (isNewerVersion(latestVersion, CURRENT_VERSION)) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${latestVersion} is available!`,
        detail: `You have version ${CURRENT_VERSION}.\n\nWould you like to open the download page?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (result.response === 0) {
        shell.openExternal(RELEASES_PAGE);
      }
    } else {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No Updates',
        message: `You have the latest version (${CURRENT_VERSION})!`,
      });
    }
  } catch (err) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates',
      detail: err.message
    });
  }
}

/**
 * Compare version strings (semver)
 */
function isNewerVersion(latest, current) {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if ((latestParts[i] || 0) > (currentParts[i] || 0)) return true;
    if ((latestParts[i] || 0) < (currentParts[i] || 0)) return false;
  }
  return false;
}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Stop monitor if running when window closes
    if (monitorAbortController) {
      monitorAbortController.abort();
      monitorAbortController = null;
    }
  });
}

/**
 * Send status update to renderer
 * @param {string} type - Status type (checking, monitoring, success, error)
 * @param {string} message - Status message
 */
function sendStatus(type, message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('monitor-status', {
      type,
      message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Show native macOS notification
 * @param {string} title
 * @param {string} body
 */
function showNotification(title, body) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      sound: 'default'
    });
    notification.show();
  }
}

/**
 * Get path to bundled Chromium
 * @returns {string} Path to Chromium executable
 */
function getChromiumPath() {
  const resourcesPath = process.resourcesPath || path.join(__dirname, '../../..');
  const chromiumDir = path.join(resourcesPath, 'chromium');
  
  // Playwright's Chrome for Testing path
  return path.join(
    chromiumDir, 
    'chrome-mac-arm64',
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing'
  );
}

// IPC Handlers

/**
 * Save credentials to Keychain
 */
ipcMain.handle('save-credentials', async (event, creds) => {
  try {
    await saveCredentials(creds);
    return { success: true };
  } catch (error) {
    console.error('Failed to save credentials:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Load credentials from Keychain
 */
ipcMain.handle('load-credentials', async () => {
  try {
    const creds = await loadCredentials();
    return creds;
  } catch (error) {
    console.error('Failed to load credentials:', error);
    return { email: null, password: null, seasonPass: null, licensePlate: null };
  }
});

/**
 * Start the parking monitor
 */
ipcMain.handle('start-monitor', async (event, config) => {
  // Stop any existing monitor
  if (monitorAbortController) {
    monitorAbortController.abort();
  }

  // Create new abort controller
  monitorAbortController = new AbortController();
  const signal = monitorAbortController.signal;

  try {
    sendStatus('monitoring', `Starting monitor for ${config.targetDate}...`);

    const monitorConfig = {
      email: config.email,
      password: config.password,
      seasonPass: config.seasonPass,
      licensePlate: config.licensePlate,
      targetDate: config.targetDate,
      intervalMs: config.intervalMinutes * 60 * 1000,
      chromiumPath: getChromiumPath(),
    };

    // Status callback for monitor updates
    const onStatus = (type, message) => {
      sendStatus(type, message);

      // Show notification on successful booking
      if (type === 'success') {
        showNotification(
          '🎿 Parking Booked!',
          `Successfully booked parking for ${config.targetDate}`
        );
      }
    };

    // Start monitor (fire and forget - don't await)
    startMonitor(monitorConfig, onStatus, signal)
      .then((result) => {
        if (result.booked) {
          sendStatus('success', 'Parking successfully booked!');
        }
        monitorAbortController = null;
      })
      .catch((error) => {
        if (error.name !== 'AbortError' && !signal.aborted) {
          console.error('Monitor error:', error);
          sendStatus('error', `Monitor error: ${error.message}`);
        }
        monitorAbortController = null;
      });

    return { success: true };
  } catch (error) {
    console.error('Failed to start monitor:', error);
    sendStatus('error', `Error: ${error.message}`);
    return { success: false, error: error.message };
  }
});

/**
 * Stop the parking monitor
 */
ipcMain.handle('stop-monitor', async () => {
  if (monitorAbortController) {
    monitorAbortController.abort();
    monitorAbortController = null;
    sendStatus('idle', 'Monitoring stopped by user');
  }
  return { success: true };
});

// App lifecycle events

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Stop monitor before quitting
  if (monitorAbortController) {
    monitorAbortController.abort();
    monitorAbortController = null;
  }
  
  // macOS: quit when all windows closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  sendStatus('error', `Unexpected error: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection:', reason);
});
