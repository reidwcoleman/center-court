import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(300000);
await page.goto(`http://localhost:5210/?auto=demo`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== 'idle', null, { timeout: 180000 });
const res = await page.evaluate(async () => {
  const cc = window.__cc, r = cc.renderer;
  r.adaptive = false; r.scale = 0.7; r.resize();
  cc.game.update = () => {};
  window.__cam(0, 8.4, 26.8, 0, 0, 0.6, 38);
  const gl = r.gl.getContext();
  const out = [];
  for (let k = 0; k < 10; k++) {
    gl.finish();
    const t0 = performance.now();
    window.__pump(30);
    gl.finish();
    out.push(+((performance.now() - t0) / 30).toFixed(1));
    await new Promise((res) => setTimeout(res, k === 4 ? 3000 : 50));
  }
  return out;
});
console.log(JSON.stringify(res));
await browser.close();
