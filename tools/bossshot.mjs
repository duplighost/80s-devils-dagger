import { chromium } from 'playwright';
const out = process.argv[2] || 'boss.png';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?bot', { waitUntil: 'load' });
await page.waitForTimeout(2000);

const logic = await page.evaluate(() => {
  const g = window.__game;
  g.enemies.intensity = 0.7;
  g._spawnBoss();
  // pump updates to grow the serpentine body
  let t = 0;
  for (let k = 0; k < 140; k++) { t += 0.05; g.boss.update(0.05, g.player, t); }
  g.hud.setBoss(g.boss.hp / g.boss.maxHp);
  // sprinkle a few minions + fire
  const p = g.player, fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  for (let i = 0; i < 4; i++) g.enemies.spawn(i % 4, p.pos.x + fx * (7 + i * 3), p.pos.z + fz * (i - 1.5) * 4);
  g.enemies.active.forEach((e) => e.mesh.scale.setScalar(1));
  for (let k = 0; k < 5; k++) g.weapons.fire(g.player.eye, g.player.forward(), true, true, 0.016, 3);

  // ---- logic check: damage boss to death ----
  const startHp = g.boss.hp, maxHp = g.boss.maxHp;
  const head = g.boss.segs[0].mesh.position;
  g.boss.hp = 4; // near death for the test
  g.weapons.reset();
  for (let s = 0; s < 3; s++) g.weapons.fire({ x: head.x, y: head.y, z: head.z }, { x: 0, y: 0, z: 1 }, true, true, 0.016, 3);
  // place daggers right on the head and run collisions
  for (let i = 0; i < g.weapons.alive.length; i++) if (g.weapons.alive[i]) { g.weapons.px[i] = head.x; g.weapons.py[i] = head.y; g.weapons.pz[i] = head.z; }
  g._daggerEnemy();
  const out = { maxHp, startHp, bossAliveAfter: g.boss.alive, bossActiveAfter: g.director.bossActive };

  // re-spawn boss for the screenshot (the test killed it)
  g._spawnBoss();
  let tt = 0; for (let k = 0; k < 140; k++) { tt += 0.05; g.boss.update(0.05, g.player, tt); }
  g.hud.setBoss(g.boss.hp / g.boss.maxHp);
  // freeze loop camera control, aim from player POV at the head
  g.state = 4; // PAUSED -> loop stops touching camera but keeps rendering
  const cam = g.stage.camera;
  let cx = 0, cy = 0, cz = 0; const segs = g.boss.segs;
  segs.forEach((s) => { cx += s.mesh.position.x; cy += s.mesh.position.y; cz += s.mesh.position.z; });
  const n = segs.length; cx /= n; cy /= n; cz /= n;
  cam.position.set(cx + 6, cy + 9, cz + 19);
  cam.lookAt(cx, cy - 1, cz);
  return out;
});

await page.waitForTimeout(700);
await page.screenshot({ path: out });
await browser.close();
console.log('errors:', errs.join('|') || 'none');
console.log('logic:', JSON.stringify(logic));
console.log('saved', out);
