/**
 * Alta Parking Monitor - Module Version
 * 
 * Monitors reserve.altaparking.com for parking cancellations
 * and automatically books when a spot becomes available.
 */

const { chromium } = require('playwright-core');

/**
 * Start monitoring for parking availability
 * @param {Object} config
 * @param {string} config.email
 * @param {string} config.password
 * @param {string} config.seasonPass
 * @param {string} config.licensePlate
 * @param {string} config.targetDate - YYYY-MM-DD
 * @param {number} config.intervalMs - Check interval in milliseconds
 * @param {string} [config.chromiumPath] - Path to bundled Chromium (optional)
 * @param {Function} onStatus - Callback: (type, message) => void
 *   type: 'checking' | 'monitoring' | 'available' | 'success' | 'error'
 * @param {AbortSignal} signal - For cancellation
 * @returns {Promise<{booked: boolean}>}
 */
async function startMonitor(config, onStatus, signal) {
  const { email, password, seasonPass, licensePlate, targetDate, intervalMs, chromiumPath } = config;
  
  // Validate required config
  const required = { email, password, seasonPass, licensePlate, targetDate };
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      onStatus('error', `Missing required config: ${key}`);
      return { booked: false };
    }
  }

  onStatus('monitoring', `Starting monitor for ${targetDate} (checking every ${Math.round(intervalMs / 60000)} min)`);

  // Main monitoring loop
  while (!signal.aborted) {
    try {
      const result = await checkAndBook(config, onStatus);
      
      if (result.booked) {
        onStatus('success', `Successfully booked parking for ${targetDate}!`);
        return { booked: true };
      }
      
      if (signal.aborted) break;
      
      onStatus('monitoring', `Next check in ${Math.round(intervalMs / 60000)} minute(s)...`);
      
      // Wait for interval or abort
      await waitWithAbort(intervalMs, signal);
      
    } catch (err) {
      if (signal.aborted) break;
      onStatus('error', `Error during check: ${err.message}`);
      
      // Wait before retry on error
      await waitWithAbort(intervalMs, signal);
    }
  }

  onStatus('monitoring', 'Monitor stopped');
  return { booked: false };
}

/**
 * Wait for specified time or until signal is aborted
 */
function waitWithAbort(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    
    const timeout = setTimeout(resolve, ms);
    
    const abortHandler = () => {
      clearTimeout(timeout);
      resolve();
    };
    
    signal.addEventListener('abort', abortHandler, { once: true });
  });
}

/**
 * Perform a single check and booking attempt
 */
