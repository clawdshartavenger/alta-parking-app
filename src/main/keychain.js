/**
 * Keychain integration for securely storing credentials
 * Uses keytar for macOS Keychain access
 */

const keytar = require('keytar');
const SERVICE = 'alta-parking-monitor';

/**
 * Save credentials to macOS Keychain
 * @param {Object} creds
 * @param {string} creds.email
 * @param {string} creds.password
 * @param {string} creds.seasonPass
 * @param {string} creds.licensePlate
 */
async function saveCredentials({ email, password, seasonPass, licensePlate }) {
  await keytar.setPassword(SERVICE, 'email', email);
  await keytar.setPassword(SERVICE, 'password', password);
  await keytar.setPassword(SERVICE, 'seasonPass', seasonPass);
  await keytar.setPassword(SERVICE, 'licensePlate', licensePlate);
}

/**
 * Load credentials from macOS Keychain
 * @returns {Object} Credentials object (values may be null if not found)
 */
async function loadCredentials() {
  return {
    email: await keytar.getPassword(SERVICE, 'email'),
    password: await keytar.getPassword(SERVICE, 'password'),
    seasonPass: await keytar.getPassword(SERVICE, 'seasonPass'),
    licensePlate: await keytar.getPassword(SERVICE, 'licensePlate'),
  };
}

/**
 * Clear all stored credentials from Keychain
 */
async function clearCredentials() {
  await keytar.deletePassword(SERVICE, 'email');
  await keytar.deletePassword(SERVICE, 'password');
  await keytar.deletePassword(SERVICE, 'seasonPass');
  await keytar.deletePassword(SERVICE, 'licensePlate');
}

module.exports = { saveCredentials, loadCredentials, clearCredentials };
