// Drive the human with real key events: serve with a held Space, aim with the arrows, optional extra presses.
//   node tools/humanplay.mjs [--url "/?auto=play&level=pro"] [--secs 120] [--aim 0.5] [--press 1]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.setDefaultTimeout(300000);
await page.goto(`http://localhost:5210${opt('url', '/?auto=play&level=pro&sets=1')}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== 'idle', null, { timeout: 180000 });
await page.evaluate(() => window.__hold(true));
await page.evaluate((o) => {
  window.__ht = { downAt: 0, serving: false, press: o.press };
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  window.__tick = () => {
    const g = window.__cc.game, h = window.__ht;
    if (g.state === 'preServe' && g.serverIdx === 0 && g.stateT > 1.0 && !h.serving) { key('keydown', 'Space'); h.serving = true; h.downAt = g.clock; }
    if (h.serving && g.clock - h.downAt > 0.7) { key('keyup', 'Space'); h.serving = false; }
    const me = g.human;
    if (h.press && g.state === 'rally' && me.plan && me.plan.swung && !h.did && me.plan.tContact - g.clock < 0.12) { key('keydown', 'Space'); h.did = true; setTimeout(() => key('keyup', 'Space'), 50); }
    if (!me.plan) h.did = false;
  };
}, { press: +opt('press', 0) });
const frames = Math.round(+opt('secs', 120) * 60);
for (let f = 0; f < frames; f += 3) await page.evaluate(() => { window.__tick(); window.__pump(3); });
const info = await page.evaluate(() => { const g = window.__cc.game; return { log: g.log, sets: g.match.sets, pts: g.match.points }; });
const L = info.log.filter((l) => /POINT|serve |hit A\.|miss|no swing/.test(l));
console.log(L.slice(-60).join('\n'));
console.log('sets', JSON.stringify(info.sets), 'pts', info.pts);
for (const e of errs) console.log('ERR', e);
await browser.close();
