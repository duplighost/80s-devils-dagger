import * as THREE from 'three';
import { ARENA_RADIUS } from './world.js';
import { clamp, damp, TAU } from './util.js';

const EYE = 1.72;
const MAX_SPEED = 15.5;       // fast, Devil-Daggers-ish
const ACCEL = 110;
const FRICTION = 12;
const GRAVITY = 42;
const HOP_V = 12.5;
const DASH_SPEED = 34;
const DASH_TIME = 0.16;
const DASH_CD = 1.1;
const RIM = ARENA_RADIUS - 0.6;

// First-person controller: planar strafe movement on the arena, mouse-look,
// dash + hop, head-bob, and the eye transform the camera rides.
export class Player {
  constructor(input) {
    this.input = input;
    this.pos = new THREE.Vector3(0, 0, 0); // feet
    this.vel = new THREE.Vector3();
    this.yaw = 0;   // face the sun (-Z) at start
    this.pitch = 0;
    this.grounded = true;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.dashTimer = 0;
    this.dashCd = 0;
    this.invuln = 0;     // i-frames (dash dodge)
    this.alive = true;
    this.stepAccrue = 0;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = true;
    this.dashTimer = 0;
    this.dashCd = 0;
    this.invuln = 0;
    this.alive = true;
    this.bobPhase = 0;
    this.bobAmt = 0;
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  forward(out = this._fwd) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
  }

  // events emitted for audio/juice: { stepped, dashed, hopped }
  update(dt, events) {
    const inp = this.input;

    // --- look ---
    this.yaw -= inp.mouseDX * inp.sensitivity;
    this.pitch -= inp.mouseDY * inp.sensitivity;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    this.yaw = (this.yaw + TAU) % TAU;

    // --- wish direction (planar, yaw only) ---
    const ax = inp.moveAxis();
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    // forward on plane = (sinY, -cosY); right = (cosY, sinY)
    let wx = ax.x * cosY + ax.z * sinY;
    let wz = ax.x * sinY - ax.z * cosY;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    // --- dash (brief i-frames so you can dodge through bullets/charges) ---
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.dashTimer > 0) this.dashTimer -= dt;
    if ((inp.down('ShiftLeft') || inp.down('ShiftRight')) && this.dashCd <= 0 && wl > 0 && this.dashTimer <= 0) {
      this.vel.x = wx * DASH_SPEED;
      this.vel.z = wz * DASH_SPEED;
      this.dashTimer = DASH_TIME;
      this.dashCd = DASH_CD;
      this.invuln = 0.28;
      events && (events.dashed = true);
    }

    // --- accelerate / friction (skip while dash impulse active) ---
    if (this.dashTimer <= 0) {
      if (wl > 0) {
        this.vel.x += wx * ACCEL * dt;
        this.vel.z += wz * ACCEL * dt;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > MAX_SPEED) { this.vel.x *= MAX_SPEED / sp; this.vel.z *= MAX_SPEED / sp; }
      } else {
        const f = Math.exp(-FRICTION * dt);
        this.vel.x *= f; this.vel.z *= f;
      }
    }

    // --- hop ---
    if (inp.down('Space') && this.grounded) {
      this.vel.y = HOP_V;
      this.grounded = false;
      events && (events.hopped = true);
    }

    // --- gravity / vertical ---
    this.vel.y -= GRAVITY * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.grounded = true; }

    // --- integrate planar ---
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // --- arena boundary: clamp to rim (no cheap fall-deaths) ---
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > RIM) {
      const nx = this.pos.x / r, nz = this.pos.z / r;
      this.pos.x = nx * RIM; this.pos.z = nz * RIM;
      // kill outward velocity component
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn > 0) { this.vel.x -= vn * nx; this.vel.z -= vn * nz; }
    }

    // --- head bob ---
    const planar = Math.hypot(this.vel.x, this.vel.z);
    const targetBob = this.grounded ? clamp(planar / MAX_SPEED, 0, 1) : 0;
    this.bobAmt = damp(this.bobAmt, targetBob, 8, dt);
    const prevPhase = this.bobPhase;
    this.bobPhase += planar * dt * 0.9;
    // footstep when bob crosses a step
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.bobPhase / Math.PI) && this.grounded && planar > 3) {
      events && (events.stepped = true);
    }
  }

  // Write the eye transform into the camera, layering shake offset/rotation.
  applyToCamera(camera, shakeOffset, shakeRoll) {
    const bobY = Math.sin(this.bobPhase * 2) * 0.06 * this.bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.05 * this.bobAmt;
    const e = this.eye;

    camera.position.set(
      e.x + shakeOffset.x,
      e.y + bobY + shakeOffset.y,
      e.z + shakeOffset.z
    );
    // strafe-roll + bob-roll for that kinetic feel
    const strafeRoll = -(this.vel.x * Math.cos(this.yaw) + this.vel.z * Math.sin(this.yaw)) / MAX_SPEED * 0.04;
    const euler = new THREE.Euler(this.pitch, this.yaw, strafeRoll + bobX * 0.5 + shakeRoll, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  }
}
