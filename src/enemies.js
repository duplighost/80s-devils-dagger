import * as THREE from 'three';
import { HEX } from './palette.js';
import { clamp } from './util.js';

// Enemy archetypes — Devil-Daggers-flavoured, rendered as glowing neon solids
// with a fresnel rim that blooms at the edges.
export const TYPE = { SKULL: 0, SWARM: 1, CHARGER: 2, SPAWNER: 3 };

const HOVER = 1.45;
const PLAYER_R = 0.55;
const _v = new THREE.Vector3();

// MeshStandardMaterial + injected fresnel rim glow. All clones share one
// compiled program (identical onBeforeCompile), so cloning per-enemy is cheap.
function neonMaterial(hex) {
  const c = new THREE.Color(hex);
  const m = new THREE.MeshStandardMaterial({
    color: 0x0a0014,
    emissive: c.clone(),
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.0,
  });
  m.userData.rim = c.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: m.userData.rim };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float _fres = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
         totalEmissiveRadiance += uRim * _fres * 1.7;`
      );
  };
  return m;
}

const GEO = {
  [TYPE.SKULL]: new THREE.IcosahedronGeometry(0.72, 0),
  [TYPE.SWARM]: new THREE.TetrahedronGeometry(0.5, 0),
  [TYPE.CHARGER]: (() => { const g = new THREE.OctahedronGeometry(0.62, 0); g.scale(0.8, 0.8, 1.5); return g; })(),
  [TYPE.SPAWNER]: new THREE.DodecahedronGeometry(1.25, 0),
};
// bright neon wireframe edges over the darker body -> crisp geometric creatures
const EDGES = {
  [TYPE.SKULL]: new THREE.EdgesGeometry(GEO[TYPE.SKULL]),
  [TYPE.SWARM]: new THREE.EdgesGeometry(GEO[TYPE.SWARM]),
  [TYPE.CHARGER]: new THREE.EdgesGeometry(GEO[TYPE.CHARGER]),
  [TYPE.SPAWNER]: new THREE.EdgesGeometry(GEO[TYPE.SPAWNER]),
};

const SPEC = {
  [TYPE.SKULL]:   { hp: 3,  r: 0.85, speed: 3.4, gem: 1, hex: HEX.magenta },
  [TYPE.SWARM]:   { hp: 2,  r: 0.55, speed: 6.4, gem: 1, hex: HEX.cyan },
  [TYPE.CHARGER]: { hp: 5,  r: 0.85, speed: 3.0, gem: 2, hex: HEX.orange },
  [TYPE.SPAWNER]: { hp: 14, r: 1.5,  speed: 1.4, gem: 4, hex: HEX.violet },
};

export class Enemies {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.active = [];
    this.free = [];
    this.cap = 150;
    this.intensity = 0;
    // callbacks wired by the game
    this.onKill = null;     // (enemy) => void   (gems, score, audio)
    this.onSpawn = null;    // (enemy) => void
  }

  _obj(type) {
    const spec = SPEC[type];
    const mat = neonMaterial(spec.hex);
    const mesh = new THREE.Mesh(GEO[type], mat);
    const edgeMat = new THREE.LineBasicMaterial({ color: spec.hex, toneMapped: false, transparent: true });
    const edges = new THREE.LineSegments(EDGES[type], edgeMat);
    mesh.add(edges);
    const e = {
      type, mesh, mat, edgeMat,
      base: new THREE.Color(spec.hex),
      hp: spec.hp, maxHp: spec.hp, radius: spec.r, speed: spec.speed, gem: spec.gem,
      alive: false, flash: 0, t: 0, phase: 0, weaveSeed: 0,
      vx: 0, vz: 0,
      chargeState: 0, chargeTimer: 0, cdx: 0, cdz: 0,
      emitTimer: 0, scaleBase: 1, spin: new THREE.Vector3(),
    };
    mesh.visible = false;
    this.scene.add(mesh);
    return e;
  }

  spawn(type, x, z) {
    if (this.active.length >= this.cap) return null;
    let e = null;
    // reuse a freed enemy of same type if possible
    for (let i = 0; i < this.free.length; i++) {
      if (this.free[i].type === type) { e = this.free.splice(i, 1)[0]; break; }
    }
    if (!e) e = this._obj(type);

    const spec = SPEC[type];
    e.hp = spec.maxHp ?? spec.hp;
    e.maxHp = spec.hp;
    e.alive = true;
    e.flash = 0;
    e.t = Math.random() * 10;
    e.phase = Math.random() * Math.PI * 2;
    e.weaveSeed = Math.random() * Math.PI * 2;
    e.chargeState = 0; e.chargeTimer = 1 + Math.random() * 1.5;
    e.emitTimer = 3 + Math.random() * 2;
    e.scaleBase = 1;
    e.vx = 0; e.vz = 0;
    e.spin.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    e.mesh.position.set(x, HOVER + (type === TYPE.SPAWNER ? 0.6 : 0), z);
    e.mesh.scale.setScalar(0.01); // pop-in
    e.mesh.visible = true;
    e.mat.emissive.copy(e.base);
    e.mat.emissiveIntensity = 0.5;
    e.edgeMat.color.copy(e.base);
    e.edgeMat.opacity = 1;
    this.active.push(e);
    this.onSpawn && this.onSpawn(e);
    return e;
  }

  // nearest active enemy roughly ahead of a dagger (for homing)
  nearest(px, py, pz, dx, dy, dz) {
    let best = null, bestD = 30 * 30;
    for (const e of this.active) {
      if (!e.alive) continue;
      const ex = e.mesh.position.x - px, ey = e.mesh.position.y - py, ez = e.mesh.position.z - pz;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > bestD) continue;
      const dl = Math.sqrt(d2) || 1;
      if ((ex * dx + ey * dy + ez * dz) / dl < 0.3) continue; // must be ahead-ish
      bestD = d2; best = e;
    }
    return best ? best.mesh.position : null;
  }

  // returns { killed:boolean } — caller handles gems/particles/score
  damage(e, dmg, hx, hy, hz) {
    if (!e.alive) return { killed: false };
    e.hp -= dmg;
    e.flash = 1;
    // tiny knockback away from impact
    const dx = e.mesh.position.x - hx, dz = e.mesh.position.z - hz;
    const dl = Math.hypot(dx, dz) || 1;
    e.vx += (dx / dl) * 1.2; e.vz += (dz / dl) * 1.2;
    this.particles.burst(hx, hy, hz, 5, { color: e.base, speed: 7, life: 0.3, size: 0.12, drag: 6 });
    if (e.hp <= 0) { this._die(e); return { killed: true }; }
    return { killed: false };
  }

  _die(e) {
    e.alive = false;
    e.mesh.visible = false;
    const p = e.mesh.position;
    // death burst
    this.particles.burst(p.x, p.y, p.z, e.type === TYPE.SPAWNER ? 60 : 26, {
      color: e.base, speed: e.type === TYPE.SPAWNER ? 16 : 11, life: 0.8, size: 0.22, drag: 2.2, upBias: 1.5,
    });
    // spawner splits into swarmers
    if (e.type === TYPE.SPAWNER) {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        this.spawn(TYPE.SWARM, p.x + Math.cos(a) * 1.5, p.z + Math.sin(a) * 1.5);
      }
    }
    this.onKill && this.onKill(e);
    const i = this.active.indexOf(e);
    if (i !== -1) this.active.splice(i, 1);
    this.free.push(e);
  }

  // returns true if the player was touched this frame
  update(dt, player, time) {
    const px = player.pos.x, pz = player.pos.z, py = player.pos.y + 1.0;
    let playerHit = false;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.t += dt;
      // pop-in scale
      const targetScale = e.scaleBase * (e.type === TYPE.SPAWNER ? 1 + Math.sin(e.t * 3) * 0.06 : 1);
      e.mesh.scale.setScalar(clamp(e.mesh.scale.x + (targetScale - e.mesh.scale.x) * dt * 8, 0.01, 2));

      const pos = e.mesh.position;
      let dx = px - pos.x, dz = pz - pos.z;
      let dist = Math.hypot(dx, dz) || 1;
      const nx = dx / dist, nz = dz / dist;
      const sp = e.speed + this.intensity * 1.8;

      switch (e.type) {
        case TYPE.SKULL: {
          e.vx += (nx * sp - e.vx) * dt * 3;
          e.vz += (nz * sp - e.vz) * dt * 3;
          break;
        }
        case TYPE.SWARM: {
          // weave perpendicular for juking approach
          const w = Math.sin(e.t * 6 + e.weaveSeed) * 0.9;
          const tx = nx + (-nz) * w, tz = nz + (nx) * w;
          const tl = Math.hypot(tx, tz) || 1;
          e.vx += ((tx / tl) * sp - e.vx) * dt * 4;
          e.vz += ((tz / tl) * sp - e.vz) * dt * 4;
          break;
        }
        case TYPE.CHARGER: {
          if (e.chargeState === 0) {
            // approach to mid range
            const want = dist > 13 ? 1 : -0.3;
            e.vx += (nx * sp * want - e.vx) * dt * 3;
            e.vz += (nz * sp * want - e.vz) * dt * 3;
            e.chargeTimer -= dt;
            if (e.chargeTimer <= 0 && dist < 16) { e.chargeState = 1; e.chargeTimer = 0.6; }
          } else if (e.chargeState === 1) {
            // windup: brake + grow
            e.vx *= Math.exp(-6 * dt); e.vz *= Math.exp(-6 * dt);
            e.scaleBase = 1.25;
            e.chargeTimer -= dt;
            if (e.chargeTimer <= 0) { e.chargeState = 2; e.chargeTimer = 0.7; e.cdx = nx; e.cdz = nz; e.scaleBase = 1; }
          } else {
            // charge straight
            const cs = (sp + 12);
            e.vx = e.cdx * cs; e.vz = e.cdz * cs;
            e.chargeTimer -= dt;
            if (e.chargeTimer <= 0) { e.chargeState = 0; e.chargeTimer = 1.2 + Math.random(); }
          }
          break;
        }
        case TYPE.SPAWNER: {
          e.vx += (nx * sp - e.vx) * dt * 1.5;
          e.vz += (nz * sp - e.vz) * dt * 1.5;
          e.emitTimer -= dt;
          if (e.emitTimer <= 0 && this.active.length < this.cap - 2) {
            e.emitTimer = 3.2 - this.intensity * 0.8 + Math.random();
            const a = Math.random() * Math.PI * 2;
            this.spawn(TYPE.SWARM, pos.x + Math.cos(a) * 1.6, pos.z + Math.sin(a) * 1.6);
            this.particles.burst(pos.x, pos.y, pos.z, 12, { color: e.base, speed: 6, life: 0.4, size: 0.16 });
          }
          break;
        }
      }

      pos.x += e.vx * dt;
      pos.z += e.vz * dt;
      // hover bob
      pos.y = HOVER + (e.type === TYPE.SPAWNER ? 0.6 : 0) + Math.sin(e.t * 2 + e.phase) * 0.22;

      // spin
      e.mesh.rotation.x += e.spin.x * dt * 0.8;
      e.mesh.rotation.y += e.spin.y * dt * (e.type === TYPE.SWARM ? 4 : 1.2);
      e.mesh.rotation.z += e.spin.z * dt * 0.6;

      // hit flash decay
      if (e.flash > 0) {
        e.flash = Math.max(0, e.flash - dt * 5);
        e.mat.emissive.copy(e.base).lerp(WHITE, e.flash);
        e.mat.emissiveIntensity = 0.5 + e.flash * 5;
        e.edgeMat.color.copy(e.base).lerp(WHITE, e.flash);
      }

      // contact with player?
      if (dist < e.radius + PLAYER_R && Math.abs(pos.y - py) < 1.6) {
        playerHit = true;
      }
    }

    return playerHit;
  }

  forEach(fn) { for (let i = this.active.length - 1; i >= 0; i--) fn(this.active[i], i); }

  count() { return this.active.length; }

  reset() {
    for (const e of this.active) { e.alive = false; e.mesh.visible = false; this.free.push(e); }
    this.active.length = 0;
  }
}

const WHITE = new THREE.Color(0xffffff);
