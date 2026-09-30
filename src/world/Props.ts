import * as THREE from 'three';
import { POST_X, HL, HSW } from '../sim/dims.ts';
import { Human } from '../people/Human.ts';
import { merge } from './Stadium.ts';
import type { Venue } from './venues.ts';
import type { Match } from '../game/Match.ts';
import { lin } from '../render/noise.ts';

/**
 * Everything courtside: the umpire's chair (with the umpire, seated, reading the play),
 * the players' chairs with towels and bottles, the ball kids (two crouched at the net,
 * four at the back corners), the TV camera bays, and the video boards hanging at each end
 * showing the live score.
 */
export class Props {
  readonly group = new THREE.Group();
  readonly people: Human[] = [];
  private boards: { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; mat: THREE.MeshStandardMaterial }[] = [];
  umpire: Human | null = null;
  private kids: { h: Human; home: THREE.Vector3; crouch: boolean; yaw: number }[] = [];

  constructor(readonly venue: Venue) {
    this.group.name = 'props';
  }

  async build() {
    const v = this.venue;
    const paint = new THREE.MeshStandardMaterial({ color: lin(v.wall), roughness: 0.55, metalness: 0.2 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.6, metalness: 0.2 });
    // ---- umpire's chair (right of the net from the near end)
    const cx = POST_X + 1.05;
    const chair = new THREE.Group();
    const legs: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.06, 1.95, 0.06);
      g.translate(sx * 0.38, 0.975, sz * 0.42);
      legs.push(g);
    }
    for (const y of [0.55, 1.1, 1.6]) {
      const r = new THREE.BoxGeometry(0.06, 0.035, 0.9);
      r.translate(-0.38, y, 0);
      legs.push(r); // ladder rungs on the court side
      const r2 = new THREE.BoxGeometry(0.8, 0.03, 0.04);
      r2.translate(0, y, 0.42);
      legs.push(r2);
      const r3 = r2.clone().translate(0, 0, -0.84);
      legs.push(r3);
    }
    const frame = new THREE.Mesh(merge(legs), paint);
    frame.castShadow = true;
    chair.add(frame);
    const platform = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 1.0), paint);
    platform.position.y = 1.95;
    platform.castShadow = true;
    chair.add(platform);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.5), dark);
    seat.position.set(0.12, 2.42, 0);
    chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.5), dark);
    back.position.set(0.4, 2.72, 0);
    chair.add(back);
    // front desk with the scoring tablet, a sponsor panel
    const desk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.9), paint);
    desk.position.set(-0.45, 2.25, 0);
    desk.castShadow = true;
    chair.add(desk);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.42), new THREE.MeshStandardMaterial({ map: textPanel('KESTREL', '#f4f1e6', v.wall), roughness: 0.6 }));
    panel.position.set(-0.495, 2.25, 0);
    panel.rotation.y = -Math.PI / 2;
    chair.add(panel);
    const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.28), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, emissive: 0x5577aa, emissiveIntensity: 0.3 }));
    tablet.position.set(-0.3, 2.52, 0.05);
    tablet.rotation.z = -0.5;
    chair.add(tablet);
    chair.position.set(cx, 0, 0);
    this.group.add(chair);
    this.umpire = await Human.create('Business_Male_02');
    this.umpire.root.position.set(cx + 0.22, 1.97, 0);
    this.umpire.root.rotation.y = -Math.PI / 2;
    this.umpire.play('sit_look', { fade: 0 });
    this.umpire.grounded = false;
    this.group.add(this.umpire.root);
    this.people.push(this.umpire);

    // ---- players' chairs, cooler, towels (left of the net)
    const bx = -(POST_X + 1.6);
    for (const sz of [-1, 1]) {
      const c = playerChair(dark, steel);
      c.position.set(bx, 0, sz * 1.25);
      c.rotation.y = Math.PI / 2;
      this.group.add(c);
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.35), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.95 }));
      towel.position.set(bx + 0.05, 0.93, sz * 1.25);
      towel.rotation.set(0, 0.2, 0.9);
      towel.castShadow = true;
      this.group.add(towel);
      // bag leaning against the chair
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 6, 12), new THREE.MeshStandardMaterial({ color: sz > 0 ? 0x1c1c1e : 0xb4202a, roughness: 0.5 }));
      bag.rotation.z = Math.PI / 2;
      bag.position.set(bx - 0.5, 0.17, sz * 1.25 + sz * 0.5);
      bag.castShadow = true;
      this.group.add(bag);
      for (let k = 0; k < 2; k++) {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), new THREE.MeshStandardMaterial({ color: k ? 0x5aa8f0 : 0xe8eef2, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 }));
        bottle.position.set(bx + 0.45, 0.11, sz * 1.25 + (k - 0.5) * 0.14);
        bottle.castShadow = true;
        this.group.add(bottle);
      }
    }
    const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.7), new THREE.MeshStandardMaterial({ color: lin(v.accent), roughness: 0.4 }));
    cooler.position.set(bx, 0.275, 0);
    cooler.castShadow = true;
    this.group.add(cooler);

    // ---- ball kids: scaled adults in the tournament kit
    const kit = { top: v.id === 'kings' ? '#5b3b86' : v.id === 'porte' ? '#e8702f' : '#1f2f63', shorts: '#1c1d22', socks: '#f2f2ee', shoes: '#f2f2f2' };
    const spots: [number, number, boolean, number][] = [
      [POST_X + 0.35, 0.75, true, -Math.PI / 2], [-(POST_X + 0.35), -0.75, true, Math.PI / 2],
      [HSW + 2.2, HL + 4.9, false, Math.PI * 1.1], [-(HSW + 2.2), HL + 4.9, false, Math.PI * 0.9],
      [HSW + 2.2, -(HL + 4.9), false, -Math.PI * 0.1], [-(HSW + 2.2), -(HL + 4.9), false, Math.PI * 0.1],
    ];
    const avatars = ['Sports_Female_02', 'Sports_Male_02', 'Sports_Male_03', 'Sports_Male_04'];
    for (let i = 0; i < spots.length; i++) {
      const [x, z, crouch, yaw] = spots[i];
      const h = await Human.create(avatars[i % avatars.length], kit);
      const s = 0.8 + (i % 3) * 0.03;
      h.root.scale.setScalar(s);
      h.root.position.set(x, 0, z);
      h.root.rotation.y = yaw;
      h.play(crouch ? 'crouch' : 'idle2', { fade: 0, offset: i * 0.17 });
      this.group.add(h.root);
      this.people.push(h);
      this.kids.push({ h, home: new THREE.Vector3(x, 0, z), crouch, yaw });
    }

    // ---- TV camera platforms in the end-stand bays (seats removed by Stadium)
    for (const sz of [-1, 1]) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.2, 9.5), dark);
      plat.position.set(0, 5.8, sz * 28.6);
      plat.receiveShadow = true;
      this.group.add(plat);
      const cam = tvCamera(dark, steel);
      cam.position.set(3.4, 5.9, sz * 28.4);
      cam.rotation.y = sz > 0 ? 0 : Math.PI;
      this.group.add(cam);
    }

    // ---- video boards at both ends, under the roof lip
    for (const sz of [-1, 1]) {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 512;
      const ctx = c.getContext('2d')!;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1, roughness: 0.3 });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), mat);
      const housing = new THREE.Mesh(new THREE.BoxGeometry(12.6, 6.6, 0.8), dark);
      const g = new THREE.Group();
      housing.position.z = -0.45;
      g.add(housing, screen);
      g.position.set(0, 25.5, sz * 45.5);
      g.rotation.y = sz > 0 ? Math.PI : 0;
      g.rotation.x = sz > 0 ? 0.18 : -0.18;
      this.group.add(g);
      this.boards.push({ tex, ctx, mat });
    }
  }

  /** the video boards' emissive level (constant display brightness across exposures) */
  setLevel(exposure: number) {
    for (const b of this.boards) b.mat.emissiveIntensity = 0.9 / exposure;
  }

  /** draw the live score on the video boards */
  score(m: Match, names: [string, string], server: 0 | 1, speed?: number) {
    for (const b of this.boards) {
      const g = b.ctx;
      const W = 1024, H = 512;
      g.fillStyle = '#05070b';
      g.fillRect(0, 0, W, H);
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(40,60,110,0.55)');
      grd.addColorStop(1, 'rgba(5,8,15,0.2)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.fillStyle = this.venue.accent;
      g.fillRect(40, 40, 8, 110);
      g.fillStyle = '#ffffff';
      g.font = '700 44px Inter, Arial';
      g.textBaseline = 'middle';
      g.fillText(this.venue.name.toUpperCase(), 70, 72);
      g.font = '500 28px Inter, Arial';
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillText(m.tiebreak ? 'TIEBREAK' : `SET ${m.sets.length}`, 70, 122);
      for (const p of [0, 1] as const) {
        const y = 250 + p * 110;
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(40, y - 48, W - 80, 96);
        if (server === p && m.winner === null) {
          g.fillStyle = '#d9ec4b';
          g.beginPath();
          g.arc(78, y, 12, 0, 7);
          g.fill();
        }
        g.fillStyle = '#ffffff';
        g.font = '600 50px Inter, Arial';
        g.fillText(names[p].toUpperCase(), 110, y);
        g.textAlign = 'center';
        m.sets.forEach((s, i) => {
          g.fillStyle = i === m.sets.length - 1 ? '#ffffff' : 'rgba(255,255,255,0.55)';
          g.fillText(String(s[p]), 640 + i * 70, y);
        });
        g.fillStyle = '#d9ec4b';
        g.fillText(m.winner === null ? m.pointLabel(p) : '', 900, y);
        g.textAlign = 'left';
      }
      if (speed) {
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.font = '500 30px Inter, Arial';
        g.fillText(`SERVE SPEED  ${Math.round(speed)} KM/H`, 70, 470);
      }
      // LED grid
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
      b.tex.needsUpdate = true;
    }
  }

  update(dt: number, ball: THREE.Vector3) {
    for (const h of this.people) {
      h.animate(dt);
      if (h !== this.umpire) h.ground();
      else h.root.updateMatrixWorld(true);
    }
    // the umpire's head follows the ball
    if (this.umpire) {
      const head = this.umpire.bones.Bip01_Head;
      const hp = head.getWorldPosition(new THREE.Vector3());
      const d = ball.clone().sub(hp);
      const yaw = Math.atan2(d.x, d.z) - (-Math.PI / 2);
      const k = THREE.MathUtils.clamp(Math.atan2(Math.sin(yaw), Math.cos(yaw)), -1.1, 1.1);
      head.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), k * 0.8);
      head.updateMatrixWorld(true);
    }
  }
}

