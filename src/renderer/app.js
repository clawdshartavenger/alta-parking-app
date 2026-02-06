// Alta Parking Monitor - Renderer UI Logic

// DOM Elements
const form = document.getElementById('config-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const seasonPassInput = document.getElementById('seasonPass');
const licensePlateInput = document.getElementById('licensePlate');
const targetDateInput = document.getElementById('targetDate');
const intervalSelect = document.getElementById('interval');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const logArea = document.getElementById('log');
const statusIndicator = document.getElementById('status-indicator');

// Initialize on page load
async function init() {
  // Load saved credentials from Keychain
  try {
    const creds = await window.alta.loadCredentials();
    if (creds.email) {
      emailInput.value = creds.email;
      passwordInput.value = creds.password || '';
      seasonPassInput.value = creds.seasonPass || '';
      licensePlateInput.value = creds.licensePlate || '';
    }
  } catch (err) {
    appendLog('Failed to load saved credentials', 'error');
  }
  
  // Set default date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  targetDateInput.value = tomorrow.toISOString().split('T')[0];
  
  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];
  targetDateInput.min = today;
  
  // Listen for status updates from main process
  window.alta.onStatus(handleStatus);
  
  // Event listeners
  form.addEventListener('submit', handleSubmit);
  stopBtn.addEventListener('click', handleStop);
  
  appendLog('Ready to monitor Alta parking', 'info');
}

// Handle status updates from monitor
function handleStatus({ type, message, timestamp }) {
  appendLog(message, type);
  updateStatusIndicator(type);
}

// Append message to log area
function appendLog(message, type = 'info') {
  const logEntry = document.createElement('div');
  logEntry.className = `log-${type}`;
  
  const time = new Date().toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
  
  logEntry.textContent = `[${time}] ${message}`;
  logArea.appendChild(logEntry);
  
  // Auto-scroll to bottom
  logArea.scrollTop = logArea.scrollHeight;
}

// Update status indicator pill
function updateStatusIndicator(type) {
  const labels = {
    idle: 'Idle',
    checking: 'Checking...',
    monitoring: 'Monitoring',
    available: 'Spot Found!',
    success: 'Booked!',
    error: 'Error'
  };
  
  statusIndicator.className = 'status ' + type;
  statusIndicator.textContent = labels[type] || type;
}

// Set form fields enabled/disabled
function setFormDisabled(disabled) {
  emailInput.disabled = disabled;
  passwordInput.disabled = disabled;
  seasonPassInput.disabled = disabled;
  licensePlateInput.disabled = disabled;
  targetDateInput.disabled = disabled;
  intervalSelect.disabled = disabled;
}

// Handle form submission - start monitoring
async function handleSubmit(e) {
  e.preventDefault();
  
  const config = {
    email: emailInput.value.trim(),
    password: passwordInput.value,
    seasonPass: seasonPassInput.value.trim().toUpperCase(),
    licensePlate: licensePlateInput.value.trim().toUpperCase(),
    targetDate: targetDateInput.value,
    intervalMinutes: parseInt(intervalSelect.value, 10),
  };
  
  // Validate
  if (!config.email || !config.password || !config.seasonPass || !config.licensePlate || !config.targetDate) {
    appendLog('Please fill in all fields', 'error');
    return;
  }
  
  // Save credentials to Keychain
  try {
    await window.alta.saveCredentials({
      email: config.email,
      password: config.password,
      seasonPass: config.seasonPass,
      licensePlate: config.licensePlate,
    });
    appendLog('Credentials saved securely', 'info');
  } catch (err) {
    appendLog('Failed to save credentials: ' + err.message, 'error');
  }
  
  // Start monitoring
  appendLog(`Starting to monitor for ${config.targetDate}...`, 'info');
  
  try {
    const result = await window.alta.startMonitor(config);
    
    if (result.success) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      setFormDisabled(true);
      updateStatusIndicator('monitoring');
      appendLog(`Monitoring every ${config.intervalMinutes} minute(s)`, 'info');
    } else {
      appendLog('Error: ' + result.error, 'error');
      updateStatusIndicator('error');
    }
  } catch (err) {
    appendLog('Failed to start monitor: ' + err.message, 'error');
    updateStatusIndicator('error');
  }
}

// Handle stop button
async function handleStop() {
  appendLog('Stopping monitor...', 'info');
  
  try {
    await window.alta.stopMonitor();
    appendLog('Monitoring stopped', 'info');
  } catch (err) {
    appendLog('Error stopping monitor: ' + err.message, 'error');
  }
  
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setFormDisabled(false);
  updateStatusIndicator('idle');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
