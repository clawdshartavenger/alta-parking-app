# Component Specifications

Detailed specs for each component. Sub-agents should follow these exactly.

---

## Component 1: Main Process

**File:** `src/main/index.js`

**Responsibilities:**
1. Create Electron app and BrowserWindow
2. Load preload script and renderer HTML
3. Handle all IPC channels
4. Manage monitor lifecycle
5. Show native notifications

**Window Configuration:**
```javascript
{
  width: 800,
  height: 600,
  resizable: false,
  titleBarStyle: 'hiddenInset',  // macOS native feel
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  }
}
```

**IPC Handlers:**

1. `save-credentials` (async)
   - Input: `{ email, password, seasonPass, licensePlate }`
   - Action: Store each in Keychain using keytar
   - Return: `{ success: true }` or `{ success: false, error: string }`

2. `load-credentials` (async)
   - Input: none
   - Action: Load all from Keychain
   - Return: `{ email, password, seasonPass, licensePlate }` (nulls if not found)

3. `start-monitor` (async)
   - Input: `{ email, password, seasonPass, licensePlate, targetDate, intervalMinutes }`
   - Action: Start the parking monitor
   - Return: `{ success: true }` or `{ success: false, error: string }`
   - Side effect: Send `monitor-status` events to renderer

4. `stop-monitor` (async)
   - Input: none
   - Action: Abort running monitor
   - Return: `{ success: true }`

**Notification:**
Use Electron's native Notification API when spot is booked.

---

## Component 2: Preload Script

**File:** `src/main/preload.js`

**Purpose:** Secure bridge between main and renderer processes.

**Full Implementation:**
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alta', {
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  loadCredentials: () => ipcRenderer.invoke('load-credentials'),
  startMonitor: (config) => ipcRenderer.invoke('start-monitor', config),
  stopMonitor: () => ipcRenderer.invoke('stop-monitor'),
  onStatus: (callback) => {
    ipcRenderer.on('monitor-status', (event, data) => callback(data));
  },
  removeStatusListener: () => {
    ipcRenderer.removeAllListeners('monitor-status');
  }
});
```

---

## Component 3: Keychain Module

**File:** `src/main/keychain.js`

**Dependencies:** `keytar`

**Service Name:** `alta-parking-monitor`

**Functions:**

```javascript
const keytar = require('keytar');
const SERVICE = 'alta-parking-monitor';

async function saveCredentials({ email, password, seasonPass, licensePlate }) {
  await keytar.setPassword(SERVICE, 'email', email);
  await keytar.setPassword(SERVICE, 'password', password);
  await keytar.setPassword(SERVICE, 'seasonPass', seasonPass);
  await keytar.setPassword(SERVICE, 'licensePlate', licensePlate);
}

async function loadCredentials() {
  return {
    email: await keytar.getPassword(SERVICE, 'email'),
    password: await keytar.getPassword(SERVICE, 'password'),
    seasonPass: await keytar.getPassword(SERVICE, 'seasonPass'),
    licensePlate: await keytar.getPassword(SERVICE, 'licensePlate'),
  };
}

async function clearCredentials() {
  await keytar.deletePassword(SERVICE, 'email');
  await keytar.deletePassword(SERVICE, 'password');
  await keytar.deletePassword(SERVICE, 'seasonPass');
  await keytar.deletePassword(SERVICE, 'licensePlate');
}

module.exports = { saveCredentials, loadCredentials, clearCredentials };
```

---

## Component 4: Renderer HTML

**File:** `src/renderer/index.html`

**Structure:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Alta Parking Monitor</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>🎿 Alta Parking Monitor</h1>
      <div id="status-indicator" class="status idle">Idle</div>
    </header>
    
    <form id="config-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" required placeholder="your@email.com">
      </div>
      
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" required>
      </div>
      
      <div class="form-group">
        <label for="seasonPass">Season Pass Code</label>
        <input type="text" id="seasonPass" required placeholder="SP2XXXXXXXX">
      </div>
      
      <div class="form-group">
        <label for="licensePlate">License Plate</label>
        <input type="text" id="licensePlate" required placeholder="ABC123">
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="targetDate">Target Date</label>
          <input type="date" id="targetDate" required>
        </div>
        
        <div class="form-group">
          <label for="interval">Check Every</label>
          <select id="interval">
            <option value="1">1 minute</option>
            <option value="2">2 minutes</option>
            <option value="5" selected>5 minutes</option>
            <option value="10">10 minutes</option>
          </select>
        </div>
      </div>
      
      <div class="button-row">
        <button type="submit" id="start-btn">Start Monitoring</button>
        <button type="button" id="stop-btn" disabled>Stop</button>
      </div>
    </form>
    
    <div class="log-section">
      <h3>Status Log</h3>
      <div id="log" class="log-area"></div>
    </div>
  </div>
  
  <script src="app.js"></script>
</body>
</html>
```

---

## Component 5: Renderer CSS

**File:** `src/renderer/styles.css`

