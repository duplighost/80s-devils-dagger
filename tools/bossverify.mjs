// Verify a roster boss (logic + screenshot). Usage: node tools/bossverify.mjs out.png <idx 0|1|2>
import { chromium } from 'playwright';
const out = process.argv[2] || 'boss.png';
const idx = parseInt(process.argv[3] || '1', 10);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5173/?bot', { waitUntil: 'load' });
await page.waitForTimeout(1800);

const logic = await page.evaluate((idx) => {
  const g = window.__game;
  g.enemies.intensity = 0.7;
  g.bossIdx = idx; g._spawnBoss();
  const boss = g.boss;
  const r = { name: boss.name, maxHp: boss.maxHp };
  let t = 0;
  for (let k = 0; k < 90; k++) { t += 0.05; boss.update(0.05, g.player, t); }
  r.bulletsLive = g.hazards.bAlive.reduce((a, b) => a + b, 0);

  if (boss.shards) { // OVERSEER: break shards -> expose -> kill core
    boss.shards.forEach((s) => boss.damage({ kind: 'shard', shard: s }, 99, s.mesh.position.x, s.mesh.position.y, s.mesh.position.z));
    r.exposedAfterShards = boss.exposed;
    boss.damage({ kind: 'core' }, boss.hp + 1, boss.core.position.x, boss.core.position.y, boss.core.position.z);
  } else { // COLOSSUS: force a slam then kill
    boss.state = 3; boss.timer = 0.001; boss.update(0.05, g.player, t);
    r.ringsLive = g.hazards.rings.filter((x) => x.active).length;
    boss.damage({ kind: 'body' }, boss.hp + 1, boss.pos.x, boss.pos.y, boss.pos.z);
  }
  r.bossNullAfterKill = g.boss === null;
  r.bossActiveCleared = g.director.bossActive === false;

  // i-frame check
  g.player.invuln = 0.3; const before = g.player.invuln; g.player.update(0.1, {}); r.invulnDecrements = g.player.invuln < before;

  // re-spawn for the screenshot and frame it
  g.bossIdx = idx; g._spawnBoss(); const b2 = g.boss; let tt = 0;
  for (let k = 0; k < 70; k++) { tt += 0.05; b2.update(0.05, g.player, tt); }
  if (b2.shards) { for (let k = 0; k < 3; k++) g.hazards.ring(b2.center.x, 1.6, b2.center.z, 12, 7, 0xffcf3a, k); }
  if (!b2.shards) { b2.state = 3; b2.timer = 0.001; b2.update(0.05, g.player, tt); }
  g.hazards.update(0.05, g.player);
  g.state = 4; // PAUSED -> freeze camera control
  const c = b2.shards ? b2.center : b2.pos;
  const cam = g.stage.camera;
  cam.position.set(c.x + 6, c.y + 6, c.z + 17);
  cam.lookAt(c.x, c.y - 1, c.z);
  return r;
}, idx);

await page.waitForTimeout(700);
await page.screenshot({ path: out });
await browser.close();
console.log('errors:', errs.join('|') || 'none');
console.log('logic:', JSON.stringify(logic, null, 1));
console.log('saved', out);
