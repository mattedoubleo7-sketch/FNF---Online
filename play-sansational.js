const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, 'FNF - Offline.html');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--allow-file-access-from-files',
      '--disable-web-security',
      '--start-maximized'
    ]
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[page error]', msg.text());
  });

  console.log('Opening:', fileUrl);
  await page.goto(fileUrl);

  await page.waitForFunction(() => typeof window.SONGS !== 'undefined' && typeof window.selectSong === 'function', { timeout: 20000 }).catch(() => {});

  await page.evaluate(() => {
    if (typeof window.selectSong === 'function' && window.SONGS && window.SONGS.sansational) {
      window.selectSong('sansational');
      console.log('Selected sansational');
    } else {
      console.log('selectSong or sansational not ready; pick it manually');
    }
  });

  console.log('\n=== Ready ===');
  console.log('Sansational pre-selected (if available). Click the page to start audio,');
  console.log('then play. Close the browser window when done.');

  page.on('close', () => { browser.close().catch(() => {}); process.exit(0); });
  context.on('close', () => { browser.close().catch(() => {}); process.exit(0); });
  browser.on('disconnected', () => process.exit(0));
})();
