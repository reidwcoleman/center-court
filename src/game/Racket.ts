import * as THREE from 'three';

/** racket geometry constants (metres): butt at y = 0, shaft along +y, strings facing ±z */
export const RACKET = {
  length: 0.686,
  /** the grip point (centre of the hand on the handle) */
  grip: 0.085,
  /** the sweet spot, a little below the head's centre */
  sweet: 0.5,
  headCenter: 0.53,
  headA: 0.165, // half length of the head (along y), outer
  headB: 0.128, // half width (outer)
};

/**
 * A modern graphite racket: an elliptical head (a swept box section with a bumper strip and
 * grommet holes), an open throat, a tapered octagonal handle with overgrip, and the string
 * bed (an alpha-tested canvas with a painted stencil). Built facing +z at the bind of a hand.
 */
export function buildRacket(frame = '#16171a', accent = '#d6ff3a', grip = '#f1f1ec'): THREE.Group {
  const g = new THREE.Group();
  g.name = 'racket';
  const R = RACKET;
  const frameMat = new THREE.MeshPhysicalMaterial({ color: frame, roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.35, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  // ---- head: a tube swept around an ellipse (flattened section 18 × 23 mm)
  const pts: THREE.Vector3[] = [];
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // slightly egg-shaped: wider above the centre
    const bw = R.headB - 0.009 + (Math.sin(a) > 0 ? 0.003 * Math.sin(a) : 0);
    pts.push(new THREE.Vector3(Math.cos(a) * bw, R.headCenter + Math.sin(a) * (R.headA - 0.009), 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const shape = new THREE.Shape();
  const hw = 0.009, hd = 0.0115;
  shape.moveTo(-hw, -hd);
  shape.lineTo(hw, -hd);
  shape.lineTo(hw, hd);
  shape.lineTo(-hw, hd);
  shape.closePath();
  const head = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.0105, 10, true), frameMat);
  head.scale.set(1, 1, 1.22);
  head.castShadow = true;
  g.add(head);
  // accent stripe on the outside of the hoop (upper half)
  const stripePts = pts.filter((p) => p.y > R.headCenter + 0.02).map((p) => p.clone().multiplyScalar(1));
  const stripeCurve = new THREE.CatmullRomCurve3(stripePts.map((p) => new THREE.Vector3(p.x * 1.07, R.headCenter + (p.y - R.headCenter) * 1.055, 0)), false);
  const stripe = new THREE.Mesh(new THREE.TubeGeometry(stripeCurve, 60, 0.004, 6, false), accentMat);
  g.add(stripe);
  // ---- throat: two arms from the shaft to the lower hoop, and the bridge
  const shaftTop = R.headCenter - R.headA + 0.012;
  const throatBot = 0.27;
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * 0.012, throatBot, 0);
    const b = new THREE.Vector3(s * (R.headB - 0.03), shaftTop + 0.035, 0);
    const c = new THREE.QuadraticBezierCurve3(a, new THREE.Vector3(s * 0.04, throatBot + 0.06, 0), b);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.0105, 8, false), frameMat);
    arm.scale.set(1, 1, 1.2);
    arm.castShadow = true;
    g.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, (R.headB - 0.03) * 2, 8).rotateZ(Math.PI / 2), frameMat);
  bridge.position.y = shaftTop + 0.03;
  g.add(bridge);
  // ---- shaft + handle
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0145, throatBot - 0.19, 12), frameMat);
  shaft.position.y = (throatBot + 0.19) / 2;
  shaft.castShadow = true;
  g.add(shaft);
  const gripTex = gripTexture(grip);
  const gripMat = new THREE.MeshStandardMaterial({ map: gripTex, roughness: 0.75, color: 0xffffff });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0165, 0.19, 8), gripMat);
  handle.position.y = 0.095;
  handle.rotation.y = Math.PI / 8;
  handle.castShadow = true;
  g.add(handle);
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.017, 0.012, 8), frameMat);
  butt.position.y = 0.004;
  butt.rotation.y = Math.PI / 8;
  g.add(butt);
  // ---- strings
  const strings = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({
    map: stringTexture(accent), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.5, depthWrite: true,
  }));
  strings.scale.set(R.headB - 0.016, R.headA - 0.016, 1);
  strings.position.y = R.headCenter;
  strings.castShadow = true;
  (strings as THREE.Mesh).customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: (strings.material as THREE.MeshStandardMaterial).map, alphaTest: 0.5 });
  g.add(strings);
  return g;
}

function gripTexture(col: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = col;
  g.fillRect(0, 0, 64, 256);
  // overgrip wrap: diagonal bands with a darker overlap edge
  g.strokeStyle = 'rgba(0,0,0,0.16)';
  g.lineWidth = 3;
  for (let y = -64; y < 320; y += 22) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y + 26);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stringTexture(accent: string): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  // 16 mains × 19 crosses
  g.strokeStyle = 'rgba(236,236,228,1)';
  g.lineWidth = 3.2;
  for (let i = 0; i < 16; i++) {
    const x = ((i + 0.5) / 16) * S;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
  }
  for (let j = 0; j < 19; j++) {
    const y = ((j + 0.5) / 19) * S;
    g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
  }
  // stencil (a fictional mark) painted across the bed
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = accent;
  g.font = '900 170px Inter, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('V', S / 2, S / 2);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
