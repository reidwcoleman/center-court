import type { Match } from '../game/Match.ts';

/**
 * The broadcast graphics: a scorebug (top left), the umpire's calls as a banner, a serve
 * speed chip, the shot power meter, the controls card, pause and match-summary screens.
 * One accent (optic yellow) marks the server and the live point column.
 */
export class HUD {
  readonly root: HTMLElement;
  private bug: HTMLElement;
  private banner: HTMLElement;
  private bannerSub: HTMLElement;
  private chip: HTMLElement;
  private meter: HTMLElement;
  private meterFill: HTMLElement;
  private hint: HTMLElement;
  private tag: HTMLElement;
  private bannerTimer = 0;
  private chipTimer = 0;
  names: [string, string] = ['Player', 'CPU'];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);
    this.bug = el('div', 'bug');
    this.banner = el('div', 'banner');
    const bt = el('div', 'banner-title');
    this.bannerSub = el('div', 'banner-sub');
    this.banner.append(bt, this.bannerSub);
    this.chip = el('div', 'chip');
    this.meter = el('div', 'meter');
    this.meterFill = el('div', 'meter-fill');
    this.meter.appendChild(this.meterFill);
    this.hint = el('div', 'hint');
    this.hint.innerHTML = `<b>Arrows / WASD</b> aim and move · <b>Space</b> swing (hold for power, tap right at the ball for a big hit) · <b>K</b> flat · <b>L</b> slice · <b>I</b> lob · <b>U</b> drop · <b>C</b> camera · <b>Esc</b> pause`;
    this.tag = el('div', 'rtag', '<span class="dot"></span>REPLAY');
    this.root.append(this.bug, this.banner, this.chip, this.meter, this.hint, this.tag);
  }

  show(on: boolean) {
    this.root.style.display = on ? '' : 'none';
  }

  score(m: Match, server: 0 | 1) {
    const rows = [0, 1].map((p) => {
      const sets = m.sets.map((s, i) => {
        const done = i < m.sets.length - 1 || m.winner !== null;
        const won = done && s[p] > s[1 - p];
        return `<span class="g ${done ? 'done' : 'cur'} ${won ? 'won' : ''}">${s[p]}</span>`;
      }).join('');
      const pt = m.winner !== null ? '' : m.pointLabel(p as 0 | 1);
      return `<div class="row"><span class="srv ${server === p && m.winner === null ? 'on' : ''}"></span><span class="nm">${this.names[p]}</span>${sets}<span class="pt">${pt}</span></div>`;
    });
    const tag = m.tiebreak ? '<div class="tag">TIEBREAK</div>' : '';
    this.bug.innerHTML = rows.join('') + tag;
  }

  call(title: string, sub = '', seconds = 2.2) {
    (this.banner.firstChild as HTMLElement).textContent = title;
    this.bannerSub.textContent = sub;
    this.banner.classList.add('on');
    this.bannerTimer = seconds;
  }

  serveSpeed(kmh: number) {
    this.chip.innerHTML = `<span class="lbl">SERVE</span><span class="num">${Math.round(kmh)}</span><span class="lbl">KM/H</span>`;
    this.chip.classList.add('on');
    this.chipTimer = 3;
  }

  power(v: number | null) {
    if (v === null) {
      this.meter.classList.remove('on');
      return;
    }
    this.meter.classList.add('on');
    this.meterFill.style.transform = `scaleX(${Math.max(0.02, Math.min(1, v))})`;
  }

  replayTag(on: boolean) {
    this.tag.classList.toggle('on', on);
    this.bug.style.opacity = on ? '0' : '1';
  }

  hideHint() {
    this.hint.classList.add('off');
  }

  update(dt: number) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('on');
    }
    if (this.chipTimer > 0) {
      this.chipTimer -= dt;
      if (this.chipTimer <= 0) this.chip.classList.remove('on');
    }
  }
}

export function el(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
