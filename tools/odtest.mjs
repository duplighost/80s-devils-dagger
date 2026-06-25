// Verify score, multiplier, overdrive, heavy blast, and the neon bomb.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 800, height: 450 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?bot', { waitUntil: 'load' });
await page.waitForTimeout(1600);

const res = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  g.enemies.reset(); g.weapons.reset(); g.hazards.reset();
  g.score = 0; g.combo = 0; g.mult = 1; g.overdrive = 0; g.kills = 0; g.shotsHit = 0; g.weapons.shotsFired = 0; g.level = 2;

  const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (let i = 0; i < 3; i++) g.enemies.spawn(0, p.pos.x + fx * 4 + (i - 1) * 1.4, p.pos.z + fz * 4);
  for (let s = 0; s < 6; s++) g.weapons.fire(p.eye, p.forward(), true, true, 0.016, 2);
  for (let i = 0; i < 90; i++) { g.weapons.update(0.02, () => null); g._daggerEnemy(); }
  const afterKills = { score: g.score, overdrive: g.overdrive, mult: g.mult, kills: g.kills };

  // heavy blast
  g.overdrive = 60; g.weapons.reset(); g.weapons.shotsFired = 0; g.heavyCd = 0;
  g._heavyBlast();
  const heavy = { fired: g.weapons.shotsFired, overdriveAfter: g.overdrive };

  // bomb
  g.enemies.reset(); g.hazards.reset();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; g.enemies.spawn(i % 4, Math.cos(a) * 9, Math.sin(a) * 9); }
  g.hazards.bullet(0, 1.6, 0, 1, 0, 0);
  const bulletsBefore = g.hazards.bAlive.reduce((a, b) => a + b, 0);
  g.overdrive = 100; g.state = 1;
  const before = g.enemies.count();
  g._bomb();
  const bomb = { enemiesBefore: before, enemiesAfter: g.enemies.count(), bulletsBefore, bulletsAfter: g.hazards.bAlive.reduce((a, b) => a + b, 0), overdriveAfterBombKills: g.overdrive };

  return { afterKills, heavy, bomb };
});

console.log('errors:', errs.length ? errs.join('\n') : 'none');
console.log(JSON.stringify(res, null, 1));
await b.close();
