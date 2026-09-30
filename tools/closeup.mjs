// Close-ups of the near player during live play: node tools/closeup.mjs [--n 6]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(300000);
await page.goto(`http://localhost:5210${opt('url', '/?auto=demo')}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== 'idle', null, { timeout: 180000 });
await page.evaluate(() => window.__hold(true));
let k = 0;
const N = +opt('n', 6);
for (let f = 0; f < 60 * 90 && k < N; f += 3) {
  await page.evaluate(() => window.__pump(3));
  const st = await page.evaluate(() => {
    const g = window.__cc.game;
    const p = g.players[+(new URLSearchParams(location.search).get('who') ?? 0)] ?? g.players[0];
    const tc = p.rig.timeToContact();
    return { tc, stroke: p.rig.stroke, x: p.pos.x, z: p.pos.z, side: p.side, state: g.state };
  });
  if (st.stroke && st.tc !== null && Math.abs(st.tc) < 0.03) {
    await page.evaluate((s) => {
      // a camera 4 m off the player's right-front, at chest height
      const x = s.x + 3.2 * s.side, z = s.z - 2.6 * s.side;
      window.__cam(x, 1.5, z, s.x, 1.05, s.z - 0.3 * s.side, 38);
      window.__pump(1, 0.0001);
    }, st);
    await page.screenshot({ path: `shots/close_${k}_${st.stroke}.png` });
    await page.evaluate(() => window.__cam(null));
    k++;
  }
}
await browser.close();
