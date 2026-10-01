// Filmstrip of a player moving in a live rally: node tools/film.mjs [--url ...] [--n 10] [--step 4] [--minspeed 4.5] [--out shots/film.jpg]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.setDefaultTimeout(300000);
await page.goto(`http://localhost:5210${opt('url', '/?auto=demo')}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true && window.__cc.game && window.__cc.game.state !== 'idle', null, { timeout: 180000 });
await page.evaluate(() => window.__hold(true));
const minSpeed = +opt('minspeed', 4.5), N = +opt('n', 10), step = +opt('step', 4);
for (let f = 0; f < 60 * 300; f++) {
  await page.evaluate(() => window.__pump(1));
  const sp = await page.evaluate(() => { const p = window.__cc.game.players[0]; return Math.hypot(p.vel.x, p.vel.z) * (window.__cc.game.state === 'rally' ? 1 : 0); });
  if (sp < minSpeed) continue;
  for (let k = 0; k < N; k++) {
    await page.evaluate(() => {
      const g = window.__cc.game, p = g.players[0];
      window.__cam(p.pos.x + 3.6 * p.side, 1.5, p.pos.z + 4.4 * p.side, p.pos.x, 0.95, p.pos.z, 36);
      window.__pump(1, 0.00001);
    });
    await page.screenshot({ path: `shots/film_${k}.png` });
    await page.evaluate((n) => window.__pump(n), step);
  }
  break;
}
await browser.close();
const { execSync } = await import('node:child_process');
execSync(`python3 - <<'PY'
from PIL import Image
n=${N}
W,H=300,300
out=Image.new('RGB',(W*5,H*((n+4)//5)))
for i in range(n):
  im=Image.open(f'shots/film_{i}.png').crop((150,150,750,750)).resize((W,H))
  out.paste(im,((i%5)*W,(i//5)*H))
out.save('${opt('out', 'shots/film.jpg')}',quality=88)
PY`);
console.log('ok');
