// Keyboard + mouse input with edge-triggered presses, pointer lock and safe focus handling.
// A single instance is attached once; attach() is idempotent so listeners never duplicate.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG', 'KeyJ', 'KeyT', 'KeyM',
  'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
]);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.pointerLocked = false;
    this.lockFailed = false;
    this.lockErrors = 0;
    this.enabled = false; // true while gameplay is capturing input
    this.attached = false;
    this.canvas = null;
    this.rightDrag = false;
    this.lastLockLossTime = -1;
    // Analog movement from the touch joystick: x = right, y = forward, both -1..1.
    this.analog = { x: 0, y: 0, active: false };
    this.touchMode = false;
    this.onModeChange = null;
    // Callbacks set by the game.
    this.onEscape = null;
    this.onFocusLost = null;
    this.onPointerLockLost = null;
    this._listeners = [];
  }

  attach(canvas) {
    if (this.attached) return;
    this.attached = true;
    this.canvas = canvas;
    const add = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._listeners.push([target, type, fn, opts]);
    };

    add(window, 'keydown', (e) => {
      if (e.code === 'Escape') {
        // When the browser just released pointer lock because of this Escape, the
        // pointer-lock handler already paused; don't toggle twice.
        if (performance.now() - this.lastLockLossTime < 250) return;
        if (this.onEscape) this.onEscape();
        return;
      }
      // a physical keyboard on a touch device switches back to keyboard + mouse controls
      if (this.touchMode && GAME_KEYS.has(e.code)) this.setTouchMode(false);
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat && !this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    add(window, 'keyup', (e) => {
      this.down.delete(e.code);
    });

    add(canvas, 'mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 2) {
        this.rightDrag = true;
        return;
      }
      if (e.button !== 0 || this.touchMode) return;
      if (!this.pointerLocked && !this.lockFailed && this.supportsPointerLock()) {
        // First click captures the mouse rather than attacking.
        this.requestPointerLock();
        return;
      }
      const code = 'Mouse0';
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    });
    add(window, 'mouseup', (e) => {
      if (e.button === 2) this.rightDrag = false;
      if (e.button === 0) this.down.delete('Mouse0');
    });
    add(document, 'mousemove', (e) => {
      if (!this.enabled) return;
      if (this.pointerLocked || this.rightDrag) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    add(canvas, 'wheel', (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    add(canvas, 'contextmenu', (e) => e.preventDefault());

    add(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      const wasLocked = this.pointerLocked;
      this.pointerLocked = locked;
      if (locked) this.lockErrors = 0;
      if (wasLocked && !locked) {
        this.lastLockLossTime = performance.now();
        this.clear();
        if (this.onPointerLockLost) this.onPointerLockLost();
      }
    });
    add(document, 'pointerlockerror', () => {
      // Chrome briefly refuses re-locking right after Esc, so an error then is transient.
      // Any other refusal (e.g. an embedding frame without pointer-lock permission) means
      // fall back at once to click-to-attack + right-drag camera.
      this.lockErrors++;
      const justExited = performance.now() - this.lastLockLossTime < 1500;
      if (!justExited || this.lockErrors >= 3) this.lockFailed = true;
    });

    // any touch anywhere switches the game to on-screen controls
    add(window, 'pointerdown', (e) => {
      if (e.pointerType === 'touch' && !this.touchMode) this.setTouchMode(true);
    }, true);

    add(window, 'blur', () => this._focusLost());
    add(document, 'visibilitychange', () => {
      if (document.hidden) this._focusLost();
    });
  }

  detach() {
    for (const [target, type, fn, opts] of this._listeners) target.removeEventListener(type, fn, opts);
    this._listeners.length = 0;
    this.attached = false;
  }

  supportsPointerLock() {
    return !!(this.canvas && this.canvas.requestPointerLock);
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    if (on) this.exitPointerLock();
    this.analog.x = this.analog.y = 0;
    this.analog.active = false;
    if (this.onModeChange) this.onModeChange(on);
  }

  requestPointerLock() {
    if (this.touchMode || !this.supportsPointerLock() || this.pointerLocked) return;
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          // Chrome refuses re-locking right after an exit; the next click retries.
        });
      }
    } catch {
      this.lockFailed = true;
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.canvas && document.exitPointerLock) {
      this.pointerLocked = false;
      document.exitPointerLock();
    }
  }

  _focusLost() {
    this.clear();
    if (this.onFocusLost) this.onFocusLost();
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Programmatic input injection (used by automated tests and debug tools). */
  inject(code, isDown) {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else {
      this.down.delete(code);
    }
  }

  tap(code) {
    this.pressed.add(code);
  }

  /** Call once per rendered frame after the simulation consumed this frame's input. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  clear() {
    this.down.clear();
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.rightDrag = false;
    this.analog.x = this.analog.y = 0;
    this.analog.active = false;
    if (this.onClear) this.onClear();
  }
}
