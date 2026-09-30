// Throughput bench: node tools/bench.mjs [--url "/?auto=demo"] [--w 1440 --h 900 --dpr 2] [--frames 240]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +opt('w', 1440), height: +opt('h', 900) }, deviceScaleFactor: +opt('dpr', 2) });
page.setDefaultTimeout(300000);
await page.goto(`http://localhost:5210${opt('url', '/?auto=demo')}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== 'idle', null, { timeout: 180000 });
const res = await page.evaluate(async (n) => {
  const cc = window.__cc;
  const r = cc.renderer;
  r.adaptive = false;
  const out = {};
  for (const scale of [1.0, 0.85, 0.7]) {
    r.scale = scale; r.resize();
    window.__pump(30);
    const gl = r.gl.getContext();
    gl.finish();
    const t0 = performance.now();
    for (let i = 0; i < n; i += 10) { window.__pump(10); }
    gl.finish();
    const ms = (performance.now() - t0) / n;
    out[scale] = { ms: +ms.toFixed(2), px: `${r.gl.domElement.width}x${r.gl.domElement.height}`, calls: r.gl.info.render.calls, tris: r.gl.info.render.triangles };
  }
  // CPU cost of the frame without rendering
  const orig = r.render.bind(r);
  r.render = () => {};
  const t1 = performance.now();
  window.__pump(n);
  out.cpuOnly = +((performance.now() - t1) / n).toFixed(2);
  r.render = orig;
  return out;
}, +opt('frames', 240));
console.log(JSON.stringify(res, null, 1));
await browser.close();