function playerChair(dark: THREE.Material, steel: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.48), dark);
  seat.position.y = 0.46;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), dark);
  back.position.set(0, 0.74, -0.22);
  back.rotation.x = -0.1;
  const legs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.CylinderGeometry(0.015, 0.015, 0.46, 6);
    l.translate(sx * 0.22, 0.23, sz * 0.2);
    legs.push(l);
  }
  const lm = new THREE.Mesh(merge(legs), steel);
  for (const m of [seat, back, lm]) m.castShadow = true;
  g.add(seat, back, lm);
  return g;
}

function tvCamera(dark: THREE.Material, steel: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.55), dark);
  body.position.y = 1.45;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.75, 16).rotateX(Math.PI / 2), dark);
  lens.position.set(0, 1.45, -0.62);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.085, 16), new THREE.MeshPhysicalMaterial({ color: 0x222244, roughness: 0.05, metalness: 0.5, clearcoat: 1 }));
  glass.position.set(0, 1.45, -1.0);
  glass.rotation.y = Math.PI;
  const legs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const l = new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6);
    l.rotateZ(0.25);
    l.rotateY(a);
    l.translate(Math.cos(a) * 0.2, 0.68, Math.sin(a) * 0.2);
    legs.push(l);
  }
  const tri = new THREE.Mesh(merge(legs), steel);
  g.add(body, lens, glass, tri);
  return g;
}

function textPanel(text: string, ink: string, ground: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = ground;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = ink;
  g.font = '500 92px "Cormorant Garamond", Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
