// Deterministic gameplay-logic check (independent of headless frame rate).
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?bot', { waitUntil: 'load' });
await page.waitForTimeout(1500);

const res = await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  const out = {};

  // --- kill test: enemy dead ahead, fire and simulate dagger flight ---
  g.enemies.reset(); g.weapons.reset();
  g.kills = 0; g.gemCount = 0; g.level = 0; g.shotsHit = 0; g.weapons.shotsFired = 0;
  const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  g.enemies.spawn(0, p.pos.x + fx * 4, p.pos.z + fz * 4); // skull 4 units ahead
  const eye = p.eye, fwd = p.forward();
  for (let s = 0; s < 4; s++) g.weapons.fire(eye, fwd, true, true, 0.016, 2); // 4 shotgun blasts
  out.shotsFired = g.weapons.shotsFired;
  for (let i = 0; i < 80; i++) { g.weapons.update(0.02, () => null); g._daggerEnemy(); }
  out.killsAfterFire = g.kills;
  out.gemsDropped = g.gems.alive.reduce((a, b) => a + b, 0);

  // --- gem collect + upgrade test ---
  g.enemies.reset();
  // drop 30 gems on top of the player and collect
  for (let i = 0; i < 30; i++) g.gems.spawn(p.pos.x, p.pos.y + 1, p.pos.z);
  for (let i = 0; i < 30; i++) g.gems.update(0.05, p, i * 0.05);
  out.gemCount = g.gemCount;
  out.level = g.level; // expect >=1 after >=10 gems

  // --- death test ---
  g.state = 1; // PLAYING
  g.die();
  out.stateAfterDie = g.state; // expect 2 (DYING)
  g.dyingTimer = 0; g._updatePlay(0.016);
  out.stateAfterFinish = g.state; // expect 3 (DEAD)
  out.best = g.best;

  return out;
});

console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
console.log(JSON.stringify(res, null, 2));
await browser.close();
