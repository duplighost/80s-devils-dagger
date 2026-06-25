import * as THREE from 'three';
import { HEX } from './palette.js';
import { ARENA_RADIUS } from './world.js';
import { clamp } from './util.js';

// THE COLOSSUS — a hulking brute that stalks you, winds up, charges in a
// straight line, then SLAMS to throw an expanding shockwave ring. Jump the
// rings, sidestep the charge, and pour fire into its exposed core.
const ST = { STALK: 0, WINDUP: 1, CHARGE: 2, SLAM: 3, RECOVER: 4 };
const _v = new THREE.Vector3();
const WHITE = new THREE.Color(0xffffff);
const HOVER = 2.4;

function neon(hex, ei) {
  const c = new THREE.Color(hex);
  const m = new THREE.MeshStandardMaterial({ color: 0x0a0010, emissive: c.clone(), emissiveIntensity: ei, roughness: 0.35 });
  m.userData.rim = c.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: m.userData.rim };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float _f = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)),0.0,1.0), 2.0);
         totalEmissiveRadiance += uRim * _f * 1.8;`);
  };
  return m;
}

export class BossTitan {
  constructor(scene, particles, hazards) {
    this.name = '▲ THE COLOSSUS ▲';
    this.particles = particles;
    this.hazards = hazards;
    this.onDeath = null; this.onSlam = null;
    this.alive = false;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);

    this.bodyMat = neon(HEX.violet, 0.45);
    this.body = new THREE.Mesh(new THREE.DodecahedronGeometry(1.85, 0), this.bodyMat);
    this.body.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.body.geometry),
      new THREE.LineBasicMaterial({ color: HEX.violet, toneMapped: false })));
    this.group.add(this.body);

    // glowing weak-point core
    this.coreMat = new THREE.MeshBasicMaterial({ color: HEX.orange, toneMapped: false });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), this.coreMat);
    this.group.add(this.core);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.dir = new THREE.Vector3(1, 0, 0);
  }

  spawn(player, intensity = 0.6) {
    this.alive = true; this.group.visible = true;
    this.intensity = intensity;
    this.maxHp = 90 + Math.floor(intensity * 50); this.hp = this.maxHp;
    this.state = ST.STALK; this.timer = 2.2; this.t = 0; this.flash = 0;
    const a = Math.atan2(player.pos.z, player.pos.x) + Math.PI;
    this.pos.set(Math.cos(a) * (ARENA_RADIUS * 0.7), HOVER, Math.sin(a) * (ARENA_RADIUS * 0.7));
    this.vel.set(0, 0, 0);
    this.body.scale.setScalar(1);
    this.bodyMat.emissive.copy(_violet); this.bodyMat.emissiveIntensity = 0.45;
  }

  update(dt, player, time) {
    if (!this.alive) return;
    this.t += dt;
    const speed = 3 + this.intensity * 1.5;
    let dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    let dist = Math.hypot(dx, dz) || 1; const nx = dx / dist, nz = dz / dist;

    switch (this.state) {
      case ST.STALK: {
        this.vel.x += (nx * speed - this.vel.x) * dt * 2;
        this.vel.z += (nz * speed - this.vel.z) * dt * 2;
        this.timer -= dt;
        if (this.timer <= 0) { this.state = ST.WINDUP; this.timer = 0.85; }
        break;
      }
      case ST.WINDUP: {
        this.vel.multiplyScalar(Math.exp(-6 * dt));
        this.body.scale.setScalar(1 + Math.sin(this.t * 30) * 0.04 + 0.18);
        this.coreMat.color.copy(_amber).lerp(WHITE, 0.5 + Math.sin(this.t * 30) * 0.5);
        this.dir.set(nx, 0, nz); // lock onto player
        this.timer -= dt;
        if (this.timer <= 0) { this.state = ST.CHARGE; this.timer = 0.8; this.body.scale.setScalar(1); }
        break;
      }
      case ST.CHARGE: {
        const cs = 18 + this.intensity * 5;
        this.vel.set(this.dir.x * cs, 0, this.dir.z * cs);
        this.timer -= dt;
        if (this.timer <= 0 || dist < 1.5) { this.state = ST.SLAM; this.timer = 0.18; }
        break;
      }
      case ST.SLAM: {
        this.vel.multiplyScalar(Math.exp(-12 * dt));
        this.timer -= dt;
        if (this.timer <= 0) {
          // throw shockwaves + dust
          this.hazards.shockwave(this.pos.x, this.pos.z, 16, 9, HEX.green, 1.4);
          this.hazards.shockwave(this.pos.x, this.pos.z, 11, 6.5, HEX.orange, 1.2);
          this.particles.burst(this.pos.x, 0.4, this.pos.z, 40, { color: _amber, speed: 14, life: 0.7, size: 0.22, drag: 2.5, upBias: 3 });
          this.onSlam && this.onSlam(this.pos);
          this.state = ST.RECOVER; this.timer = 1.1 + Math.random() * 0.6;
        }
        break;
      }
      case ST.RECOVER: {
        this.vel.multiplyScalar(Math.exp(-3 * dt));
        this.coreMat.color.copy(_amber);
        this.timer -= dt;
        if (this.timer <= 0) { this.state = ST.STALK; this.timer = 1.8 + Math.random(); }
        break;
      }
    }

    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // keep on the arena
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA_RADIUS - 1) { this.pos.x *= (ARENA_RADIUS - 1) / r; this.pos.z *= (ARENA_RADIUS - 1) / r; this.vel.multiplyScalar(0.3); }
    this.pos.y = HOVER + Math.sin(this.t * 1.6) * 0.18;
    this.group.position.copy(this.pos);
    this.body.rotation.y += dt * 0.5;
    this.core.rotation.y -= dt * 1.5; this.core.rotation.x += dt * 1.2;
    this.core.scale.setScalar(1 + Math.sin(this.t * 4) * 0.08);

    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 5); this.bodyMat.emissive.copy(_violet).lerp(WHITE, this.flash); this.bodyMat.emissiveIntensity = 0.45 + this.flash * 4; }
  }

  hitTest(x, y, z) {
    if (!this.alive) return null;
    return this.pos.distanceToSquared(_v.set(x, y, z)) < 2.1 * 2.1 ? { kind: 'body' } : null;
  }

  damage(seg, dmg, hx, hy, hz) {
    if (!this.alive) return false;
    this.hp -= dmg; this.flash = 1;
    this.particles.burst(hx, hy, hz, 5, { color: _amber, speed: 7, life: 0.3, size: 0.13, drag: 6 });
    if (this.hp <= 0) { this._die(); return true; }
    return false;
  }

  contactsPlayer(player) {
    if (!this.alive) return false;
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
    return dx * dx + dz * dz < 2.2 * 2.2 && Math.abs(this.pos.y - (player.pos.y + 1)) < 2.6;
  }

  _die() {
    this.alive = false;
    const p = this.pos;
    this.particles.burst(p.x, p.y, p.z, 100, { color: _violet, speed: 16, life: 1.2, size: 0.28, drag: 1.8, upBias: 2 });
    this.particles.burst(p.x, p.y, p.z, 50, { color: _amber, speed: 11, life: 0.9, size: 0.22, drag: 2 });
    this.group.visible = false;
    this.onDeath && this.onDeath(p.clone());
  }

  splash(dmg) {
    if (!this.alive) return;
    this.hp -= dmg; this.flash = 1;
    if (this.hp <= 0) this._die();
  }

  reset() { this.alive = false; this.group.visible = false; }
}

const _violet = new THREE.Color(HEX.violet);
const _amber = new THREE.Color(HEX.amber);
