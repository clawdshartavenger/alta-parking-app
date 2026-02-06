# Alta Parking App - Architecture

## Overview

A macOS Electron app that monitors Alta ski area parking (reserve.altaparking.com) for cancellations and auto-books when spots open.

## User Flow

1. User downloads `AltaParkingMonitor.dmg`
2. Drags app to Applications folder
3. Opens app → sees main window
4. Enters credentials:
   - Email (Honkmobile account)
   - Password
   - Season pass code (e.g., SP2XXXXXXXX)
   - License plate
   - Target date (date picker)
   - Check interval (dropdown: 1, 2, 5, 10 min)
5. Clicks "Start Monitoring"
6. App shows real-time status log
7. When spot found → auto-books → shows success notification
8. Credentials saved securely for next launch

## Project Structure

```
alta-parking-app/
├── package.json
├── electron-builder.json      # Build config for .dmg
├── src/
│   ├── main/
│   │   ├── index.js           # Electron main process
│   │   ├── keychain.js        # macOS Keychain integration
│   │   └── preload.js         # Secure bridge to renderer
│   ├── renderer/
│   │   ├── index.html         # Main window HTML
│   │   ├── styles.css         # App styling
│   │   └── app.js             # UI logic
│   └── monitor/
│       └── parking.js         # Playwright monitor logic
├── assets/
│   ├── icon.icns              # macOS app icon
│   └── icon.png               # Source icon
└── docs/
    ├── ARCHITECTURE.md        # This file
    └── COMPONENTS.md          # Component specs
```

## Components

### 1. Main Process (`src/main/index.js`)

Electron main process responsibilities:
- Create browser window (800x600, not resizable initially)
- Load renderer HTML
- Handle IPC messages from renderer
- Spawn/manage monitor process
- Access Keychain via native module
- Show native macOS notifications

Key IPC channels:
- `save-credentials` - Store creds in Keychain
- `load-credentials` - Retrieve creds from Keychain
- `start-monitor` - Begin monitoring with given config
- `stop-monitor` - Stop monitoring
- `monitor-status` - Status updates from monitor → renderer

### 2. Preload Script (`src/main/preload.js`)

Secure bridge between main and renderer:
- Exposes limited API via `contextBridge`
- No direct Node.js access in renderer (security)

Exposed API:
```javascript
window.alta = {
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  loadCredentials: () => ipcRenderer.invoke('load-credentials'),
  startMonitor: (config) => ipcRenderer.invoke('start-monitor', config),
  stopMonitor: () => ipcRenderer.invoke('stop-monitor'),
  onStatus: (callback) => ipcRenderer.on('monitor-status', callback),
}
```

### 3. Keychain Integration (`src/main/keychain.js`)

Use `keytar` package for macOS Keychain:
- Service name: `com.alta.parking-monitor`
- Store: email, password, seasonPass, licensePlate
- Secure storage, survives app updates

### 4. Renderer UI (`src/renderer/`)

Simple, clean UI with:
- Form fields for credentials
- Date picker for target date
- Interval dropdown
- Start/Stop button
- Status log area (scrolling)
- Visual status indicator (idle/monitoring/success/error)

Design:
- macOS-native feel (SF Pro font, subtle shadows)
- Light theme
- Compact layout (~800x600)

### 5. Monitor Logic (`src/monitor/parking.js`)

Adapted from CLI version:
- Exported as module (not standalone script)
- Takes config object, returns event emitter or callbacks
- Emits: 'checking', 'status', 'available', 'booked', 'error'
- Uses Playwright with bundled Chromium
- Runs headless (no visible browser)

Key function:
```javascript
async function startMonitor(config, onStatus) {
  // config: { email, password, seasonPass, licensePlate, targetDate, intervalMs }
  // onStatus: (type, message) => void
}
```

## Dependencies

```json
{
  "dependencies": {
    "playwright-core": "^1.41.0",  // Core only, we bundle chromium separately
    "keytar": "^7.9.0"             // macOS Keychain
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0",
    "@aspect-build/playwright": "^0.0.0"  // Or bundle chromium manually
  }
}
```

Note: We use `playwright-core` (no bundled browsers) and bundle Chromium separately to control app size.

## Build Configuration

electron-builder.json:
```json
{
  "appId": "com.alta.parking-monitor",
  "productName": "Alta Parking Monitor",
  "mac": {
    "category": "public.app-category.utilities",
    "target": "dmg",
    "icon": "assets/icon.icns"
  },
  "dmg": {
    "title": "Alta Parking Monitor"
  },
  "extraResources": [
    {
      "from": "chromium/",
      "to": "chromium"
    }
  ]
}
```

## IPC Message Flow

```
Renderer                    Main Process                 Monitor
   |                            |                           |
   |-- save-credentials ------->|                           |
   |                            |-- keytar.setPassword ---->|
   |                            |                           |
   |-- start-monitor ---------->|                           |
   |                            |-- spawn monitor --------->|
   |                            |                           |
   |<-- monitor-status ---------|<-- status callback -------|
   |<-- monitor-status ---------|<-- status callback -------|
   |                            |                           |
   |-- stop-monitor ----------->|                           |
   |                            |-- abort signal ---------->|
```

## Error Handling

- Network errors: Retry after interval, show in status log
- Login failures: Show error, prompt to re-enter credentials
- Booking failures: Show alert, suggest manual booking
- Chromium crash: Restart monitor automatically

## Security Considerations

- Credentials stored in macOS Keychain (encrypted at rest)
- No credentials in plain text files
- contextIsolation enabled (renderer can't access Node directly)
- No remote content loaded
