import * as THREE from 'three';
import { HEX } from './palette.js';
import { ARENA_RADIUS } from './world.js';

// Shared enemy-hazard system used by bosses: neon bullets (always lethal on
// contact) and expanding ground shockwave rings (lethal only while you're
// grounded — jump them). Pooled + instanced.
const MAX_B = 320;
const PLAYER_R = 0.5;
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion();

export class Hazards {
  constructor(scene, particles) {
    this.particles = particles;
    // ---- bullets ----
    this.bx = new Float32Array(MAX_B); this.by = new Float32Array(MAX_B); this.bz = new Float32Array(MAX_B);
    this.bvx = new Float32Array(MAX_B); this.bvy = new Float32Array(MAX_B); this.bvz = new Float32Array(MAX_B);
    this.bl = new Float32Array(MAX_B); this.bAlive = new Uint8Array(MAX_B); this.br = new Float32Array(MAX_B);
    this.cursor = 0;
    const geo = new THREE.IcosahedronGeometry(0.34, 0);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_B);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color(HEX.orange);
    for (let i = 0; i < MAX_B; i++) this.mesh.setColorAt(i, col);
    scene.add(this.mesh);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_B; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;

    // ---- shockwave rings ----
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.07, 8, 64),
        new THREE.MeshBasicMaterial({ color: HEX.orange, toneMapped: false, transparent: true, fog: false })
      );
      torus.rotation.x = Math.PI / 2;
      torus.visible = false;
      scene.add(torus);
      this.rings.push({ mesh: torus, cx: 0, cz: 0, r: 0, maxR: 10, speed: 8, thick: 1.2, active: false });
    }
  }

  // ---------------- bullets ----------------
  bullet(x, y, z, vx, vy, vz, life = 4, radius = 0.45, hex = HEX.orange) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % MAX_B;
    this.bx[i] = x; this.by[i] = y; this.bz[i] = z;
    this.bvx[i] = vx; this.bvy[i] = vy; this.bvz[i] = vz;
    this.bl[i] = life; this.br[i] = radius; this.bAlive[i] = 1;
    this.mesh.setColorAt(i, _col.set(hex));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // even ring of bullets in the horizontal plane
  ring(x, y, z, count, speed, hex, spin = 0) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + spin;
      this.bullet(x, y, z, Math.cos(a) * speed, 0, Math.sin(a) * speed, 5, 0.42, hex);
    }
  }

  // ---------------- shockwave ----------------
  shockwave(cx, cz, maxR, speed, hex = HEX.orange, thick = 1.3) {
    const r = this.rings.find((x) => !x.active);
    if (!r) return;
    r.cx = cx; r.cz = cz; r.r = 1.2; r.maxR = maxR; r.speed = speed; r.thick = thick; r.active = true;
    r.mesh.visible = true;
    r.mesh.material.color.set(hex);
    r.mesh.position.set(cx, 0.12, cz);
  }

  update(dt, player) {
    let hit = false;
    const px = player.pos.x, pz = player.pos.z, py = player.pos.y + 1.0;

    // bullets
    for (let i = 0; i < MAX_B; i++) {
      if (!this.bAlive[i]) continue;
      this.bl[i] -= dt;
      this.bx[i] += this.bvx[i] * dt; this.by[i] += this.bvy[i] * dt; this.bz[i] += this.bvz[i] * dt;
      const offArena = (this.bx[i] * this.bx[i] + this.bz[i] * this.bz[i]) > (ARENA_RADIUS + 8) * (ARENA_RADIUS + 8);
      if (this.bl[i] <= 0 || offArena || this.by[i] < -2) { this.bAlive[i] = 0; _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      const dx = this.bx[i] - px, dy = this.by[i] - py, dz = this.bz[i] - pz;
      const rr = this.br[i] + PLAYER_R;
      if (dx * dx + dz * dz < rr * rr && Math.abs(dy) < 1.3) hit = true;
      _p.set(this.bx[i], this.by[i], this.bz[i]);
      _q.setFromAxisAngle(UP, this.bl[i] * 6);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // shockwaves
    for (const r of this.rings) {
      if (!r.active) continue;
      r.r += r.speed * dt;
      if (r.r >= r.maxR) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.scale.set(r.r, r.r, 1);
      const t = r.r / r.maxR;
      r.mesh.material.opacity = (1 - t) * 0.95;
      // lethal edge while grounded
      const d = Math.hypot(px - r.cx, pz - r.cz);
      if (player.grounded && Math.abs(d - r.r) < r.thick) hit = true;
    }
    return hit;
  }

  reset() {
    this.bAlive.fill(0);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_B; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const r of this.rings) { r.active = false; r.mesh.visible = false; }
  }
}

const _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
