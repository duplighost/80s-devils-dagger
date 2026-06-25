import * as THREE from 'three';
import { HEX } from './palette.js';

// THE OVERSEER — a hovering eye ringed by six shield shards. It rains radial and
// fanned bullet patterns and summons minions; you must destroy all shards to
// expose its core, then burn it down before the shield regenerates.
const SHARDS = 6;
const _v = new THREE.Vector3();
const WHITE = new THREE.Color(0xffffff);

function neon(hex, ei = 0.8) {
  const c = new THREE.Color(hex);
  const m = new THREE.MeshStandardMaterial({ color: 0x08001a, emissive: c.clone(), emissiveIntensity: ei, roughness: 0.3 });
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

export class BossEye {
  constructor(scene, particles, hazards) {
    this.name = '▲ THE OVERSEER ▲';
    this.particles = particles;
    this.hazards = hazards;
    this.onDeath = null; this.onMinion = null; this.onVolley = null;
    this.alive = false;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);

    // core + pupil
    this.coreMat = neon(HEX.cyan, 0.7);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), this.coreMat);
    this.core.add(new THREE.LineSegments(new THREE.EdgesGeometry(this.core.geometry),
      new THREE.LineBasicMaterial({ color: HEX.cyan, toneMapped: false })));
    this.pupil = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 16),
      new THREE.MeshBasicMaterial({ color: HEX.ice, toneMapped: false }));
    this.core.add(this.pupil);
    this.group.add(this.core);

    // halo
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.06, 8, 64),
      new THREE.MeshBasicMaterial({ color: HEX.violet, toneMapped: false, transparent: true, opacity: 0.8 }));
    this.halo.rotation.x = Math.PI / 2;
    this.group.add(this.halo);

    // shards
    this.shards = [];
    for (let i = 0; i < SHARDS; i++) {
      const mat = neon(HEX.magenta, 0.8);
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: HEX.magenta, toneMapped: false })));
      this.group.add(mesh);
      this.shards.push({ mesh, mat, hp: 8, alive: true, flash: 0 });
    }
    this.center = new THREE.Vector3();
  }

  spawn(player, intensity = 0.6) {
    this.alive = true; this.group.visible = true;
    this.intensity = intensity;
    this.maxHp = 60 + Math.floor(intensity * 36); this.hp = this.maxHp;
    this.t = 0; this.orb = 0; this.fireTimer = 1.6; this.minionTimer = 4; this.pattern = 0;
    this.exposed = false; this.exposeTimer = 0; this.shardsLeft = SHARDS;
    this.center.set(0, 5.6, 0);
    for (const s of this.shards) { s.hp = 8; s.alive = true; s.flash = 0; s.mesh.visible = true; s.mat.emissive.copy(_magenta); s.mat.emissiveIntensity = 0.8; }
    this.coreMat.emissive.copy(_cyan); this.coreMat.emissiveIntensity = 0.7;
  }

  _regenShards() {
    this.exposed = false;
    this.coreMat.emissive.copy(_cyan); this.coreMat.emissiveIntensity = 0.7;
    for (const s of this.shards) { s.hp = 8; s.alive = true; s.mesh.visible = true; s.mat.emissive.copy(_magenta); }
    this.shardsLeft = SHARDS;
  }
  _expose() {
    this.exposed = true; this.exposeTimer = 8.5;
    this.coreMat.emissive.copy(_hot); this.coreMat.emissiveIntensity = 1.4;
  }

  update(dt, player, time) {
    if (!this.alive) return;
    this.t += dt;
    // slow drift around arena centre
    this.center.x = Math.sin(this.t * 0.27) * 5.5;
    this.center.z = Math.cos(this.t * 0.21) * 5.5;
    this.center.y = 5.4 + Math.sin(this.t * 0.8) * 0.6;
    this.core.position.copy(this.center);
    this.core.rotation.y += dt * 0.6; this.core.rotation.x += dt * 0.2;
    this.halo.position.copy(this.center); this.halo.rotation.z += dt * 0.8;
    if (this.exposed) this.pupil.scale.setScalar(1.2 + Math.sin(this.t * 12) * 0.15);
    else this.pupil.scale.setScalar(1);

    // shards orbit
    this.orb += dt * 0.9;
    for (let i = 0; i < SHARDS; i++) {
      const s = this.shards[i];
      const a = this.orb + (i / SHARDS) * Math.PI * 2;
      s.mesh.position.set(this.center.x + Math.cos(a) * 3.2, this.center.y + Math.sin(this.t * 2 + i) * 0.3, this.center.z + Math.sin(a) * 3.2);
      s.mesh.rotation.x += dt * 2; s.mesh.rotation.y += dt * 2.5;
      if (s.flash > 0) { s.flash = Math.max(0, s.flash - dt * 5); s.mat.emissive.copy(_magenta).lerp(WHITE, s.flash); }
    }

    // expose timer
    if (this.exposed) { this.exposeTimer -= dt; if (this.exposeTimer <= 0) this._regenShards(); }

    // ---- attacks ----
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = Math.max(1.1, 2.2 - this.intensity * 0.8);
      const ox = this.center.x, oz = this.center.z, oy = 1.6;
      const sp = 7.5 + this.intensity * 3;
      if (this.pattern % 2 === 0) {
        this.hazards.ring(ox, oy, oz, 14, sp, HEX.amber, this.t);
      } else {
        // fan aimed at player
        let dx = player.pos.x - ox, dz = player.pos.z - oz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const base = Math.atan2(dz, dx);
        for (let k = -2; k <= 2; k++) {
          const a = base + k * 0.16;
          this.hazards.bullet(ox, oy, oz, Math.cos(a) * sp, 0, Math.sin(a) * sp, 5, 0.42, HEX.hot);
        }
      }
      this.pattern++;
      this.onVolley && this.onVolley();
    }

    this.minionTimer -= dt;
    if (this.minionTimer <= 0) { this.minionTimer = 6.5; this.onMinion && this.onMinion(2); }
  }

  hitTest(x, y, z) {
    if (!this.alive) return null;
    if (!this.exposed) {
      for (const s of this.shards) {
        if (!s.alive) continue;
        if (s.mesh.position.distanceToSquared(_v.set(x, y, z)) < 0.75 * 0.75) return { kind: 'shard', shard: s };
      }
      return null;
    }
    if (this.core.position.distanceToSquared(_v.set(x, y, z)) < 1.7 * 1.7) return { kind: 'core' };
    return null;
  }

  damage(seg, dmg, hx, hy, hz) {
    if (!this.alive) return false;
    if (seg.kind === 'shard') {
      const s = seg.shard; s.hp -= dmg; s.flash = 1;
      this.particles.burst(hx, hy, hz, 5, { color: _magenta, speed: 7, life: 0.3, size: 0.12, drag: 6 });
      if (s.hp <= 0) {
        s.alive = false; s.mesh.visible = false; this.shardsLeft--;
        this.particles.burst(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z, 18, { color: _magenta, speed: 11, life: 0.6, size: 0.2, drag: 2.5 });
        if (this.shardsLeft <= 0) this._expose();
      }
      return false;
    }
    // core (only reachable while exposed)
    this.hp -= dmg; this.coreMat.emissive.copy(WHITE); this.coreMat.emissiveIntensity = 3;
    this.particles.burst(hx, hy, hz, 6, { color: _cyan, speed: 8, life: 0.3, size: 0.13, drag: 6 });
    if (this.hp <= 0) { this._die(); return true; }
    return false;
  }

  contactsPlayer(player) {
    if (!this.alive) return false;
    const dx = this.core.position.x - player.pos.x, dz = this.core.position.z - player.pos.z;
    return dx * dx + dz * dz < 2.2 * 2.2 && Math.abs(this.core.position.y - (player.pos.y + 1)) < 2.6;
  }

  _die() {
    this.alive = false;
    const p = this.core.position;
    this.particles.burst(p.x, p.y, p.z, 90, { color: _cyan, speed: 18, life: 1.2, size: 0.28, drag: 1.8, upBias: 2 });
    this.particles.burst(p.x, p.y, p.z, 50, { color: _magenta, speed: 12, life: 1.0, size: 0.22, drag: 2 });
    this.group.visible = false;
    this.onDeath && this.onDeath(p.clone());
  }

  reset() { this.alive = false; this.group.visible = false; }
}

const _cyan = new THREE.Color(HEX.cyan);
const _magenta = new THREE.Color(HEX.magenta);
const _hot = new THREE.Color(HEX.hot);