**Design Guidelines:**
- macOS-native feel
- System font (SF Pro via -apple-system)
- Subtle shadows and rounded corners
- Color scheme: White background, blue accent (#007AFF)
- Status colors: idle (gray), monitoring (blue), success (green), error (red)

**Key Styles:**
- `.container`: padding 24px, max-width centered
- `.form-group`: margin-bottom 16px, label above input
- `input, select`: full width, 40px height, rounded 8px
- `button`: 44px height, rounded 8px, bold text
- `.log-area`: 200px height, monospace font, scrollable, dark bg (#1a1a1a)
- `.status`: pill shape, colored based on state

---

## Component 6: Renderer JavaScript

**File:** `src/renderer/app.js`

**Responsibilities:**
1. Load saved credentials on startup
2. Handle form submission (save creds + start monitor)
3. Handle stop button
4. Listen for status updates and append to log
5. Update status indicator

**Key Functions:**

```javascript
// On page load
async function init() {
  const creds = await window.alta.loadCredentials();
  if (creds.email) {
    document.getElementById('email').value = creds.email;
    document.getElementById('password').value = creds.password || '';
    document.getElementById('seasonPass').value = creds.seasonPass || '';
    document.getElementById('licensePlate').value = creds.licensePlate || '';
  }
  
  // Set default date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('targetDate').value = tomorrow.toISOString().split('T')[0];
  
  // Listen for status updates
  window.alta.onStatus(handleStatus);
}

function handleStatus({ type, message, timestamp }) {
  appendLog(message);
  updateStatusIndicator(type);
}

function appendLog(message) {
  const log = document.getElementById('log');
  const time = new Date().toLocaleTimeString();
  log.innerHTML += `<div>[${time}] ${message}</div>`;
  log.scrollTop = log.scrollHeight;
}

function updateStatusIndicator(type) {
  const indicator = document.getElementById('status-indicator');
  indicator.className = 'status ' + type;
  const labels = {
    idle: 'Idle',
    checking: 'Checking...',
    monitoring: 'Monitoring',
    success: 'Booked!',
    error: 'Error'
  };
  indicator.textContent = labels[type] || type;
}

async function handleSubmit(e) {
  e.preventDefault();
  
  const config = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value,
    seasonPass: document.getElementById('seasonPass').value,
    licensePlate: document.getElementById('licensePlate').value,
    targetDate: document.getElementById('targetDate').value,
    intervalMinutes: parseInt(document.getElementById('interval').value),
  };
  
  // Save credentials
  await window.alta.saveCredentials(config);
  
  // Start monitoring
  const result = await window.alta.startMonitor(config);
  
  if (result.success) {
    document.getElementById('start-btn').disabled = true;
    document.getElementById('stop-btn').disabled = false;
    setFormDisabled(true);
  } else {
    appendLog('Error: ' + result.error);
  }
}

async function handleStop() {
  await window.alta.stopMonitor();
  document.getElementById('start-btn').disabled = false;
  document.getElementById('stop-btn').disabled = true;
  setFormDisabled(false);
  updateStatusIndicator('idle');
}
```

---

## Component 7: Monitor Logic

**File:** `src/monitor/parking.js`

**Adapted from CLI version with these changes:**
- Export as module, not standalone script
- Accept callback for status updates instead of console.log
- Support abort signal for stopping
- Use playwright-core with explicit executablePath

**Interface:**

```javascript
/**
 * Start monitoring for parking availability
 * @param {Object} config
 * @param {string} config.email
 * @param {string} config.password
 * @param {string} config.seasonPass
 * @param {string} config.licensePlate
 * @param {string} config.targetDate - YYYY-MM-DD
 * @param {number} config.intervalMs - Check interval in milliseconds
 * @param {string} config.chromiumPath - Path to bundled Chromium
 * @param {Function} onStatus - Callback: (type, message) => void
 * @param {AbortSignal} signal - For cancellation
 * @returns {Promise<{booked: boolean}>}
 */
async function startMonitor(config, onStatus, signal) {
  // Implementation
}

module.exports = { startMonitor };
```

**Status Types:**
- `checking` - Currently checking the site
- `monitoring` - Waiting for next check
- `available` - Spot found, attempting to book
- `success` - Successfully booked
- `error` - Error occurred (will retry)

---

## Build & Packaging

**File:** `electron-builder.json`

```json
{
  "appId": "com.alta.parking-monitor",
  "productName": "Alta Parking Monitor",
  "directories": {
    "output": "dist"
  },
  "files": [
    "src/**/*",
    "package.json"
  ],
  "mac": {
    "category": "public.app-category.utilities",
    "target": [
      {
        "target": "dmg",
        "arch": ["arm64", "x64"]
      }
    ],
    "icon": "assets/icon.icns"
  },
  "dmg": {
    "title": "Alta Parking Monitor",
    "contents": [
      { "x": 130, "y": 220 },
      { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
    ]
  },
  "extraResources": [
    {
      "from": "chromium-bundle/",
      "to": "chromium",
      "filter": ["**/*"]
    }
  ]
}
```

**Note on Chromium bundling:**
We'll download Playwright's Chromium to `chromium-bundle/` and include it as an extra resource. The monitor will reference it via `app.getPath('userData')` or similar.
