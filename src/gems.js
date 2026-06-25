import * as THREE from 'three';
import { HEX } from './palette.js';

// Red gems: burst from slain enemies, settle, then magnetize to the player and
// feed the dagger upgrade meter.
const MAX = 240;
const COLLECT_R = 1.3;
const MAGNET_R = 6.0;
const HOVER = 0.6;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Gems {
  constructor(scene, particles) {
    this.particles = particles;
    this.px = new Float32Array(MAX);
    this.py = new Float32Array(MAX);
    this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.vz = new Float32Array(MAX);
    this.ttl = new Float32Array(MAX);
    this.spin = new Float32Array(MAX);
    this.alive = new Uint8Array(MAX);
    this.cursor = 0;
    this.onCollect = null;

    const geo = new THREE.OctahedronGeometry(0.26, 0);
    const mat = new THREE.MeshBasicMaterial({ color: HEX.hot, toneMapped: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = MAX;
    scene.add(this.mesh);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  spawn(x, y, z) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % MAX;
    this.px[i] = x; this.py[i] = y + 0.4; this.pz[i] = z;
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
    this.vx[i] = Math.cos(a) * s;
    this.vy[i] = 5 + Math.random() * 4;
    this.vz[i] = Math.sin(a) * s;
    this.ttl[i] = 13 + Math.random() * 3;
    this.spin[i] = Math.random() * Math.PI * 2;
    this.alive[i] = 1;
  }

  burst(x, y, z, n) { for (let k = 0; k < n; k++) this.spawn(x, y, z); }

  update(dt, player, time) {
    const px = player.pos.x, py = player.pos.y + 1.0, pz = player.pos.z;
    let collected = 0;
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      this.ttl[i] -= dt;
      if (this.ttl[i] <= 0) { this.alive[i] = 0; this._hide(i); continue; }

      let x = this.px[i], y = this.py[i], z = this.pz[i];
      const dx = px - x, dy = py - y, dz = pz - z;
      const d = Math.hypot(dx, dy, dz) || 1;

      if (d < COLLECT_R) {
        this.alive[i] = 0; this._hide(i);
        collected++;
        this.particles.burst(x, y, z, 8, { color: new THREE.Color(HEX.amber), speed: 5, life: 0.4, size: 0.13, drag: 5 });
        continue;
      }

      if (d < MAGNET_R) {
        // accelerate toward player, stronger as it nears
        const pull = (1 - d / MAGNET_R) * 60 + 8;
        this.vx[i] += (dx / d) * pull * dt;
        this.vy[i] += (dy / d) * pull * dt;
        this.vz[i] += (dz / d) * pull * dt;
        this.vx[i] *= Math.exp(-3 * dt); this.vy[i] *= Math.exp(-3 * dt); this.vz[i] *= Math.exp(-3 * dt);
      } else {
        // ballistic settle to hover height
        this.vy[i] -= 22 * dt;
        if (y <= HOVER && this.vy[i] < 0) { this.vy[i] *= -0.35; y = HOVER; if (Math.abs(this.vy[i]) < 1) this.vy[i] = 0; }
        this.vx[i] *= Math.exp(-2.5 * dt); this.vz[i] *= Math.exp(-2.5 * dt);
        // gentle bob once settled
        if (Math.abs(this.vy[i]) < 0.6 && y <= HOVER + 0.05) y = HOVER + Math.sin(time * 3 + i) * 0.12;
      }

      x += this.vx[i] * dt; y += this.vy[i] * dt; z += this.vz[i] * dt;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;

      // render: spin + blink when about to expire
      const blink = this.ttl[i] < 3 ? (Math.sin(time * 18) > 0 ? 1 : 0.2) : 1;
      _e.set(time * 1.5, this.spin[i] + time * 4, 0);
      _q.setFromEuler(_e);
      _s.setScalar(blink);
      _m.compose(_p.set(x, y, z), _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (collected > 0 && this.onCollect) this.onCollect(collected);
    return collected;
  }

  _hide(i) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); }

  reset() {
    this.alive.fill(0);
    for (let i = 0; i < MAX; i++) this._hide(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
