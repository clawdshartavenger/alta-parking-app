# Alta Parking Monitor 🎿

A macOS app that monitors [Alta ski area parking reservations](https://reserve.altaparking.com) for cancellations and automatically books when a spot opens up.

![Alta Parking Monitor Screenshot](docs/screenshot.png)

## Features

- **Simple GUI** - No command line needed, just fill in your credentials
- **Auto-booking** - Automatically books when a spot becomes available
- **Native notifications** - Get a macOS notification when parking is booked
- **Secure storage** - Credentials stored in macOS Keychain
- **Configurable** - Set check interval from 1-10 minutes

## Installation

1. Download the latest `.dmg` from [Releases](https://github.com/clawdshartavenger/alta-parking-app/releases)
2. Open the `.dmg` and drag "Alta Parking Monitor" to Applications
3. Open the app from Applications
4. On first run, the app will download a browser component (~150MB) - this only happens once

### Troubleshooting: "App is damaged" error

Since the app isn't signed with an Apple Developer certificate, macOS may block it. To fix:

```bash
xattr -cr /Applications/Alta\ Parking\ Monitor.app
```

Or right-click the app → Open → click "Open" in the dialog.

## Usage

1. **Enter your credentials:**
   - Email (your Honkmobile account)
   - Password
   - Season Pass code (e.g., `SP2XXXXXXXX`)
   - License Plate

2. **Select your target date** using the date picker

3. **Choose check interval** (how often to check for openings)

4. **Click "Start Monitoring"**

5. Leave the app running - it will check periodically and book automatically when a spot opens

### Finding Your Season Pass Code

1. Log into [reserve.altaparking.com](https://reserve.altaparking.com)
2. Go to your account/passes section
3. Your season pass code looks like `SP2XXXXXXXX`

## How It Works

The app uses a headless browser to:
1. Log into your Honkmobile account
2. Navigate to the parking calendar
3. Check if your target date has availability
4. If a spot opens (cancellation), immediately attempt to book
5. Fill in your season pass and license plate
6. Complete the reservation

## Requirements

- macOS 10.12 or later
- Apple Silicon (M1/M2/M3) Mac
- Active internet connection
- Valid Honkmobile account with Alta season pass

## Building from Source

```bash
# Clone the repo
git clone https://github.com/clawdshartavenger/alta-parking-app.git
cd alta-parking-app

# Install dependencies
npm install

# Run in development mode
npm start

# Build .dmg
npm run build:mac
```

## Privacy & Security

- Credentials are stored locally in your macOS Keychain
- No data is sent to any server except Alta/Honkmobile
- The app runs entirely on your computer
- Browser automation runs headless (invisible)

## Disclaimer

This is an unofficial tool. Use at your own risk. Alta may change their website at any time, which could break the app. The developers are not responsible for missed reservations or any other issues.

## License

MIT

## Credits

Built with [Electron](https://www.electronjs.org/) and [Playwright](https://playwright.dev/).
