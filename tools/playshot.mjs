// Inject a combat scenario and screenshot it (headless GPU is too slow to let
// the director ramp in real time). Usage: node tools/playshot.mjs out.png [settleMs]
import { chromium } from 'playwright';

const out = process.argv[2] || 'play.png';
const settle = parseInt(process.argv[3] || '1500', 10);
const url = 'http://localhost:5173/?bot';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
await page.goto(url, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  const g = window.__game;
  if (!g) return;
  g.enemies.intensity = 0.55;
  // disable the bot's auto-fire for a clean composed shot; we'll fire manually
  const p = g.player;
  const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
  const types = [0, 1, 2, 3, 0, 1, 1, 0];
  for (let i = 0; i < types.length; i++) {
    const fwd = 8 + (i % 4) * 4;
    const side = ((i % 4) - 1.5) * 4;
    g.enemies.spawn(types[i], p.pos.x + fx * fwd + rx * side, p.pos.z + fz * fwd + rz * side);
  }
  // pop a few enemies to full scale + fire daggers
  g.enemies.active.forEach((e) => e.mesh.scale.setScalar(1));
  for (let k = 0; k < 6; k++) {
    g.weapons.fire(g.player.eye, g.player.forward(), true, true, 0.016, 2);
  }
});
await page.waitForTimeout(settle);
await page.screenshot({ path: out });
await browser.close();
console.log(logs.join('\n') || '(no errors)');
console.log('saved', out);
