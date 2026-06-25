import { chromium } from 'playwright';
const out = process.argv[2] || 'death.png';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?bot', { waitUntil: 'load' });
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const g = window.__game;
  g.time = 73.5234; g.kills = 128; g.gemCount = 215; g.level = 4;
  g.weapons.shotsFired = 940; g.shotsHit = 523; g.best = 40.1;
  g._finishDeath();
});
await page.waitForTimeout(700);
await page.screenshot({ path: out });
await browser.close();
console.log('errors:', errs.join('|') || 'none');
console.log('saved', out);
