// fps with parts switched off (real rAF loop): node tools/fpsab.mjs [--scale 0.7]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(300000);
await page.goto(`http://localhost:5210${opt('url', '/?auto=demo')}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== 'idle', null, { timeout: 180000 });
await page.evaluate((scale) => {
  const cc = window.__cc, R = cc.renderer;
  R.adaptive = false; R.scale = scale; R.resize();
  cc.game.update = () => {};
  window.__cam(0, 8.4, 26.8, 0, 0, 0.6, 38);
  const w = cc.world;
  const find = (name) => { let o = null; w.scene.traverse((x) => { if (x.name === name) o = x; }); return o; };
  const origRender = R.render.bind(R);
  window.__toggles = {
    base: [() => {}, () => {}],
    noCrowd: [() => (cc.crowd.mesh.visible = false), () => (cc.crowd.mesh.visible = true)],
    noSeats: [() => (find('seats').visible = false), () => (find('seats').visible = true)],
    noSunShadow: [() => (w.sky.sun.castShadow = false), () => (w.sky.sun.castShadow = true)],
    noCourt: [() => (w.court.mesh.visible = false), () => (w.court.mesh.visible = true)],
    noStadium: [() => (w.stadium.group.visible = false), () => (w.stadium.group.visible = true)],
    noPost: [() => (R.render = () => R.gl.render(w.scene, cc.camera)), () => (R.render = origRender)],
    noPeople: [() => { cc.game.players.forEach((p) => (p.rig.human.root.visible = false)); w.props.group.visible = false; }, () => { cc.game.players.forEach((p) => (p.rig.human.root.visible = true)); w.props.group.visible = true; }],
    shadow2k: [() => { const s = w.sky.sun.shadow; s.map?.dispose(); s.map = null; s.mapSize.set(2048, 2048); }, () => { const s = w.sky.sun.shadow; s.map?.dispose(); s.map = null; s.mapSize.set(4096, 4096); }],
    noEnv: [() => { window.__env = w.scene.environment; w.scene.environment = null; }, () => (w.scene.environment = window.__env)],
  };
}, +opt('scale', 0.7));
for (const k of opt('which', 'base,noCrowd,noSeats,noSunShadow,noCourt,noStadium,noPost,noPeople,noEnv,base').split(',')) {
  const r = await page.evaluate(async (k) => {
    const t = window.__toggles[k];
    t[0]();
    await new Promise((res) => setTimeout(res, 700));
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const f = (tt) => { n++; if (tt - t0 < 3000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    t[1]();
    return (n / 3).toFixed(1);
  }, k);
  console.log(k.padEnd(12), r, 'fps');
}
await browser.close();
