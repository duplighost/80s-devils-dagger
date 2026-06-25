import * as THREE from 'three';
import { HEX } from './palette.js';

// Pooled additive point-sprite particles for muzzle flashes, sparks, enemy
// death bursts, gem pickups and the player-death supernova.
const MAX = 3000;

export class Particles {
  constructor(scene) {
    this.px = new Float32Array(MAX);
    this.py = new Float32Array(MAX);
    this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX);
    this.vy = new Float32Array(MAX);
    this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.cursor = 0;

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aDat = new THREE.BufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage); // size, alpha
    g.setAttribute('position', this.aPos);
    g.setAttribute('aCol', this.aCol);
    g.setAttribute('aDat', this.aDat);
    g.setDrawRange(0, MAX);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: innerHeight } },
      vertexShader: /* glsl */`
        attribute vec3 aCol; attribute vec2 aDat;
        uniform float uScale;
        varying vec3 vCol; varying float vA;
        void main(){
          vCol = aCol; vA = aDat.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aDat.x * uScale / max(-mv.z, 0.1);
          if (vA <= 0.0) gl_PointSize = 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        precision mediump float;
        varying vec3 vCol; varying float vA;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = smoothstep(0.25, 0.0, r) * vA;
          gl_FragColor = vec4(vCol * (0.6 + vA), a);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.mat = mat;
    addEventListener('resize', () => (mat.uniforms.uScale.value = innerHeight));
  }

  _emit(x, y, z, vx, vy, vz, life, size, col, drag = 2.0, grav = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % MAX;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
    this.drag[i] = drag; this.grav[i] = grav;
    this.aCol.array[i * 3] = col.r; this.aCol.array[i * 3 + 1] = col.g; this.aCol.array[i * 3 + 2] = col.b;
  }

  burst(x, y, z, n, opts = {}) {
    const speed = opts.speed ?? 6;
    const spread = opts.spread ?? 1;
    const life = opts.life ?? 0.6;
    const size = opts.size ?? 0.16;
    const col = opts.color || new THREE.Color(HEX.cyan);
    const grav = opts.grav ?? 0;
    const drag = opts.drag ?? 2.2;
    const upBias = opts.upBias ?? 0;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const z2 = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - z2 * z2);
      const sp = speed * (0.4 + Math.random() * 0.6) * spread;
      this._emit(
        x, y, z,
        Math.cos(a) * r * sp, z2 * sp + upBias, Math.sin(a) * r * sp,
        life * (0.6 + Math.random() * 0.6),
        size * (0.6 + Math.random() * 0.8),
        col, drag, grav
      );
    }
  }

  // directional cone (muzzle flash / impact spark)
  cone(x, y, z, dir, n, opts = {}) {
    const speed = opts.speed ?? 14;
    const life = opts.life ?? 0.25;
    const size = opts.size ?? 0.18;
    const col = opts.color || new THREE.Color(HEX.cyan);
    const jitter = opts.jitter ?? 0.5;
    for (let k = 0; k < n; k++) {
      const jx = (Math.random() - 0.5) * jitter;
      const jy = (Math.random() - 0.5) * jitter;
      const jz = (Math.random() - 0.5) * jitter;
      const sp = speed * (0.5 + Math.random() * 0.8);
      this._emit(
        x, y, z,
        (dir.x + jx) * sp, (dir.y + jy) * sp, (dir.z + jz) * sp,
        life * (0.6 + Math.random() * 0.7), size * (0.7 + Math.random() * 0.6), col, 4.0, 0
      );
    }
  }

  update(dt) {
    const pos = this.aPos.array, dat = this.aDat.array;
    for (let i = 0; i < MAX; i++) {
      let l = this.life[i];
      if (l <= 0) { dat[i * 2 + 1] = 0; continue; }
      l -= dt; this.life[i] = l;
      if (l <= 0) { dat[i * 2 + 1] = 0; continue; }
      const f = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= f; this.vz[i] *= f; this.vy[i] = this.vy[i] * f - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      pos[i * 3] = this.px[i]; pos[i * 3 + 1] = this.py[i]; pos[i * 3 + 2] = this.pz[i];
      const t = l / this.max[i];
      dat[i * 2] = this.size[i] * (0.4 + t * 0.8);
      dat[i * 2 + 1] = t * t;
    }
    this.aPos.needsUpdate = true;
    this.aDat.needsUpdate = true;
    this.aCol.needsUpdate = true;
  }

  reset() {
    this.life.fill(0);
    for (let i = 0; i < MAX; i++) this.aDat.array[i * 2 + 1] = 0;
    this.aDat.needsUpdate = true;
  }
}
