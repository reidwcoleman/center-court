// What costs what: node tools/ablate.mjs [--w 1440 --h 900 --dpr 2 --scale 0.7]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +opt('w', 1440), height: +opt('h', 900) }, deviceScaleFactor: +opt('dpr', 2) });
page.setDefaultTimeout(300000);
await page.goto(`http://localhost:5210${opt('url', '/?auto=demo')}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== 'idle', null, { timeout: 180000 });
const res = await page.evaluate(async (scale) => {
  const cc = window.__cc, r = cc.renderer, w = cc.world;
  r.adaptive = false; r.scale = scale; r.resize();
  // freeze the match on the broadcast view
  cc.game.update = () => {};
  window.__cam(0, 8.4, 26.8, 0, 0, 0.6, 38);
  cc.game.dir.update(0.016, new cc.THREE.Vector3(), new cc.THREE.Vector3(), new cc.THREE.Vector3());
  const gl = r.gl.getContext();
  const time = (n = 60) => { window.__pump(10); gl.finish(); const t0 = performance.now(); window.__pump(n); gl.finish(); return +((performance.now() - t0) / n).toFixed(2); };
  const out = { base: time(), base2: time() };
  const find = (name) => { let o = null; w.scene.traverse((x) => { if (x.name === name) o = x; }); return o; };
  const toggle = (label, on, off) => { off(); out[label] = time(); on(); };
  toggle('noCrowd', () => (cc.crowd.mesh.visible = true), () => (cc.crowd.mesh.visible = false));
  const seats = find('seats');
  toggle('noSeats', () => (seats.visible = true), () => (seats.visible = false));
  toggle('noShadows', () => { r.gl.shadowMap.enabled = true; r.gl.shadowMap.needsUpdate = true; }, () => { r.gl.shadowMap.enabled = false; });
  toggle('noStadium', () => (w.stadium.group.visible = true), () => (w.stadium.group.visible = false));
  // post: render the scene straight to the canvas
  const origRender = r.render.bind(r);
  toggle('noPost', () => (r.render = origRender), () => (r.render = () => r.gl.render(w.scene, cc.camera)));
  const passes = r.composer.passes;
  out.base3 = time();
  const bloomOff = () => { r.bloom.blendMode.opacity.value = 0; };
  toggle('noCA', () => (passes[passes.length - 1].enabled = true), () => (passes[passes.length - 1].enabled = false));
  return out;
}, +opt('scale', 0.7));
console.log(JSON.stringify(res));
await browser.close();
