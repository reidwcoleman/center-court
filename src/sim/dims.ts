/**
 * ITF court dimensions (metres). Frame: x across the court (right of the near baseline is +x),
 * z along it (net at z = 0, the near baseline at z = +HL), y up.
 */
export const HL = 11.885; // half length (baseline)
export const HW = 5.485; // half width, doubles sideline (outer edge)
export const HSW = 4.115; // half width, singles sideline (outer edge)
export const SERVICE = 6.4; // service line (outer edge) from the net
export const LINE = 0.05;
export const BASELINE = 0.1;
export const NET_CENTER = 0.914;
export const NET_POST = 1.07;
/** singles sticks (0.914 m outside the singles lines) and the doubles posts */
export const STICK_X = HSW + 0.914;
export const POST_X = HW + 0.914;
/** the playing floor inside the walls */
export const FLOOR_HX = 10.6;
export const FLOOR_HZ = 19.2;

export const BALL_R = 0.0335;
export const BALL_M = 0.0577;

/** the net's top (cord) height at x: 0.914 at the strap, 1.07 at the singles sticks (a sagging cord) */
export function netTop(x: number): number {
  const a = Math.min(1, Math.abs(x) / STICK_X);
  return NET_CENTER + (NET_POST - NET_CENTER) * (a * a * 0.35 + a * 0.65);
}

export type Surface = 'hard' | 'clay' | 'grass';

/**
 * ball-surface interaction per surface (see Ball.ts): vertical restitution, sliding friction,
 * and how much horizontal pace the surface itself takes (clay bites, grass skids)
 */
export const SURFACE_PHYS: Record<Surface, { e: number; mu: number; keep: number; name: string }> = {
  hard: { e: 0.76, mu: 0.62, keep: 0.97, name: 'Hard' },
  clay: { e: 0.81, mu: 0.85, keep: 0.88, name: 'Clay' },
  grass: { e: 0.68, mu: 0.42, keep: 1.0, name: 'Grass' },
};