async function checkAndBook(config, onStatus) {
  const { email, password, seasonPass, licensePlate, targetDate, chromiumPath } = config;
  
  onStatus('checking', `Checking availability for ${targetDate}...`);
  
  // Build launch options
  const launchOptions = { headless: true };
  
  // Use bundled Chromium if provided, otherwise let playwright-core find one
  if (chromiumPath) {
    launchOptions.executablePath = chromiumPath;
  }
  
  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (err) {
    // If launch fails and we have a chromiumPath, try without it as fallback
    if (chromiumPath) {
      onStatus('error', `Failed to launch bundled Chromium, trying system browser...`);
      browser = await chromium.launch({ headless: true });
    } else {
      throw err;
    }
  }
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Navigate to the reservation site
    await page.goto('https://reserve.altaparking.com', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    // Check if we need to log in
    const loginButton = await page.$('button:has-text("Log In"), a:has-text("Log In"), button:has-text("Sign In")');
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    
    if (loginButton || emailInput) {
      onStatus('checking', 'Logging in...');
      
      // Click login if it's a button/link first
      if (loginButton) {
        await loginButton.click();
        await page.waitForTimeout(1500);
      }
      
      // Fill credentials
      await page.fill('input[type="email"], input[name="email"]', email);
      await page.fill('input[type="password"], input[name="password"]', password);
      
      // Submit
      await page.click('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")');
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle');
    }
    
    onStatus('checking', 'Looking for target date...');
    
    // Navigate calendar to correct month if needed
    let attempts = 0;
    const maxAttempts = 12;
    
    while (attempts < maxAttempts) {
      // Look for the target date on the current calendar view
      const dateSelector = `[data-date="${targetDate}"], ` +
                          `[aria-label*="${targetDate}"]`;
      
      let dateElement = await page.$(dateSelector);
      
      // If not found by data attribute, try finding by day number
      if (!dateElement) {
        const targetDay = new Date(targetDate + 'T12:00:00').getDate();
        const dayElements = await page.$$(`button:has-text("${targetDay}"), td:has-text("${targetDay}"), .day:has-text("${targetDay}")`);
        
        // Find the exact day match (not "12" matching "120")
        for (const el of dayElements) {
          const text = await el.innerText();
          if (text.trim() === String(targetDay)) {
            dateElement = el;
            break;
          }
        }
      }
      
      if (dateElement) {
        // Check if this date is clickable/available (not disabled)
        const isDisabled = await dateElement.getAttribute('disabled');
        const classList = await dateElement.getAttribute('class') || '';
        
        if (isDisabled || classList.includes('disabled') || classList.includes('sold-out')) {
          onStatus('checking', `${targetDate} found but SOLD OUT`);
          await browser.close();
          return { available: false, booked: false, status: 'sold_out' };
        }
        
        // Try to click the date
        onStatus('checking', `Found ${targetDate} - selecting...`);
        await dateElement.click();
        await page.waitForTimeout(2000);
        break;
      }
      
      // Date not found - try next month
      const nextButton = await page.$('button:has-text("Next"), button:has-text(">"), .next-month, [aria-label="Next month"]');
      if (nextButton) {
        await nextButton.click();
        await page.waitForTimeout(1000);
      }
      attempts++;
    }
    
    // Check current page state for availability
    const pageText = await page.innerText('body').catch(() => '');
    
    // Look for sold out / unavailable indicators
    const soldOutPatterns = [
      /sold\s*out/i,
      /no\s*(spots?|parking)\s*available/i,
      /fully\s*booked/i,
      /unavailable/i,
      /waitlist/i,
    ];
    
    for (const pattern of soldOutPatterns) {
      if (pattern.test(pageText)) {
        onStatus('checking', `${targetDate}: No parking available`);
        await browser.close();
        return { available: false, booked: false, status: 'sold_out' };
      }
    }
    
    // Look for booking button
    const bookButton = await page.$('button:has-text("Reserve"), button:has-text("Book"), button:has-text("Add to Cart"), button:has-text("Select")');
    
    if (bookButton) {
      onStatus('available', `SPOT AVAILABLE for ${targetDate}! Attempting to book...`);
      
      // Attempt to book
      await bookButton.click();
      await page.waitForTimeout(2000);
      
      // Fill in season pass if prompted
      const passInput = await page.$('input[name*="pass"], input[placeholder*="pass"], input[name*="code"]');
      if (passInput) {
        await passInput.fill(seasonPass);
        onStatus('available', 'Entered season pass...');
      }
      
      // Fill in license plate if prompted
      const plateInput = await page.$('input[name*="plate"], input[name*="license"], input[placeholder*="plate"]');
      if (plateInput) {
        await plateInput.fill(licensePlate);
        onStatus('available', 'Entered license plate...');
      }
      
      // Look for confirm/submit button
      const confirmButton = await page.$('button:has-text("Confirm"), button:has-text("Complete"), button:has-text("Submit"), button[type="submit"]');
      if (confirmButton) {
        await confirmButton.click();
        await page.waitForTimeout(3000);
        
        // Check for success
        const successText = await page.innerText('body').catch(() => '');
        if (/confirm|success|booked|reserved|thank\s*you/i.test(successText)) {
          await browser.close();
          return { available: true, booked: true };
        }
      }
      
      onStatus('error', 'Spot was available but auto-booking may have failed. Check manually!');
      await browser.close();
      return { available: true, booked: false };
    }
    
    onStatus('checking', `No parking available for ${targetDate}`);
    await browser.close();
    return { available: false, booked: false, status: 'not_found' };
    
  } catch (err) {
    await browser.close();
    throw err;
  }
}

module.exports = { startMonitor };
