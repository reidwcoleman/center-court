import * as THREE from 'three';

/**
 * A rounded rectangle around the court and its offsets. The samples are shared by every
 * offset (corner arcs at fixed angles, straights subdivided), so strips built at different
 * offsets line up exactly, and a sample index names the same radial line on every row.
 */
export class Ring {
  /** corner centres and the start angle of each corner arc */
  readonly samples: { cx: number; cz: number; a: number; nx: number; nz: number; corner: boolean }[] = [];

  constructor(readonly ax: number, readonly az: number, readonly r: number, cornerSteps = 14, straightStep = 2.2) {
    const cx = ax - r, cz = az - r;
    const corners = [
      { cx, cz, a0: 0 },
      { cx: -cx, cz, a0: Math.PI / 2 },
      { cx: -cx, cz: -cz, a0: Math.PI },
      { cx, cz: -cz, a0: Math.PI * 1.5 },
    ];
    for (let k = 0; k < 4; k++) {
      const c = corners[k];
      for (let i = 0; i <= cornerSteps; i++) {
        const a = c.a0 + (i / cornerSteps) * (Math.PI / 2);
        this.samples.push({ cx: c.cx, cz: c.cz, a, nx: -Math.cos(a), nz: -Math.sin(a), corner: true });
      }
      // straight to the next corner, subdivided
      const n = corners[(k + 1) % 4];
      const aEnd = c.a0 + Math.PI / 2;
      const len = Math.hypot(n.cx - c.cx, n.cz - c.cz);
      const steps = Math.max(1, Math.round(len / straightStep));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        this.samples.push({ cx: c.cx + (n.cx - c.cx) * t, cz: c.cz + (n.cz - c.cz) * t, a: aEnd, nx: -Math.cos(aEnd), nz: -Math.sin(aEnd), corner: false });
      }
    }
  }

  get count() {
    return this.samples.length;
  }

  /** the point of sample i at offset d (outward from the base outline) */
  point(i: number, d: number, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.samples[((i % this.count) + this.count) % this.count];
    const R = this.r + d;
    return out.set(s.cx + R * Math.cos(s.a), 0, s.cz + R * Math.sin(s.a));
  }

  /** cumulative arc lengths of the offset outline (closed: count + 1 entries) */
  lengths(d: number): Float32Array {
    const L = new Float32Array(this.count + 1);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      this.point(i, d, a);
      this.point(i + 1, d, b);
      L[i + 1] = L[i] + a.distanceTo(b);
    }
    return L;
  }

  /** position + inward normal at arc length s along the offset outline */
  at(d: number, L: Float32Array, s: number, out: THREE.Vector3, nrm: THREE.Vector3): number {
    const total = L[this.count];
    s = ((s % total) + total) % total;
    let lo = 0, hi = this.count;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (L[m] <= s) lo = m;
      else hi = m;
    }
    const t = (s - L[lo]) / Math.max(1e-6, L[lo + 1] - L[lo]);
    const a = this.point(lo, d, new THREE.Vector3());
    const b = this.point(lo + 1, d, new THREE.Vector3());
    out.copy(a).lerp(b, t);
    const sa = this.samples[lo], sb = this.samples[(lo + 1) % this.count];
    nrm.set(sa.nx + (sb.nx - sa.nx) * t, 0, sa.nz + (sb.nz - sa.nz) * t).normalize();
    return lo + t;
  }
}

/** a growing triangle soup with positions, normals, uvs and colours (AO) */
export class Soup {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, ao = 1): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(ao, ao, ao);
    return this.pos.length / 3 - 1;
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }

  /**
   * A band around the ring between (dA, yA) and (dB, yB) — y may vary per sample (functions).
   * Normals are computed from the band's own slope. u runs along the ring (metres), v across.
   */
  band(ring: Ring, dA: number, yA: (i: number) => number, dB: number, yB: (i: number) => number, aoA = 1, aoB = 1, flip = false, uScale = 1, i0 = 0, i1 = ring.count) {
    const pa = new THREE.Vector3(), pb = new THREE.Vector3(), prev = new THREE.Vector3();
    const t = new THREE.Vector3(), across = new THREE.Vector3(), n = new THREE.Vector3();
    let u = 0;
    let lastA = -1, lastB = -1;
    const closed = i0 === 0 && i1 === ring.count;
    const end = closed ? ring.count : i1;
    for (let i = i0; i <= end; i++) {
      ring.point(i, dA, pa);
      pa.y = yA(i % ring.count);
      ring.point(i, dB, pb);
      pb.y = yB(i % ring.count);
      if (i > i0) u += pa.distanceTo(prev) * uScale;
      prev.copy(pa);
      // tangent along the ring, across the band
      ring.point(i + 1, dA, t).sub(ring.point(i - 1, dA, n)).normalize();
      across.subVectors(pb, pa).normalize();
      n.crossVectors(t, across).normalize();
      if (flip) n.negate();
      const a = this.vert(pa, n, u, 0, aoA);
      const b = this.vert(pb, n, u, pa.distanceTo(pb), aoB);
      if (lastA >= 0) {
        if (flip) this.quad(lastA, lastB, b, a);
        else this.quad(lastA, a, b, lastB);
      }
      lastA = a;
      lastB = b;
    }
  }
}
