// One live swing, frame by frame around contact: node tools/swingseq.mjs [--skip 0]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
page.setDefaultTimeout(300000);
await page.goto(`http://localhost:5210${opt('url', '/?auto=demo')}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== 'idle', null, { timeout: 180000 });
await page.evaluate(() => window.__hold(true));
let skip = +opt('skip', 0);
for (let f = 0; f < 60 * 120; f += 1) {
  await page.evaluate(() => window.__pump(1));
  const st = await page.evaluate(() => {
    const g = window.__cc.game, p = g.players[0];
    return { tc: p.rig.timeToContact(), stroke: p.rig.stroke, x: p.pos.x, z: p.pos.z, side: p.side, serve: g.state === 'toss' };
  });
  if (!st.stroke || st.serve || st.tc === null || st.tc > 0.4 || st.tc < 0.3) continue;
  if (skip-- > 0) { await page.evaluate(() => window.__pump(40)); continue; }
  const log = [];
  for (let k = 0; k < 8; k++) {
    const info = await page.evaluate((s) => {
      const g = window.__cc.game, p = g.players[0], T = window.__cc.THREE;
      window.__cam(s.x + 2.4 * s.side, 1.6, s.z - 3.4 * s.side, s.x, 1.0, s.z - 0.5 * s.side, 40);
      window.__pump(1, 0.00001);
      const sw = p.rig.sweetSpot(new T.Vector3());
      const b = g.ball.p;
      return { tc: +(p.rig.timeToContact() ?? -9).toFixed(3), ph: +p.rig.strokeT.toFixed(2), d: +Math.hypot(sw.x - b.x, sw.y - b.y, sw.z - b.z).toFixed(2), stroke: p.rig.stroke };
    }, st);
    log.push(info);
    await page.screenshot({ path: `shots/seq_${k}.png` });
    await page.evaluate(() => window.__pump(3));
  }
  console.log(JSON.stringify(log));
  break;
}
await browser.close();
