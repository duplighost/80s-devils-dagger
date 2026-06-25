import * as THREE from 'three';
import { HEX } from './palette.js';

// Dagger upgrade tiers (Devil-Daggers style: red gems level the weapon).
// gems = cumulative gems needed to reach the tier.
export const LEVELS = [
  { gems: 0,   pellets: 6,  streamRate: 0.075, dmg: 1.0, homing: 0.0,  speed: 52, spread: 0.16 },
  { gems: 10,  pellets: 8,  streamRate: 0.066, dmg: 1.15, homing: 0.0, speed: 55, spread: 0.15 },
  { gems: 25,  pellets: 10, streamRate: 0.058, dmg: 1.35, homing: 2.5, speed: 58, spread: 0.14 },
  { gems: 50,  pellets: 13, streamRate: 0.05,  dmg: 1.7, homing: 4.0,  speed: 60, spread: 0.135 },
  { gems: 85,  pellets: 16, streamRate: 0.044, dmg: 2.2, homing: 6.0,  speed: 63, spread: 0.13 },
];

const MAX = 360;
const LIFE = 1.25;
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class Weapons {
  constructor(scene) {
    this.px = new Float32Array(MAX);
    this.py = new Float32Array(MAX);
    this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.homing = new Float32Array(MAX);
    this.alive = new Uint8Array(MAX);
    this.cursor = 0;

    // glowing shard pointing +Z
    const geo = new THREE.ConeGeometry(0.07, 0.62, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = MAX;
    const col = new THREE.Color();
    for (let i = 0; i < MAX; i++) this.mesh.setColorAt(i, col.setHex(HEX.cyan));
    scene.add(this.mesh);
    // hide all initially
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;

    this.streamCd = 0;
    this.heldFor = 0;
    this.firedThisFrame = 0;     // for muzzle flash / sfx
    this.shotsFired = 0;         // accuracy bookkeeping
  }

  _spawn(ox, oy, oz, dx, dy, dz, level, homing) {
    const i = this._nextSlot();
    this.px[i] = ox; this.py[i] = oy; this.pz[i] = oz;
    const sp = LEVELS[level].speed;
    this.vx[i] = dx * sp; this.vy[i] = dy * sp; this.vz[i] = dz * sp;
    this.life[i] = LIFE;
    this.homing[i] = homing;
    this.alive[i] = 1;
    this.firedThisFrame++;
    this.shotsFired++;
  }

  _nextSlot() {
    for (let n = 0; n < MAX; n++) {
      this.cursor = (this.cursor + 1) % MAX;
      if (!this.alive[this.cursor]) return this.cursor;
    }
    return this.cursor; // overwrite oldest if saturated
  }

  // origin: Vector3 eye, dir: forward Vector3.
  fire(origin, dir, lmbDown, lmbPressed, dt, level) {
    const L = LEVELS[level];
    this.firedThisFrame = 0;
    this.streamCd -= dt;

    // muzzle a touch below/forward of the eye like a hand
    const ox = origin.x, oy = origin.y - 0.18, oz = origin.z;

    if (lmbPressed) {
      // shotgun blast
      this._shotgun(ox, oy, oz, dir, L, level);
      this.heldFor = 0;
      this.streamCd = 0.12;
    } else if (lmbDown) {
      this.heldFor += dt;
      if (this.heldFor > 0.16 && this.streamCd <= 0) {
        this._stream(ox, oy, oz, dir, L, level);
        this.streamCd = L.streamRate;
      }
    } else {
      this.heldFor = 0;
    }
    return this.firedThisFrame;
  }

  _basis(dir) {
    // build right/up basis around dir
    _v.copy(dir).normalize();
    const r = _tmp.set(0, 1, 0).cross(_v);
    if (r.lengthSq() < 1e-4) r.set(1, 0, 0);
    r.normalize();
    const u = new THREE.Vector3().crossVectors(_v, r).normalize();
    return { f: _v.clone(), r, u };
  }

  _shotgun(ox, oy, oz, dir, L, level) {
    const { f, r, u } = this._basis(dir);
    const n = L.pellets;
    for (let i = 0; i < n; i++) {
      // ring + center distribution
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const rad = (i === 0 ? 0 : (0.3 + Math.random() * 0.7)) * L.spread;
      const dx = f.x + (r.x * Math.cos(ang) + u.x * Math.sin(ang)) * rad;
      const dy = f.y + (r.y * Math.cos(ang) + u.y * Math.sin(ang)) * rad;
      const dz = f.z + (r.z * Math.cos(ang) + u.z * Math.sin(ang)) * rad;
      const l = Math.hypot(dx, dy, dz);
      this._spawn(ox, oy, oz, dx / l, dy / l, dz / l, level, L.homing);
    }
  }

  // OVERDRIVE alt-fire: a wide, dense blast of daggers.
  heavy(origin, dir, level) {
    const L = LEVELS[level];
    this.firedThisFrame = 0;
    const ox = origin.x, oy = origin.y - 0.18, oz = origin.z;
    const { f, r, u } = this._basis(dir);
    const n = 22;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const rad = (0.15 + Math.random()) * L.spread * 1.7;
      const dx = f.x + (r.x * Math.cos(ang) + u.x * Math.sin(ang)) * rad;
      const dy = f.y + (r.y * Math.cos(ang) + u.y * Math.sin(ang)) * rad;
      const dz = f.z + (r.z * Math.cos(ang) + u.z * Math.sin(ang)) * rad;
      const l = Math.hypot(dx, dy, dz);
      this._spawn(ox, oy, oz, dx / l, dy / l, dz / l, level, L.homing);
    }
    return this.firedThisFrame;
  }

  _stream(ox, oy, oz, dir, L, level) {
    const { f, r, u } = this._basis(dir);
    const a = Math.random() * Math.PI * 2;
    const rad = Math.random() * L.spread * 0.5;
    const dx = f.x + (r.x * Math.cos(a) + u.x * Math.sin(a)) * rad;
    const dy = f.y + (r.y * Math.cos(a) + u.y * Math.sin(a)) * rad;
    const dz = f.z + (r.z * Math.cos(a) + u.z * Math.sin(a)) * rad;
    const l = Math.hypot(dx, dy, dz);
    this._spawn(ox, oy, oz, dx / l, dy / l, dz / l, level, L.homing);
  }

  // getTarget(px,py,pz,vx,vy,vz) -> {x,y,z} | null  (nearest enemy ahead)
  update(dt, getTarget) {
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alive[i] = 0; this._hide(i); continue; }

      // homing
      const h = this.homing[i];
      if (h > 0) {
        const t = getTarget(this.px[i], this.py[i], this.pz[i], this.vx[i], this.vy[i], this.vz[i]);
        if (t) {
          const sp = Math.hypot(this.vx[i], this.vy[i], this.vz[i]) || 1;
          let dx = t.x - this.px[i], dy = t.y - this.py[i], dz = t.z - this.pz[i];
          const dl = Math.hypot(dx, dy, dz) || 1;
          dx /= dl; dy /= dl; dz /= dl;
          const k = Math.min(1, h * dt);
          this.vx[i] += (dx * sp - this.vx[i]) * k;
          this.vy[i] += (dy * sp - this.vy[i]) * k;
          this.vz[i] += (dz * sp - this.vz[i]) * k;
          const nl = Math.hypot(this.vx[i], this.vy[i], this.vz[i]) || 1;
          this.vx[i] *= sp / nl; this.vy[i] *= sp / nl; this.vz[i] *= sp / nl;
        }
      }

      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;

      // write instance matrix (orient + slight length stretch)
      _v.set(this.vx[i], this.vy[i], this.vz[i]).normalize();
      _q.setFromUnitVectors(_up, _v);
      _s.set(1, 1, 1.5);
      _m.compose(_tmp.set(this.px[i], this.py[i], this.pz[i]), _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _hide(i) {
    _m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(i, _m);
  }

  kill(i) { this.alive[i] = 0; this._hide(i); }

  reset() {
    this.alive.fill(0);
    this.shotsFired = 0;
    this.heldFor = 0;
    this.streamCd = 0;
    for (let i = 0; i < MAX; i++) this._hide(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export const MAX_DAGGERS = MAX;
