import * as THREE from 'three';
import type { Venue } from './venues.ts';

/** fictional sponsors (no real brands): name, sub line, ink, ground, face */
const BRANDS: [string, string, string, string, string][] = [
  ['AURELIA', 'MAISON DE CHAMPAGNE', '#e7c77a', '#0d0d0f', '600 72px "Cormorant Garamond", Georgia, serif'],
  ['NORDHAVEN', 'PRIVATE BANK', '#ffffff', '#12305c', '700 70px "Inter", Helvetica, Arial, sans-serif'],
  ['KESTREL', 'CHRONOMETERS · GENÈVE', '#f4f1e6', '#16392b', '500 76px "Cormorant Garamond", Georgia, serif'],
  ['ORBIS', 'AIRWAYS', '#ffffff', '#b3242c', '800 78px "Inter", Helvetica, Arial, sans-serif'],
  ['HALDEN', 'SPRING WATER', '#1d4d7a', '#e9f1f6', '300 80px "Inter", Helvetica, Arial, sans-serif'],
  ['VELOCE', 'AUTOMOBILI', '#ffffff', '#1b1b1d', 'italic 800 76px "Inter", Helvetica, Arial, sans-serif'],
  ['SOLENNE', 'PARFUMS', '#1a1a1a', '#efe7da', '400 76px "Cormorant Garamond", Georgia, serif'],
  ['TERRA', 'MOBILE NETWORKS', '#ffffff', '#2c7a4b', '700 74px "Inter", Helvetica, Arial, sans-serif'],
];

function panel(g: CanvasRenderingContext2D, x: number, w: number, h: number, b: [string, string, string, string, string]) {
  const [name, sub, ink, ground, font] = b;
  g.fillStyle = ground;
  g.fillRect(x, 0, w, h);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font.replace(/\d+px/, `${Math.round(h * 0.42)}px`);
  const tracking = name.length < 7 ? 0.18 : 0.12;
  drawTracked(g, name, x + w / 2, h * 0.44, tracking * h * 0.42);
  g.globalAlpha = 0.75;
  g.font = `500 ${Math.round(h * 0.11)}px "Inter", Helvetica, Arial, sans-serif`;
  drawTracked(g, sub, x + w / 2, h * 0.8, h * 0.03);
  g.globalAlpha = 1;
}

function drawTracked(g: CanvasRenderingContext2D, s: string, cx: number, cy: number, track: number) {
  const widths = [...s].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (s.length - 1);
  let x = cx - total / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  [...s].forEach((ch, i) => {
    g.fillText(ch, x, cy);
    x += widths[i] + track;
  });
  g.textAlign = align;
}

/** the courtside LED boards: a strip of panels (4:1 each) for a ring-mapped emissive band */
export function ledStrip(venue: Venue, seed = 0): THREE.CanvasTexture {
  const H = 256, PW = 1024, N = 8;
  const c = document.createElement('canvas');
  c.width = PW * N;
  c.height = H;
  const g = c.getContext('2d')!;
  for (let i = 0; i < N; i++) {
    const b = BRANDS[(i + seed) % BRANDS.length];
    if (i === 3) {
      // the tournament's own panel
      g.fillStyle = venue.wall;
      g.fillRect(i * PW, 0, PW, H);
      g.fillStyle = venue.wallInk;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `600 ${Math.round(H * 0.3)}px "Inter", Helvetica, Arial, sans-serif`;
      drawTracked(g, venue.name.toUpperCase(), i * PW + PW / 2, H * 0.5, H * 0.04);
      g.fillStyle = venue.accent;
      g.fillRect(i * PW + PW * 0.1, H * 0.78, PW * 0.8, H * 0.03);
    } else panel(g, i * PW, PW, H, b);
    // LED pixel grid (fine dark lines)
  }
  addLedGrid(g, c.width, H, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function addLedGrid(g: CanvasRenderingContext2D, w: number, h: number, step: number) {
  g.globalAlpha = 0.22;
  g.fillStyle = '#000';
  for (let y = 0; y < h; y += step) g.fillRect(0, y, w, 1);
  for (let x = 0; x < w; x += step) g.fillRect(x, 0, 1, h);
  g.globalAlpha = 1;
}

/** the backdrop behind the baselines: the venue name painted on the wall colour */
export function backdrop(venue: Venue): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4096;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = venue.wall;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = venue.wallInk;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 110px "Inter", Helvetica, Arial, sans-serif`;
  drawTracked(g, venue.name.toUpperCase(), c.width / 2, 128, 30);
  g.globalAlpha = 0.9;
  g.font = `500 44px "Inter", Helvetica, Arial, sans-serif`;
  drawTracked(g, 'KESTREL', 520, 128, 16);
  drawTracked(g, 'NORDHAVEN', c.width - 520, 128, 16);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** suites: dark glass with warm interiors, people-shaped silhouettes here and there */
export function suitesTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 128;
  const g = c.getContext('2d')!;
  const bay = 128;
  for (let x = 0; x < c.width; x += bay) {
    const warm = 0.35 + ((x * 7919) % 97) / 97 * 0.5;
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, `rgba(${Math.round(90 * warm)},${Math.round(70 * warm)},${Math.round(50 * warm)},1)`);
    grad.addColorStop(1, `rgba(${Math.round(30 * warm)},${Math.round(24 * warm)},${Math.round(20 * warm)},1)`);
    g.fillStyle = grad;
    g.fillRect(x, 0, bay, 128);
    // ceiling light strip
    g.fillStyle = `rgba(255,226,180,${0.5 * warm})`;
    g.fillRect(x + 6, 10, bay - 12, 4);
    // silhouettes
    g.fillStyle = 'rgba(10,8,8,0.8)';
    for (let k = 0; k < 3; k++) {
      if (((x / bay) * 3 + k) % 4 === 0) continue;
      const px = x + 22 + k * 36;
      g.beginPath();
      g.arc(px, 70, 9, 0, 7);
      g.fill();
      g.fillRect(px - 13, 80, 26, 50);
    }
    // mullion
    g.fillStyle = '#0b0c0e';
    g.fillRect(x, 0, 4, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** the ribbon board around the fascia: sponsor loop + the venue */
export function ribbonTexture(venue: Venue): THREE.CanvasTexture {
  return ledStrip(venue, 4);
}
