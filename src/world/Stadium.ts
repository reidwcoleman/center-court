import * as THREE from 'three';
import { Ring, Soup } from './Ring.ts';
import { FLOOR_HX, FLOOR_HZ } from '../sim/dims.ts';
import { ledStrip, backdrop, suitesTexture, ribbonTexture } from './Boards.ts';
import { tex, lin, rng } from '../render/noise.ts';
import type { Venue } from './venues.ts';

/** a seat the crowd can use: position (seat pan), facing (inward normal), tier, row */
export interface SeatSpot {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  tier: number;
  row: number;
  /** 0 open sky … 1 deep under the roof */
  cover: number;
}

const WALL_SIDE = 1.0;
const WALL_END = 2.0;

/**
 * The bowl, all generated: the courtside walls (LED boards on the sides, the painted
 * backdrop behind the baselines), a lower tier of 20 rows, a fascia with suites and a
 * ribbon board, an upper tier of 24 steeper rows, the back wall, and a cantilevered roof
 * ring on radial trusses with the floodlight gantry at its lip. Seats are one instanced
 * mesh (≈20k), in section colours; every seat is also handed to the crowd.
 */
export class Stadium {
  readonly group = new THREE.Group();
  readonly seats: SeatSpot[] = [];
  readonly ring: Ring;
  readonly led: THREE.MeshStandardMaterial[] = [];
  readonly lamps: THREE.Mesh[] = [];
  /** tier geometry parameters (the crowd and cameras use them) */
  readonly lower = { d0: 0.7, rows: 20, D: 0.85, H: 0.4 };
  readonly upper = { d0: 18.2, rows: 24, D: 0.85, H: 0.53, y0: 15.0 };
  roofInner = 25;
  roofY = 32.5;
  private ledTex: THREE.CanvasTexture[] = [];

  constructor(readonly venue: Venue) {
    this.group.name = 'stadium';
    this.ring = new Ring(FLOOR_HX, FLOOR_HZ, 3.2);
  }

  /** the wall height at a ring sample: low on the sides, the tall backdrop behind the baselines */
  wallH(i: number): number {
    const s = this.ring.samples[i];
    const t = THREE.MathUtils.smoothstep(Math.abs(s.nz), 0.55, 0.95);
    return WALL_SIDE + (WALL_END - WALL_SIDE) * t;
  }

  lowerY(i: number, row: number): number {
    return this.wallH(i) + 0.25 + row * this.lower.H;
  }

  upperY(_i: number, row: number): number {
    return this.upper.y0 + row * this.upper.H;
  }

