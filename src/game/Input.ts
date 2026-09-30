/**
 * Keyboard + gamepad. Movement is screen-relative (up = toward the net from the broadcast
 * camera). Shots: J topspin, K flat, L slice, I lob, U drop shot (gamepad: A, X, B, Y, LB).
 * Shots are held to charge; the aim is whatever direction is held when the ball is struck.
 */
export type ShotType = 'topspin' | 'flat' | 'slice' | 'lob' | 'drop';

const KEYMAP: Record<string, ShotType> = { KeyJ: 'topspin', KeyK: 'flat', KeyL: 'slice', KeyI: 'lob', KeyU: 'drop', Space: 'topspin' };

export class Input {
  private keys = new Set<string>();
  /** shot presses since the last poll (type, time) */
  private presses: ShotType[] = [];
  private held = new Set<ShotType>();
  private padPrev: boolean[] = [];
  anyKey = false;
  onPause: (() => void) | null = null;
  onCamera: (() => void) | null = null;

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.anyKey = true;
      this.keys.add(e.code);
      const s = KEYMAP[e.code];
      if (s) {
        this.presses.push(s);
        this.held.add(s);
        e.preventDefault();
      }
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (e.code === 'KeyC') this.onCamera?.();
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const s = KEYMAP[e.code];
      if (s) this.held.delete(s);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.held.clear();
    });
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** screen-relative stick: x right, y up (toward the net), length ≤ 1 */
  stick(): { x: number; y: number } {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    const p = this.pad();
    if (p) {
      const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.18) {
        x += ax;
        y -= ay;
      }
      if (p.buttons[14]?.pressed) x -= 1;
      if (p.buttons[15]?.pressed) x += 1;
      if (p.buttons[12]?.pressed) y += 1;
      if (p.buttons[13]?.pressed) y -= 1;
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  /** gamepad buttons → shot presses (call once per frame) */
  pollPad() {
    const p = this.pad();
    if (!p) return;
    const map: [number, ShotType][] = [[0, 'topspin'], [2, 'flat'], [1, 'slice'], [3, 'lob'], [4, 'drop']];
    for (const [i, s] of map) {
      const down = !!p.buttons[i]?.pressed;
      if (down && !this.padPrev[i]) { this.presses.push(s); this.anyKey = true; }
      if (down) this.held.add(s);
      else if (this.padPrev[i]) this.held.delete(s);
      this.padPrev[i] = down;
    }
    const start = !!p.buttons[9]?.pressed;
    if (start && !this.padPrev[9]) this.onPause?.();
    this.padPrev[9] = start;
  }

  takePress(): ShotType | null {
    return this.presses.shift() ?? null;
  }

  clearPresses() {
    this.presses.length = 0;
  }

  isHeld(s: ShotType): boolean {
    return this.held.has(s);
  }

  get sprint(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || !!this.pad()?.buttons[7]?.pressed;
  }
}
