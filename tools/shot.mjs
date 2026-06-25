// Headless screenshot + console capture for visual verification.
// Usage: node tools/shot.mjs <outfile.png> [waitMs] [url]
import { chromium } from 'playwright';

const out = process.argv[2] || 'shot.png';
const waitMs = parseInt(process.argv[3] || '2500', 10);
const url = process.argv[4] || 'http://localhost:5173/';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => logs.push(`[GOTO] ${e.message}`));
await page.waitForTimeout(waitMs);
await page.screenshot({ path: out });
await browser.close();

console.log('--- console ---');
console.log(logs.join('\n') || '(no console output)');
console.log('--- saved', out);