  async build() {
    const v = this.venue;
    const ring = this.ring;
    const [cc, cn, cr] = await Promise.all([tex('concrete_c.jpg', true), tex('concrete_n.jpg', false), tex('concrete_r.jpg', false)]);
    void cr;
    // (Lambert: the stands are a lot of pixels; they don't need a specular lobe)
    const concrete = new THREE.MeshLambertMaterial({
      map: cc, normalMap: cn, color: lin(v.concrete), vertexColors: true, normalScale: new THREE.Vector2(0.6, 0.6),
    });
    concrete.map!.repeat.set(0.35, 0.35);
    const paint = new THREE.MeshLambertMaterial({ color: lin(v.wall), vertexColors: true });
    const darkPaint = new THREE.MeshLambertMaterial({ color: new THREE.Color(v.wall).multiplyScalar(0.6), vertexColors: true });

    // ---------------------------------------------------------------- courtside walls
    {
      // LED boards everywhere; the backdrop's painted band sits above them at the ends
      const s = new Soup();
      s.band(ring, 0, () => 0, 0, (i) => Math.min(this.wallH(i), 0.92), 1, 1, false, 1 / 14.4);
      const ledMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.35, metalness: 0, emissive: 0xffffff, emissiveIntensity: 1 });
      const lt = ledStrip(v, 0);
      this.ledTex.push(lt);
      ledMat.emissiveMap = lt;
      this.led.push(ledMat);
      const m = new THREE.Mesh(s.geometry(), ledMat);
      m.name = 'led-boards';
      m.receiveShadow = true;
      this.group.add(m);
      // above the boards: the painted backdrop (ends) / a thin cap (sides)
      const s2 = new Soup();
      s2.band(ring, 0, () => 0.92, 0, (i) => this.wallH(i), 1, 1, false, 1 / 60);
      const bd = new THREE.MeshStandardMaterial({ map: backdrop(v), roughness: 0.8, vertexColors: true });
      const m2 = new THREE.Mesh(s2.geometry(), bd);
      m2.receiveShadow = true;
      m2.castShadow = true;
      this.group.add(m2);
      // wall top (coping) and the back of the wall
      const s3 = new Soup();
      s3.band(ring, 0, (i) => this.wallH(i), 0.25, (i) => this.wallH(i), 0.9, 0.8);
      s3.band(ring, 0.25, (i) => this.wallH(i), 0.25, () => 0, 0.8, 0.4, false);
      const m3 = new THREE.Mesh(s3.geometry(), darkPaint);
      m3.castShadow = true;
      m3.receiveShadow = true;
      this.group.add(m3);
      // the floor between the wall and the first row (a walkway), and the pit below the stands
      const s4 = new Soup();
      s4.band(ring, 0.25, () => 0.02, this.lower.d0, () => 0.02, 0.5, 0.35);
      s4.band(ring, this.lower.d0, () => 0.02, this.lower.d0, (i) => this.lowerY(i, 0), 0.35, 0.8, false);
      const m4 = new THREE.Mesh(s4.geometry(), concrete);
      m4.receiveShadow = true;
      this.group.add(m4);
    }

    // ---------------------------------------------------------------- lower tier
    const L = this.lower;
    const stepsLower = new Soup();
    for (let r = 0; r < L.rows; r++) {
      const d = L.d0 + r * L.D;
      // tread (front lip brighter, back corner occluded) + the riser up to the next row
      stepsLower.band(ring, d, (i) => this.lowerY(i, r), d + L.D, (i) => this.lowerY(i, r), 0.95, 0.62);
      if (r < L.rows - 1) stepsLower.band(ring, d + L.D, (i) => this.lowerY(i, r), d + L.D, (i) => this.lowerY(i, r + 1), 0.55, 0.92, false);
    }
    const lowerTopD = L.d0 + L.rows * L.D;
    // the back of the lower tier: a wall up to the upper tier's underside (in shadow)
    stepsLower.band(ring, lowerTopD, (i) => this.lowerY(i, L.rows - 1), lowerTopD, () => this.upper.y0 - 4.6, 0.45, 0.35, false);
    stepsLower.band(ring, lowerTopD, () => this.upper.y0 - 4.6, this.upper.d0 - 0.3, () => this.upper.y0 - 4.6, 0.45, 0.45);
    const lowerMesh = new THREE.Mesh(stepsLower.geometry(), concrete);
    lowerMesh.receiveShadow = true;
    lowerMesh.castShadow = true;
    lowerMesh.name = 'lower-tier';
    this.group.add(lowerMesh);

    // ---------------------------------------------------------------- fascia: suites + ribbon board
    const U = this.upper;
    {
      const d = U.d0 - 0.3;
      const yBot = this.upper.y0 - 4.6;
      // soffit under the upper tier's front
      const soffit = new Soup();
      soffit.band(ring, d, () => yBot, lowerTopD, () => yBot, 0.3, 0.2, true);
      const sm = new THREE.Mesh(soffit.geometry(), darkPaint);
      sm.castShadow = true;
      this.group.add(sm);
      // suites glass
      const suites = new Soup();
      suites.band(ring, d, () => yBot, d, () => yBot + 2.3, 1, 1, false, 1 / 16);
      const glass = new THREE.MeshPhysicalMaterial({
        map: suitesTexture(), emissiveMap: null, color: 0xffffff, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
        emissive: 0xffffff, emissiveIntensity: 0.0, vertexColors: true,
      });
      glass.emissiveMap = glass.map;
      const gm = new THREE.Mesh(suites.geometry(), glass);
      gm.name = 'suites';
      this.group.add(gm);
      this.led.push(glass);
      // ribbon board
      const rib = new Soup();
      rib.band(ring, d, () => yBot + 2.5, d, () => yBot + 3.7, 1, 1, false, 1 / 18);
      const ribMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.4 });
      const rt = ribbonTexture(v);
      this.ledTex.push(rt);
      ribMat.emissiveMap = rt;
      this.led.push(ribMat);
      const rm = new THREE.Mesh(rib.geometry(), ribMat);
      rm.name = 'ribbon';
      this.group.add(rm);
      // fascia frame between/around them + the parapet up to the first upper row
      const fr = new Soup();
      fr.band(ring, d, () => yBot + 2.3, d, () => yBot + 2.5, 0.8, 0.8, false);
      fr.band(ring, d, () => yBot + 3.7, d, () => U.y0 + 0.9, 0.85, 0.9, false);
      fr.band(ring, d, () => U.y0 + 0.9, d + 0.25, () => U.y0 + 0.9, 0.9, 0.8);
      const fm = new THREE.Mesh(fr.geometry(), paint);
      fm.castShadow = true;
      fm.receiveShadow = true;
      this.group.add(fm);
    }

    // ---------------------------------------------------------------- upper tier
    const stepsUpper = new Soup();
    for (let r = 0; r < U.rows; r++) {
      const d = U.d0 + r * U.D;
      const cover = this.coverAt(d);
      const ao = 1 - 0.45 * cover;
      stepsUpper.band(ring, d, (i) => this.upperY(i, r), d + U.D, (i) => this.upperY(i, r), 0.95 * ao, 0.6 * ao);
      stepsUpper.band(ring, d, (i) => this.upperY(i, r - 1), d, (i) => this.upperY(i, r), 0.55 * ao, 0.9 * ao, false);
    }
    const upperTopD = U.d0 + U.rows * U.D;
    const topY = this.upperY(0, U.rows - 1);
    // back wall up to the roof
    stepsUpper.band(ring, upperTopD, () => topY, upperTopD, () => topY + 3.2, 0.4, 0.35, false);
    const upperMesh = new THREE.Mesh(stepsUpper.geometry(), concrete);
    upperMesh.receiveShadow = true;
    upperMesh.castShadow = true;
    upperMesh.name = 'upper-tier';
    this.group.add(upperMesh);
    // the underside of the upper tier (seen from the lower tier's back rows)
    {
      const us = new Soup();
      us.band(ring, U.d0 - 0.3, () => this.upper.y0 - 4.6, upperTopD, () => topY - 2.5, 0.35, 0.2, true);
      const um = new THREE.Mesh(us.geometry(), darkPaint);
      um.castShadow = true;
      this.group.add(um);
    }

    // ---------------------------------------------------------------- roof
    {
      const outerD = upperTopD + 0.6;
      const innerD = this.roofInner;
      const yOut = topY + 3.2, yIn = this.roofY;
      this.roofY = yIn;
      const roof = new Soup();
      // top skin (rises to the lip), fascia at the lip, and the underside (lighter panels)
      roof.band(ring, innerD, () => yIn + 1.2, outerD, () => yOut + 1.6, 0.9, 0.9);
      roof.band(ring, innerD, () => yIn - 0.6, innerD, () => yIn + 1.2, 0.9, 0.9, false);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0xe9e9e6, roughness: 0.55, metalness: 0.2, vertexColors: true });
      const rm = new THREE.Mesh(roof.geometry(), roofMat);
      rm.castShadow = true;
      rm.receiveShadow = true;
      rm.name = 'roof';
      this.group.add(rm);
      const under = new Soup();
      under.band(ring, innerD, () => yIn - 0.6, outerD, () => yOut, 0.75, 0.45, true, 1 / 3);
      const underMat = new THREE.MeshLambertMaterial({ color: 0xcfd0cf, vertexColors: true, side: THREE.DoubleSide });
      const um = new THREE.Mesh(under.geometry(), underMat);
      um.castShadow = true;
      um.receiveShadow = true;
      this.group.add(um);
      // radial trusses under the roof (instanced) and the lamp heads along the lip
      const steel = new THREE.MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.45, metalness: 0.6 });
      const Lr = ring.lengths(innerD);
      const total = Lr[ring.count];
      const nTruss = Math.round(total / 9);
      const trussGeo = trussGeometry(outerD - innerD, yOut - (yIn - 0.6));
      const truss = new THREE.InstancedMesh(trussGeo, steel, nTruss);
      const p = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let k = 0; k < nTruss; k++) {
        ring.at(innerD, Lr, (k / nTruss) * total, p, n);
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        m.compose(p.setY(yIn - 0.6), q, new THREE.Vector3(1, 1, 1));
        truss.setMatrixAt(k, m);
      }
      truss.castShadow = true;
      this.group.add(truss);
      // floodlight heads
      const nLamp = Math.round(total / 2.4);
      const lampGeo = new THREE.BoxGeometry(0.9, 0.55, 0.35);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.4, metalness: 0.5, emissive: 0xfff4e0, emissiveIntensity: 0 });
      const lamps = new THREE.InstancedMesh(lampGeo, lampMat, nLamp);
      for (let k = 0; k < nLamp; k++) {
        ring.at(innerD + 0.4, Lr, (k / nLamp) * total, p, n);
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.75);
        q.multiply(tilt);
        m.compose(p.setY(yIn - 1.0), q, new THREE.Vector3(1, 1, 1));
        lamps.setMatrixAt(k, m);
      }
      this.lamps.push(lamps);
      this.group.add(lamps);
    }

    // ---------------------------------------------------------------- seats
    this.buildSeats();
    // the far-end and near-end scoreboards are added by Scoreboard.ts
  }

  /** 0 open … 1 fully under the roof, for an upper-tier offset d */
  coverAt(d: number): number {
    return THREE.MathUtils.smoothstep(d, this.roofInner - 2, this.roofInner + 6);
  }

  /** aisle positions (sample indices) shared by every row */
  private aisles(): Set<number> {
    const s = new Set<number>();
    const ring = this.ring;
    for (let i = 0; i < ring.count; i++) {
      const smp = ring.samples[i];
      // mid-corner and every ~3rd straight sample
      if (smp.corner && (i % 15 === 7)) s.add(i);
      if (!smp.corner && i % 4 === 0) s.add(i);
    }
    return s;
  }

  private buildSeats() {
    const v = this.venue;
    const ring = this.ring;
    const aisles = this.aisles();
    const R = rng(7);
    const spots: SeatSpot[] = [];
    const place = (tier: number, rows: number, d0: number, D: number, yOf: (i: number, r: number) => number) => {
      for (let r = 0; r < rows; r++) {
        const d = d0 + r * D + D * 0.52;
        const Ls = ring.lengths(d);
        // walk section by section between aisles
        const aisleList = [...aisles].sort((a, b) => a - b);
        for (let k = 0; k < aisleList.length; k++) {
          const a = aisleList[k], b = aisleList[(k + 1) % aisleList.length];
          const sA = Ls[a] + 0.65;
          let sB = b > a ? Ls[b] - 0.65 : Ls[ring.count] + Ls[b] - 0.65;
          const len = sB - sA;
          if (len < 0.6) continue;
          const n = Math.floor(len / 0.52);
          const gap = len / n;
          const p = new THREE.Vector3(), nr = new THREE.Vector3();
          for (let j = 0; j < n; j++) {
            const idx = ring.at(d, Ls, sA + gap * (j + 0.5), p, nr);
            const i0 = Math.floor(idx) % ring.count, i1 = (i0 + 1) % ring.count, t = idx - Math.floor(idx);
            const y = yOf(i0, r) * (1 - t) + yOf(i1, r) * t;
            // TV camera bays behind each baseline
            if (tier === 0 && Math.abs(p.x) < 3.1 && Math.abs(p.z) > FLOOR_HZ + 0.5 && r <= 10) continue;
            spots.push({ x: p.x, y, z: p.z, nx: nr.x, nz: nr.z, tier, row: r, cover: tier === 1 ? this.coverAt(d) : 0 });
          }
        }
      }
    };
    place(0, this.lower.rows, this.lower.d0, this.lower.D, (i, r) => this.lowerY(i, r));
    place(1, this.upper.rows, this.upper.d0, this.upper.D, (i, r) => this.upperY(i, r));
    this.seats.push(...spots);
    const geo = seatGeometry();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    inst.renderOrder = -1;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    const cA = lin(v.seat), cB = lin(v.seatAlt);
    spots.forEach((s, k) => {
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(s.nx, 0, s.nz));
      m.compose(new THREE.Vector3(s.x, s.y + 0.44, s.z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(k, m);
      const ao = 1 - 0.5 * s.cover;
      c.copy(((s.row >> 2) + s.tier) % 2 ? cA : cB).multiplyScalar(ao * (0.94 + R() * 0.08));
      inst.setColorAt(k, c);
    });
    inst.receiveShadow = true;
    inst.name = 'seats';
    this.group.add(inst);
  }

  /** LED + suite brightness (emissive), kept at a constant display brightness across exposures */
  setLedLevel(exposure: number, night: boolean) {
    for (const m of this.led) {
      const suite = (m as THREE.MeshPhysicalMaterial).clearcoat > 0;
      m.emissiveIntensity = (suite ? (night ? 0.5 : 0.18) : 1.05) / exposure;
    }
    for (const l of this.lamps) (l.material as THREE.MeshStandardMaterial).emissiveIntensity = night ? 18 / exposure : 0;
  }

  update(t: number) {
    // the boards scroll slowly
    for (const lt of this.ledTex) lt.offset.x = (t * 0.012) % 1;
  }
}

