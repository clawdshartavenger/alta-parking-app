/**
 * Alta Parking Monitor - Electron Main Process
 * 
 * Responsibilities:
 * - Create and manage BrowserWindow
 * - Handle IPC messages from renderer
 * - Manage monitor lifecycle with AbortController
 * - Show native macOS notifications
 */

const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const { saveCredentials, loadCredentials } = require('./keychain');
const { startMonitor } = require('../monitor/parking');
const { ensureBrowserInstalled } = require('./setup-browser');

let mainWindow = null;
let monitorAbortController = null;

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
  
  // macOS Chromium path
  return path.join(chromiumDir, 'Chromium.app/Contents/MacOS/Chromium');
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

    // Start monitor (runs until cancelled or booked)
    const result = await startMonitor(monitorConfig, onStatus, signal);

    if (result.booked) {
      sendStatus('success', 'Parking successfully booked!');
    }

    return { success: true };
  } catch (error) {
    // Check if aborted (not an error)
    if (error.name === 'AbortError' || signal.aborted) {
      sendStatus('idle', 'Monitoring stopped');
      return { success: true };
    }

    console.error('Monitor error:', error);
    sendStatus('error', `Error: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    // Clear controller if this one finished
    if (monitorAbortController?.signal === signal) {
      monitorAbortController = null;
    }
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

app.whenReady().then(async () => {
  createWindow();
  
  // Check for browser on first run
  const browserReady = await ensureBrowserInstalled(mainWindow);
  if (!browserReady) {
    sendStatus('error', 'Browser setup required. Please restart the app to try again.');
  }

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
