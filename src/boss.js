import * as THREE from 'three';
import { HEX } from './palette.js';
import { clamp } from './util.js';

// ============================================================================
// LEVIATHAN — a giant neon serpent boss. The head steers on a serpentine orbit
// that periodically lunges at the player; the body follows by arc-length
// sampling of the head's path (frame-rate independent). Shared HP, every
// segment is a valid target, the head (and first couple segments) are lethal.
// ============================================================================
const SEGMENTS = 20;
const SEG_GAP = 0.92;          // world-units between segments
const MIN_STEP = 0.1;          // history resample threshold
const MAX_POINTS = 420;
const HEAD_KILL_SEGS = 3;      // how many leading segments are lethal
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(0xffffff);

function segMaterial(hex) {
  const c = new THREE.Color(hex);
  const m = new THREE.MeshStandardMaterial({ color: 0x09001a, emissive: c.clone(), emissiveIntensity: 0.7, roughness: 0.3 });
  m.userData.rim = c.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: m.userData.rim };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float _f = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)),0.0,1.0), 2.0);
         totalEmissiveRadiance += uRim * _f * 1.9;`);
  };
  return m;
}

export class Leviathan {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.alive = false;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.segs = [];
    const geoHead = new THREE.IcosahedronGeometry(1.15, 1);
    for (let i = 0; i < SEGMENTS; i++) {
      const t = i / (SEGMENTS - 1);
      const radius = THREE.MathUtils.lerp(1.05, 0.32, t);
      const geo = i === 0 ? geoHead : new THREE.IcosahedronGeometry(radius, 0);
      // gradient cyan -> magenta -> violet down the body
      const col = new THREE.Color().setHSL(THREE.MathUtils.lerp(0.5, 0.82, t), 1.0, 0.55);
      const mat = segMaterial(col.getHex());
      const mesh = new THREE.Mesh(geo, mat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: col.getHex(), toneMapped: false, transparent: true }));
      mesh.add(edges);
      this.group.add(mesh);
      this.segs.push({ mesh, mat, edgeMat: edges.material, base: col.clone(), radius, flash: 0 });
    }

    this.head = new THREE.Vector3();
    this.headVel = new THREE.Vector3();
    this.history = [];
    this.maxHp = 1; this.hp = 1;
    this.orbAng = 0; this.t = 0; this.lungeTimer = 0; this.lunging = false;
  }

  get headPos() { return this.head; }

  spawn(player, intensity = 0.6) {
    this.alive = true;
    this.group.visible = true;
    this.maxHp = 55 + Math.floor(intensity * 45);
    this.hp = this.maxHp;
    this.t = 0; this.orbAng = Math.random() * Math.PI * 2;
    this.lungeTimer = 3 + Math.random() * 2; this.lunging = false;
    // enter from a high point at the arena edge, opposite the player
    const a = Math.atan2(player.pos.z, player.pos.x) + Math.PI;
    this.head.set(Math.cos(a) * 22, 9, Math.sin(a) * 22);
    this.headVel.set(-Math.cos(a) * 8, 0, -Math.sin(a) * 8);
    this.history.length = 0;
    for (let i = 0; i < MAX_POINTS; i++) this.history.push(this.head.clone());
    for (const s of this.segs) { s.flash = 0; s.mat.emissive.copy(s.base); s.mat.emissiveIntensity = 0.7; s.edgeMat.color.copy(s.base); }
  }

  // walk the head path backwards by `arc` world-units, interpolating
  _sampleAt(arc) {
    const h = this.history;
    let acc = 0;
    for (let i = 1; i < h.length; i++) {
      const d = h[i - 1].distanceTo(h[i]);
      if (acc + d >= arc) {
        const f = d > 1e-5 ? (arc - acc) / d : 0;
        return _v2.copy(h[i - 1]).lerp(h[i], f).clone();
      }
      acc += d;
    }
    return h[h.length - 1].clone();
  }

  update(dt, player, time) {
    if (!this.alive) return;
    this.t += dt;

    // ---- head steering: serpentine orbit + periodic lunge ----
    this.orbAng += dt * 0.85;
    const R = 8 + Math.sin(this.t * 0.6) * 4;     // breathing orbit radius
    const gy = 3.2 + Math.sin(this.t * 1.3) * 1.8;
    this.lungeTimer -= dt;
    if (this.lungeTimer <= 0 && !this.lunging) { this.lunging = true; this.lungeTimer = 1.1; }
    else if (this.lunging && this.lungeTimer <= 0) { this.lunging = false; this.lungeTimer = 3.5 + Math.random() * 2.5; }

    let gx, gz, gyy;
    if (this.lunging) {
      // dive straight at the player
      gx = player.pos.x; gz = player.pos.z; gyy = player.pos.y + 1.2;
    } else {
      gx = player.pos.x + Math.cos(this.orbAng) * R;
      gz = player.pos.z + Math.sin(this.orbAng) * R;
      gyy = gy;
    }
    _v.set(gx - this.head.x, gyy - this.head.y, gz - this.head.z);
    const dl = _v.length() || 1; _v.multiplyScalar(1 / dl);
    const speed = (this.lunging ? 17 : 10.5);
    this.headVel.lerp(_v.multiplyScalar(speed), clamp(dt * (this.lunging ? 3.5 : 2.2), 0, 1));
    this.head.addScaledVector(this.headVel, dt);
    this.head.y = clamp(this.head.y, 1.2, 12);

    // ---- record path ----
    if (this.history[0].distanceToSquared(this.head) > MIN_STEP * MIN_STEP) {
      this.history.unshift(this.head.clone());
      if (this.history.length > MAX_POINTS) this.history.pop();
    } else {
      this.history[0].copy(this.head);
    }

    // ---- place + animate segments ----
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const p = i === 0 ? this.head : this._sampleAt(i * SEG_GAP);
      const prev = i === 0 ? this._sampleAt(SEG_GAP * 0.5) : this._sampleAt((i - 1) * SEG_GAP);
      s.mesh.position.copy(p);
      // orient toward the segment ahead
      _v.copy(prev).sub(p);
      if (_v.lengthSq() > 1e-5) { _v.normalize(); _q.setFromUnitVectors(_up, _v); s.mesh.quaternion.copy(s.mesh.quaternion).slerp(_q, 0.4); }
      s.mesh.rotation.z += dt * 0.5;
      const pulse = 1 + Math.sin(this.t * 4 - i * 0.5) * 0.06;
      s.mesh.scale.setScalar(pulse);
      if (s.flash > 0) {
        s.flash = Math.max(0, s.flash - dt * 5);
        s.mat.emissive.copy(s.base).lerp(WHITE, s.flash);
        s.mat.emissiveIntensity = 0.7 + s.flash * 5;
        s.edgeMat.color.copy(s.base).lerp(WHITE, s.flash);
      }
    }
  }

  // dagger hit test: nearest segment within its radius -> {seg} or null
  hitTest(x, y, z) {
    if (!this.alive) return null;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const rr = s.radius + 0.25;
      if (s.mesh.position.distanceToSquared(_v.set(x, y, z)) < rr * rr) return s;
    }
    return null;
  }

  damage(seg, dmg, hx, hy, hz) {
    if (!this.alive) return false;
    this.hp -= dmg;
    seg.flash = 1;
    this.particles.burst(hx, hy, hz, 5, { color: seg.base, speed: 8, life: 0.3, size: 0.13, drag: 6 });
    if (this.hp <= 0) { this._die(); return true; }
    return false;
  }

  contactsPlayer(player) {
    if (!this.alive) return false;
    const px = player.pos.x, pz = player.pos.z, py = player.pos.y + 1.0;
    for (let i = 0; i < HEAD_KILL_SEGS; i++) {
      const s = this.segs[i];
      const dx = s.mesh.position.x - px, dz = s.mesh.position.z - pz;
      if (dx * dx + dz * dz < (s.radius + 0.55) * (s.radius + 0.55) && Math.abs(s.mesh.position.y - py) < 2.2) return true;
    }
    return false;
  }

  _die() {
    this.alive = false;
    // chain of explosions down the body
    for (let i = 0; i < this.segs.length; i++) {
      const p = this.segs[i].mesh.position;
      this.particles.burst(p.x, p.y, p.z, 22, { color: this.segs[i].base, speed: 13, life: 1.0, size: 0.24, drag: 2, upBias: 2 });
    }
    this.group.visible = false;
    this.onDeath && this.onDeath(this.head.clone());
  }

  reset() {
    this.alive = false;
    this.group.visible = false;
  }
}
