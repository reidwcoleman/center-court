import { BALL_R, netTop, type Surface } from './dims.ts';
import { spinFor, type V3, v3 } from './Ball.ts';

/**
 * The shot solver: which launch velocity lands a ball struck at p0 with this pace and spin
 * on the target? It flies the real drag + Magnus model (no net) and searches the elevation
 * (range is single-peaked in elevation: a low branch for drives, a high one for lobs), then
 * corrects the azimuth for sidespin drift. If the ball can't clear the net with the margin
 * asked for, the pace comes down until it can — what a player does to make a shot.
 */

export interface ShotSpec {
  speed: number;
  rpm: number;
  side?: number;
  arc?: 'low' | 'high';
  /** required height of the ball's bottom over the cord (m) */
  clear?: number;
  /** don't lower the pace to make the shot (a flat-out swing that may miss) */
  commit?: boolean;
}

export interface ShotSolution {
  v: V3;
  w: V3;
  speed: number;
  land: { x: number; z: number };
  netClear: number;
  ok: boolean;
  elev: number;
}

const RHO = 1.21, A = Math.PI * BALL_R * BALL_R, M = 0.0577;
const KD = (0.5 * RHO * 0.55 * A) / M, KL = (0.5 * RHO * A) / M;

/** fly without the net until the first ground contact: landing point, and the height when crossing z = 0 */
export function flyToGround(p0: V3, v0: V3, w0: V3, dt = 1 / 240, tMax = 5): { x: number; z: number; t: number; netY: number; netX: number } {
  let px = p0.x, py = p0.y, pz = p0.z, vx = v0.x, vy = v0.y, vz = v0.z;
  const wx = w0.x, wy = w0.y, wz = w0.z;
  let netY = Infinity, netX = 0;
  let t = 0;
  const decay = Math.exp(-dt / 6);
  let sx = wx, sy = wy, sz = wz;
  while (t < tMax) {
    const s = Math.hypot(vx, vy, vz);
    let ax = -KD * s * vx, ay = -KD * s * vy - 9.81, az = -KD * s * vz;
    const ws = Math.hypot(sx, sy, sz);
    if (ws > 1e-3) {
      const cl = 1 / (2 + s / (BALL_R * ws));
      let cx = sy * vz - sz * vy, cy = sz * vx - sx * vz, cz = sx * vy - sy * vx;
      const cn = Math.hypot(cx, cy, cz);
      if (cn > 1e-9) {
        const m = (KL * cl * s * s) / cn;
        ax += cx * m; ay += cy * m; az += cz * m;
      }
    }
    vx += ax * dt; vy += ay * dt; vz += az * dt;
    const opz = pz, opy = py, opx = px;
    px += vx * dt; py += vy * dt; pz += vz * dt;
    sx *= decay; sy *= decay; sz *= decay;
    t += dt;
    if ((opz > 0) !== (pz > 0)) {
      const f = opz / (opz - pz);
      netY = opy + (py - opy) * f;
      netX = opx + (px - opx) * f;
    }
    if (py <= BALL_R) {
      const f = (opy - BALL_R) / Math.max(1e-6, opy - py);
      return { x: opx + (px - opx) * f, z: opz + (pz - opz) * f, t: t - dt * (1 - f), netY, netX };
    }
  }
  return { x: px, z: pz, t, netY, netX };
}

export function solveShot(p0: V3, target: { x: number; z: number }, spec: ShotSpec, _surface: Surface = 'hard'): ShotSolution {
  const clear = spec.clear ?? 0.05;
  let speed = spec.speed;
  let best: ShotSolution | null = null;
  for (let attempt = 0; attempt < 14; attempt++) {
    const sol = solveAtSpeed(p0, target, speed, spec);
    const ok = sol.netClear >= clear && Math.hypot(sol.land.x - target.x, sol.land.z - target.z) < 0.6;
    sol.ok = ok;
    if (ok) return sol;
    if (!best || sol.netClear > best.netClear) best = sol;
    if (spec.commit) return sol;
    // into the net or can't get there: ease off (or, if it falls short, hit harder)
    const short = Math.hypot(sol.land.x - p0.x, sol.land.z - p0.z) < Math.hypot(target.x - p0.x, target.z - p0.z) - 0.6;
    if (short && sol.netClear >= clear) speed *= 1.08;
    else speed *= 0.92;
    if (speed < 6) break;
  }
  return best!;
}

function solveAtSpeed(p0: V3, target: { x: number; z: number }, speed: number, spec: ShotSpec): ShotSolution {
  const dx = target.x - p0.x, dz = target.z - p0.z;
  const D = Math.hypot(dx, dz);
  let az = Math.atan2(dz, dx);
  const arc = spec.arc ?? 'low';
  let elev = 0;
  let res = { x: 0, z: 0, t: 0, netY: 0, netX: 0 };
  let w = v3();
  const velOf = (e: number, a: number) => v3(Math.cos(e) * Math.cos(a) * speed, Math.sin(e) * speed, Math.cos(e) * Math.sin(a) * speed);
  for (let iter = 0; iter < 3; iter++) {
    w = spinFor(Math.cos(az), Math.sin(az), spec.rpm, spec.side ?? 0);
    const range = (e: number) => {
      const r = flyToGround(p0, velOf(e, az), w, 1 / 180);
      // signed distance along the aim direction
      return ((r.x - p0.x) * dx + (r.z - p0.z) * dz) / D;
    };
    // the elevation of maximum range (golden section)
    let lo = -0.35, hi = 1.2;
    const gr = 0.618;
    let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
    let fc = range(c), fd = range(d);
    for (let k = 0; k < 16; k++) {
      if (fc > fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = range(c); }
      else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = range(d); }
    }
    const eMax = (lo + hi) / 2;
    const rMax = range(eMax);
    if (rMax < D) elev = eMax;
    else {
      // bisection on the chosen branch
      let a = arc === 'low' ? -0.6 : eMax, b = arc === 'low' ? eMax : 1.45;
      for (let k = 0; k < 22; k++) {
        const m = (a + b) / 2;
        const r = range(m);
        if (arc === 'low' ? r < D : r > D) a = m;
        else b = m;
      }
      elev = (a + b) / 2;
    }
    res = flyToGround(p0, velOf(elev, az), w, 1 / 180);
    // azimuth correction for drift
    const landAz = Math.atan2(res.z - p0.z, res.x - p0.x);
    const want = Math.atan2(dz, dx);
    let dAz = want - landAz;
    dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
    if (Math.abs(dAz) < 1e-4) break;
    az += dAz;
  }
  const v = velOf(elev, az);
  const netClear = res.netY === Infinity ? 9 : res.netY - BALL_R - netTop(res.netX);
  return { v, w, speed, land: { x: res.x, z: res.z }, netClear, ok: false, elev };
}
