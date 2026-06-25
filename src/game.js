import * as THREE from 'three';
import { Stage } from './renderer.js';
import { World, ARENA_RADIUS } from './world.js';
import { Player } from './player.js';
import { Weapons, LEVELS } from './weapons.js';
import { Enemies, TYPE } from './enemies.js';
import { Leviathan } from './boss.js';
import { BossEye } from './bossEye.js';
import { BossTitan } from './bossTitan.js';
import { Hazards } from './hazards.js';
import { Director } from './director.js';
import { Gems } from './gems.js';
import { Particles } from './particles.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { clamp, damp } from './util.js';
import { HEX } from './palette.js';

const STATE = { TITLE: 0, PLAYING: 1, DYING: 2, DEAD: 3, PAUSED: 4 };
const BEST_KEY = 'neon-daggers-best';
const _cyan = new THREE.Color(HEX.cyan);
const _muzzleDir = new THREE.Vector3();

export class Game {
  constructor(canvas) {
    this.stage = new Stage(canvas);
    this.input = new Input(canvas);
    this.hud = new HUD();
    this.audio = new AudioEngine();

    this.particles = new Particles(this.stage.scene);
    this.world = new World(this.stage.scene);
    this.player = new Player(this.input);
    this.weapons = new Weapons(this.stage.scene);
    this.enemies = new Enemies(this.stage.scene, this.particles);
    this.hazards = new Hazards(this.stage.scene, this.particles);
    this.gems = new Gems(this.stage.scene, this.particles);
    this.director = new Director(this.enemies);

    // boss roster — cycled through over a run
    const lev = new Leviathan(this.stage.scene, this.particles);
    const eye = new BossEye(this.stage.scene, this.particles, this.hazards);
    const titan = new BossTitan(this.stage.scene, this.particles, this.hazards);
    this.bossRoster = [lev, eye, titan];
    this.bossIdx = 0;
    this.boss = null; // the active boss, or null
    for (const b of this.bossRoster) b.onDeath = (pos) => this._onBossDeath(pos);
    eye.onMinion = (n) => this._spawnMinions(n);
    eye.onVolley = () => this.audio.volley();
    titan.onSlam = () => { this.audio.slam(); this.addTrauma(0.4); };

    this.enemies.onKill = (e) => this._onKill(e);
    this.gems.onCollect = (n) => this._onGems(n);
    this.director.onWave = (n) => { this.hud.toast(`WAVE ${n}`); this.audio.wave(); this.addTrauma(0.22); };
    this.director.onBoss = () => this._spawnBoss();

    this.state = STATE.TITLE;
    this.clock = new THREE.Clock();
    this.shaderTime = 0;
    this.time = 0;
    this.trauma = 0;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.desat = 0;

    this.kills = 0;
    this.gemCount = 0;
    this.level = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.shotsHit = 0;
    this.dyingTimer = 0;

    this.best = parseFloat(localStorage.getItem(BEST_KEY) || '0') || 0;
    this._shakeOffset = new THREE.Vector3();
    this._shakeRoll = 0;
    this._deathPos = new THREE.Vector3();
    this._deathRoll = 0;

    this.hud.setBest(this.best);
    this.hud.hideBoot();
    this._bindUI();

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ----------------------------------------------------------------- UI wiring
  _bindUI() {
    document.getElementById('start-btn').addEventListener('click', (e) => { e.stopPropagation(); this.start(); });
    document.getElementById('retry-btn').addEventListener('click', (e) => { e.stopPropagation(); this.restart(); });
    document.getElementById('resume-btn').addEventListener('click', (e) => { e.stopPropagation(); this.input.requestLock(); });
    // click anywhere on the title to begin
    document.getElementById('title').addEventListener('click', () => this.start());

    this.stage.renderer.domElement.addEventListener('click', () => {
      if (this.state === STATE.TITLE) this.start();
      else if (this.state === STATE.PAUSED) this.input.requestLock();
      else if (this.state === STATE.PLAYING && !this.input.locked) this.input.requestLock();
    });

    addEventListener('keydown', (e) => {
      if ((e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter') && this.state === STATE.DEAD) this.restart();
      if (e.code === 'KeyM') { this._muted = !this._muted; this.audio.setMusic(!this._muted); this.hud.toast(this._muted ? 'MUSIC OFF' : 'MUSIC ON'); }
    });

    this.input._onLock = () => { if (this.state === STATE.PAUSED) this.resume(); };
    this.input._onUnlock = () => { if (this.state === STATE.PLAYING) this.pause(); };
  }

  // ----------------------------------------------------------------- lifecycle
  start() {
    if (this.state !== STATE.TITLE) return;
    this.audio.start();
    this.hud.hideTitle();
    this.restart();
  }

  restart() {
    this.player.reset();
    this.weapons.reset();
    this.enemies.reset();
    for (const b of this.bossRoster) b.reset();
    this.boss = null;
    this.hazards.reset();
    this.gems.reset();
    this.particles.reset();
    this.director.reset();
    this.hud.hideBoss();

    this.time = 0; this.kills = 0; this.gemCount = 0; this.level = 0;
    this.combo = 0; this.comboTimer = 0; this.shotsHit = 0;
    this.weapons.shotsFired = 0;
    this.trauma = 0; this.timeScale = 1; this.targetTimeScale = 1; this.desat = 0;
    this.enemies.intensity = 0;

    this.hud.hideDeath();
    this.hud.showHud();
    this.hud.setLevel(1);
    this.hud.setKills(0);
    this.hud.setGems(0, 0);
    this.hud.setAccuracy(100);
    this.hud.setTimer(0);
    this.hud.lowHp(false);

    this.state = STATE.PLAYING;
    this.audio.musicResume();
    this.input.requestLock();
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.hud.showPause();
  }
  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.hud.hidePause();
  }

  die() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.DYING;
    this.player.alive = false;
    this.dyingTimer = 1.7;
    this.targetTimeScale = 0.08;
    this.addTrauma(1.2);
    this.audio.playerDeath();
    const e = this.player.eye;
    this._deathPos.copy(e);
    this.hud.damage();
    this.hud.lowHp(false);
    // supernova
    this.particles.burst(e.x, e.y, e.z, 140, { color: new THREE.Color(HEX.hot), speed: 22, life: 1.3, size: 0.3, drag: 1.6, upBias: 2 });
    this.particles.burst(e.x, e.y, e.z, 80, { color: _cyan, speed: 14, life: 1.0, size: 0.22, drag: 2 });
    this.input.exitLock();
  }

  _finishDeath() {
    this.state = STATE.DEAD;
    const newBest = this.time > this.best;
    if (newBest) { this.best = this.time; localStorage.setItem(BEST_KEY, String(this.best)); this.hud.setBest(this.best); }
    const acc = this.weapons.shotsFired > 0 ? (this.shotsHit / this.weapons.shotsFired) * 100 : 100;
    this.hud.hideHud();
    this.hud.showDeath({
      time: this.time, kills: this.kills, gems: this.gemCount,
      accuracy: acc, level: this.level + 1, verdict: this._verdict(this.time),
      newBest, best: this.best,
    });
  }

  _verdict(t) {
    if (t < 5) return 'rookie';
    if (t < 15) return 'drifter';
    if (t < 30) return 'hunter';
    if (t < 60) return 'slayer';
    if (t < 100) return 'executioner';
    if (t < 160) return 'daggerlord';
    return 'neon god';
  }

  // ----------------------------------------------------------------- events
  _onKill(e) {
    this.kills++;
    this.combo++;
    this.comboTimer = 2.6;
    const p = e.mesh.position;
    this.gems.burst(p.x, p.y, p.z, e.gem);
    this.audio.kill();
    this.addTrauma(e.type === 3 ? 0.35 : 0.1);
    this.hud.combo(this.combo);
    this.hud.setKills(this.kills);
  }

  _spawnBoss() {
    if ((this.boss && this.boss.alive) || this.state !== STATE.PLAYING) return;
    const boss = this.bossRoster[this.bossIdx % this.bossRoster.length];
    this.bossIdx++;
    this.boss = boss;
    boss.spawn(this.player, this.enemies.intensity);
    this.director.bossActive = true;
    this.hud.showBoss(boss.name);
    this.hud.toast(boss.name);
    this.audio.wave();
    this.addTrauma(0.6);
  }

  _spawnMinions(n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 5;
      this.enemies.spawn(TYPE.SWARM, Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  _onBossDeath(pos) {
    const slain = this.boss ? this.boss.name.replace(/[▲ ]/g, '') : 'BOSS';
    this.director.bossActive = false;
    this.boss = null;
    this.hazards.reset();
    this.hud.hideBoss();
    this.hud.toast(`${slain} SLAIN`);
    this.kills += 10;
    this.hud.setKills(this.kills);
    this.gems.burst(pos.x, pos.y, pos.z, 28);
    this.audio.kill(); this.audio.upgrade();
    this.addTrauma(0.8);
    this.targetTimeScale = 0.25;
    setTimeout(() => { if (this.state === STATE.PLAYING) this.targetTimeScale = 1; }, 260);
  }

  _onGems(n) {
    this.gemCount += n;
    this.audio.gem();
    // level ups
    while (this.level < LEVELS.length - 1 && this.gemCount >= LEVELS[this.level + 1].gems) {
      this.level++;
      this.audio.upgrade();
      this.hud.toast(`DAGGER ▲ LVL ${this.level + 1}`);
      this.hud.setLevel(this.level + 1);
      this.addTrauma(0.25);
    }
    this._refreshGemBar();
  }

  _refreshGemBar() {
    let fill = 100;
    if (this.level < LEVELS.length - 1) {
      const lo = LEVELS[this.level].gems, hi = LEVELS[this.level + 1].gems;
      fill = ((this.gemCount - lo) / (hi - lo)) * 100;
    }
    this.hud.setGems(this.gemCount, fill);
  }

  addTrauma(v) { this.trauma = Math.min(1.4, this.trauma + v); }

  // ----------------------------------------------------------------- collisions
  _daggerEnemy() {
    const w = this.weapons, act = this.enemies.active;
    const dmg = LEVELS[this.level].dmg;
    const bossOn = this.boss && this.boss.alive;
    for (let i = 0; i < w.alive.length; i++) {
      if (!w.alive[i]) continue;
      const dx = w.px[i], dy = w.py[i], dz = w.pz[i];
      let consumed = false;
      for (let j = 0; j < act.length; j++) {
        const e = act[j];
        const ex = e.mesh.position.x - dx, ey = e.mesh.position.y - dy, ez = e.mesh.position.z - dz;
        const rr = e.radius + 0.2;
        if (ex * ex + ey * ey + ez * ez < rr * rr) {
          w.kill(i);
          this.shotsHit++;
          this.audio.hit();
          this.enemies.damage(e, dmg, dx, dy, dz);
          consumed = true;
          break;
        }
      }
      if (consumed || !bossOn) continue;
      const seg = this.boss.hitTest(dx, dy, dz);
      if (seg) {
        w.kill(i);
        this.shotsHit++;
        this.audio.hit();
        this.boss.damage(seg, dmg, dx, dy, dz);
      }
    }
  }

  // ----------------------------------------------------------------- main loop
  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.shaderTime += dt;

    this.timeScale = damp(this.timeScale, this.targetTimeScale, 5, dt);
    const beat = this.audio.getBeat();
    const intensity = this.enemies.intensity;
    this.audio.setIntensity(intensity);
    this.world.update(dt, this.shaderTime, intensity, beat);
    this.particles.update(dt * (this.state === STATE.PAUSED ? 0 : this.timeScale));

    if (this.state === STATE.PLAYING || this.state === STATE.DYING) {
      this._updatePlay(dt);
    } else if (this.state === STATE.TITLE) {
      this._titleCamera(dt);
    } else if (this.state === STATE.DEAD) {
      this._deathCamera(dt);
    }
    // PAUSED: leave camera as-is

    // shake + post trauma/desat
    this._computeShake(dt);
    this.desat = damp(this.desat, (this.state === STATE.DYING || this.state === STATE.DEAD) ? 0.55 : 0, 2, dt);
    this.stage.crt.uniforms.uTrauma.value = Math.min(1, this.trauma);
    this.stage.crt.uniforms.uDesat.value = this.desat;

    this.stage.render(this.shaderTime);
    this.input.endFrame();
  }

  _updatePlay(dt) {
    const dying = this.state === STATE.DYING;
    const sdt = dt * this.timeScale;

    if (!dying) {
      // --- player ---
      const ev = {};
      this.player.update(sdt, ev);
      if (ev.dashed) { this.addTrauma(0.12); this.audio.shoot(); }

      // --- shooting ---
      const eye = this.player.eye;
      const fwd = this.player.forward();
      const fired = this.weapons.fire(eye, fwd, this.input.lmb, this.input.lmbPressedThisFrame, sdt, this.level);
      if (fired > 0) {
        this.hud.crosshairFire();
        _muzzleDir.copy(fwd);
        this.particles.cone(eye.x + fwd.x * 0.5, eye.y - 0.15 + fwd.y * 0.5, eye.z + fwd.z * 0.5, _muzzleDir, this.input.lmbPressedThisFrame ? 14 : 4,
          { color: _cyan, speed: this.input.lmbPressedThisFrame ? 18 : 10, life: 0.18, size: 0.16, jitter: 0.5 });
        if (this.input.lmbPressedThisFrame) { this.audio.shotgun(); this.addTrauma(0.14); }
        else { this.audio.shoot(); this.addTrauma(0.025); }
      }

      this.weapons.update(sdt, (px, py, pz, vx, vy, vz) => this.enemies.nearest(px, py, pz, vx, vy, vz));

      let hit = this.enemies.update(sdt, this.player, this.shaderTime);
      if (this.boss) this.boss.update(sdt, this.player, this.shaderTime);
      this._daggerEnemy();
      if (this.boss && this.boss.alive) {
        this.hud.setBoss(this.boss.hp / this.boss.maxHp);
        if (this.boss.contactsPlayer(this.player)) hit = true;
      }
      if (this.hazards.update(sdt, this.player)) hit = true;
      this.director.update(sdt, this.player);
      this.gems.update(sdt, this.player, this.shaderTime);

      // combo / danger
      this.comboTimer -= sdt;
      if (this.comboTimer <= 0 && this.combo > 0) { this.combo = 0; this.hud.combo(0); }
      this._updateDanger();

      // time + HUD
      this.time += sdt;
      this.hud.setTimer(this.time);
      const acc = this.weapons.shotsFired > 0 ? (this.shotsHit / this.weapons.shotsFired) * 100 : 100;
      this.hud.setAccuracy(acc);

      // camera
      this.player.applyToCamera(this.stage.camera, this._shakeOffset, this._shakeRoll);

      if (hit && this.player.invuln <= 0) this.die();
    } else {
      // dying: slow-mo, keep enemies/gems drifting, death cam
      this.weapons.update(sdt, () => null);
      this.enemies.update(sdt, this.player, this.shaderTime);
      if (this.boss) this.boss.update(sdt, this.player, this.shaderTime);
      this.hazards.update(sdt, this.player);
      this.gems.update(sdt, this.player, this.shaderTime);
      this._deathCamera(dt);
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) { this.targetTimeScale = 1; this._finishDeath(); }
    }
  }

  _updateDanger() {
    let near = 1e9;
    const act = this.enemies.active;
    for (let i = 0; i < act.length; i++) {
      const e = act[i];
      const dx = e.mesh.position.x - this.player.pos.x;
      const dz = e.mesh.position.z - this.player.pos.z;
      const d = dx * dx + dz * dz;
      if (d < near) near = d;
    }
    this.hud.lowHp(near < 9); // within 3 units => danger pulse
  }

  _computeShake(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const s = this.trauma * this.trauma;
    const mag = s * 0.45;
    this._shakeOffset.set(
      (Math.random() * 2 - 1) * mag,
      (Math.random() * 2 - 1) * mag,
      (Math.random() * 2 - 1) * mag
    );
    this._shakeRoll = (Math.random() * 2 - 1) * s * 0.05;
  }

  // ----------------------------------------------------------------- cameras
  _titleCamera(dt) {
    const t = this.shaderTime;
    const cam = this.stage.camera;
    const a = t * 0.08;
    cam.position.set(Math.sin(a) * 5, 2.1 + Math.sin(t * 0.4) * 0.25, Math.cos(a) * 5 + 2);
    const yaw = Math.sin(t * 0.12) * 0.7 + Math.PI;
    cam.quaternion.setFromEuler(new THREE.Euler(-0.04, yaw, 0, 'YXZ'));
  }

  _deathCamera(dt) {
    // sink + roll as the signal dies
    this._deathRoll = damp(this._deathRoll, 1.1, 1.5, dt);
    const drop = damp(0, 1.4, 1.2, dt);
    const cam = this.stage.camera;
    cam.position.set(
      this._deathPos.x + this._shakeOffset.x,
      Math.max(0.4, this._deathPos.y - this._deathRoll * 1.0) + this._shakeOffset.y,
      this._deathPos.z + this._shakeOffset.z
    );
    const euler = new THREE.Euler(this.player.pitch - 0.2, this.player.yaw, this._deathRoll + this._shakeRoll, 'YXZ');
    cam.quaternion.setFromEuler(euler);
  }
}
