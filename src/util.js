// Small math / helper grab-bag. No three.js dependency so it stays cheap.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

// Frame-rate independent damping. `lambda` ~ how fast (higher = snappier).
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// Deterministic PRNG (mulberry32) so explosions/visuals can be seeded if needed.
export function makeRng(seed = 0x9e3779b9) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

// Format centiseconds-precision survival time like Devil Daggers: "SS.ssss".
export function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const whole = Math.floor(s);
  const frac = Math.floor((s - whole) * 10000)
    .toString()
    .padStart(4, '0');
  return `${whole.toString().padStart(2, '0')}.${frac}`;
}

// Tiny object pool for hot-path allocations (projectiles, particles, enemies).
export class Pool {
  constructor(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.active = [];
  }
  spawn(...args) {
    const obj = this.free.pop() || this.factory();
    this.reset(obj, ...args);
    this.active.push(obj);
    return obj;
  }
  release(obj) {
    const i = this.active.indexOf(obj);
    if (i !== -1) this.active.splice(i, 1);
    this.free.push(obj);
  }
  // Iterate active backwards so callers can release safely mid-loop.
  forEachActive(fn) {
    for (let i = this.active.length - 1; i >= 0; i--) fn(this.active[i], i);
  }
}
