import { TYPE } from './enemies.js';
import { ARENA_RADIUS } from './world.js';
import { clamp } from './util.js';

// Procedural spawn director: a single escalating run that introduces enemy
// types over time, grows the live population, and punctuates with wave bursts.
export class Director {
  constructor(enemies) {
    this.enemies = enemies;
    this.onWave = null;     // (n) => void  (HUD toast + audio sting)
    this.reset();
  }

  reset() {
    this.time = 0;
    this.spawnTimer = 1.0;
    this.waveTimer = 10;
    this.wave = 0;
    this.totalSpawned = 0;
  }

  _edgePos(player, minDist = 7, far = 0) {
    const pr = far ? 0.55 : 0.78 + Math.random() * 0.2;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = ARENA_RADIUS * pr;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - player.pos.x, z - player.pos.z) >= minDist) return { x, z };
    }
    // fallback: opposite the player
    const a = Math.atan2(player.pos.z, player.pos.x) + Math.PI;
    const r = ARENA_RADIUS * pr;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  _pickType(T) {
    const r = Math.random();
    if (T > 50 && r < 0.07) return TYPE.SPAWNER;
    if (T > 28 && r < 0.30) return TYPE.CHARGER;
    if (T > 11 && r < 0.62) return TYPE.SWARM;
    return TYPE.SKULL;
  }

  _spawnOne(player, far = 0) {
    const t = this._pickType(this.time);
    const p = this._edgePos(player, t === TYPE.SPAWNER ? 12 : 7, far);
    this.enemies.spawn(t, p.x, p.z);
    this.totalSpawned++;
  }

  update(dt, player) {
    this.time += dt;
    const T = this.time;
    this.enemies.intensity = clamp(T / 110, 0, 1);

    // desired live population ramps up
    const desired = Math.min(3 + T * 0.55, 46);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.count() < desired) {
      this.spawnTimer = Math.max(0.16, 1.1 - T * 0.012);
      this._spawnOne(player);
    }

    // periodic wave bursts for intensity spikes
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = Math.max(7, 15 - T * 0.04);
      this.wave++;
      const n = Math.min(3 + Math.floor(T / 14), 10);
      for (let i = 0; i < n; i++) this._spawnOne(player, Math.random() < 0.4 ? 1 : 0);
      this.onWave && this.onWave(this.wave);
    }
  }
}