/** a molded stadium seat facing +z: pan, back, stanchion (about 0.46 m wide) */
function seatGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pan = new THREE.BoxGeometry(0.44, 0.05, 0.38);
  pan.translate(0, 0.0, 0.02);
  const back = new THREE.BoxGeometry(0.44, 0.36, 0.04);
  back.rotateX(-0.2);
  back.translate(0, 0.2, -0.19);
  const leg = new THREE.BoxGeometry(0.05, 0.4, 0.05);
  leg.translate(0, -0.2, -0.05);
  parts.push(pan, back, leg);
  return merge(parts);
}

/** a triangular truss beam running from the lip (z = 0) back to the wall (z = −len), rising by rise */
function trussGeometry(len: number, rise: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const chord = (y0: number, y1: number, x: number) => {
    const g = new THREE.CylinderGeometry(0.09, 0.09, 1, 6);
    const a = new THREE.Vector3(x, y0, 0), b = new THREE.Vector3(x, y1 + rise, -len);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    g.scale(1, dir.length(), 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    g.translate(mid.x, mid.y, mid.z);
    parts.push(g);
  };
  chord(-1.4, -1.4, 0);
  chord(0, 0, -0.35);
  chord(0, 0, 0.35);
  // web diagonals
  const n = Math.max(4, Math.round(len / 1.6));
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const a = new THREE.Vector3(0, -1.4 + rise * t0, -len * t0);
    const b = new THREE.Vector3(0.35 * (k % 2 ? 1 : -1), rise * t1, -len * t1);
    const g = new THREE.CylinderGeometry(0.04, 0.04, 1, 5);
    const dir = b.clone().sub(a);
    g.scale(1, dir.length(), 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g);
  }
  return merge(parts);
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  let base = 0;
  for (const p of parts) {
    const g = p.index ? p : p;
    const pa = g.getAttribute('position'), na = g.getAttribute('normal'), ua = g.getAttribute('uv');
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nrm.push(na.getX(i), na.getY(i), na.getZ(i));
      uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < pa.count; i++) idx.push(i + base);
    base += pa.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  return out;
}
