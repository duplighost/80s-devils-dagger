import { chromium } from 'playwright';
const out = process.argv[2] || 'hud.png';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?bot', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const g = window.__game;
  g.enemies.intensity = 0.55;
  // demo HUD values
  g.score = 24850; g.combo = 17; g.mult = 5; g.overdrive = 100; g.kills = 63; g.gemCount = 88; g.level = 3;
  g.hud.setScore(g.score); g.hud.setKills(g.kills); g.hud.setMult(g.mult);
  g.hud.setOverdrive(1, true); g.hud.setLevel(4); g.hud.setGems(88, 60); g.hud.combo(17); g.hud.setAccuracy(71);
  const p = g.player, fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
  [0, 1, 2, 3, 0, 1].forEach((t, i) => g.enemies.spawn(t, p.pos.x + fx * (8 + i * 3) + rx * ((i % 3 - 1) * 5), p.pos.z + fz * (8 + i * 3) + rz * ((i % 3 - 1) * 5)));
  g.enemies.active.forEach((e) => e.mesh.scale.setScalar(1));
  for (let k = 0; k < 5; k++) g.weapons.fire(p.eye, p.forward(), true, true, 0.016, 3);
});
await page.waitForTimeout(1100);
await page.screenshot({ path: out });
await b.close();
console.log('errors:', errs.join('|') || 'none'); console.log('saved', out);
