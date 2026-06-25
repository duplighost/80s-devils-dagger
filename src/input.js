// Pointer-lock mouse-look + keyboard state. Exposes per-frame mouse delta that
// the player reads and zeroes each tick.
export class Input {
  constructor(domElement) {
    this.el = domElement;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.lmb = false;        // left mouse currently held
    this.rmb = false;
    this.lmbPressedThisFrame = false;
    this.lmbReleasedThisFrame = false;
    this.locked = false;
    this.sensitivity = 0.0022;

    this._onLock = null;     // callbacks set by game
    this._onUnlock = null;

    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      // Avoid the browser scrolling on space / arrows while playing.
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      this.keys.add(e.code);
    }, { passive: false });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    this.el.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.lmb = true; this.lmbPressedThisFrame = true; }
      if (e.button === 2) this.rmb = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.lmb = false; this.lmbReleasedThisFrame = true; }
      if (e.button === 2) this.rmb = false;
    });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.locked) this._onLock && this._onLock();
      else this._onUnlock && this._onUnlock();
    });
  }

  requestLock() {
    if (!this.locked && this.el.requestPointerLock) {
      const p = this.el.requestPointerLock();
      // Chromium returns a promise that rejects if called too soon after exit.
      if (p && p.catch) p.catch(() => {});
    }
  }
  exitLock() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }

  // Movement axes from WASD (and arrows). x = strafe, z = forward(-)/back(+).
  moveAxis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }

  // Call at end of each frame.
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.lmbPressedThisFrame = false;
    this.lmbReleasedThisFrame = false;
  }
}
