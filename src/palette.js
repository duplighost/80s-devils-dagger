import * as THREE from 'three';

// ---- Hotline-Miami / synthwave neon palette ------------------------------
// Kept as hex ints + THREE.Color helpers so materials and shaders share one
// source of truth.
export const HEX = {
  pink:    0xff2d95,
  hot:     0xff1e6f,
  magenta: 0xff3bdd,
  cyan:    0x18f0ff,
  ice:     0x9bf6ff,
  purple:  0xb026ff,
  violet:  0x7a2bff,
  indigo:  0x3a0ca3,
  amber:   0xffcf3a,
  orange:  0xff6b35,
  green:   0x39ff7a,
  white:   0xffffff,
  bg0:     0x0a0014,
  bg1:     0x1a0033,
  fog:     0x16002e,
};

export const COL = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, new THREE.Color(v)])
);

// Convenience: a fresh THREE.Color you can mutate without touching the shared one.
export const color = (k) => new THREE.Color(HEX[k]);

// Linear-light versions (renderer uses ACES + sRGB output, materials are in
// linear space). Handy for additive shader tints.
export const lin = (k) => color(k).convertSRGBToLinear();
