// Run an AI-vs-AI match headless and report: node tools/play.mjs [--url "/?auto=demo"] [--secs 60] [--shots 6] [--w 1280 --h 720]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const url = `http://localhost:${opt('port', '5210')}${opt('url', '/?auto=demo')}`;
const secs = +opt('secs', 60), nShots = +opt('shots', 6);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +opt('w', 1280), height: +opt('h', 720) } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
page.setDefaultTimeout(300000);
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== "idle", null, { timeout: 180000 });
if (opt("human", "")) await page.evaluate((t) => window.__autoHuman(t), opt("human", "topspin"));
const frames = Math.round(secs * 60);
const every = Math.floor(frames / Math.max(1, nShots));
const t0 = Date.now();
for (let f = 0, k = 0; f < frames; f += 60) {
  await page.evaluate(() => window.__pump(60));
  if (nShots && f % every < 60 && k < nShots) {
    await page.screenshot({ path: `shots/play_${k}.png` });
    k++;
  }
}
const info = await page.evaluate(() => { const g = window.__cc.game; return { log: g.log.slice(-160), state: g.state, sets: g.match.sets, pts: g.match.points }; });
console.log(info.log.join('\n'));
console.log('state', info.state, 'sets', JSON.stringify(info.sets), 'points', info.pts, `(${((Date.now() - t0) / 1000).toFixed(1)} s wall)`);
for (const e of errs.slice(0, 20)) console.log('ERR', e);
await browser.close();
