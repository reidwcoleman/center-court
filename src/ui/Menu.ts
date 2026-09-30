import { el } from './HUD.ts';
import { VENUES } from '../world/venues.ts';
import { ROSTER } from '../game/Game.ts';
import type { Match } from '../game/Match.ts';

export interface MenuChoice {
  venue: string;
  sky: string;
  level: string;
  sets: string;
  player: string;
  assist: string;
}

type Opt = [value: string, label: string];

/** the title screen over the live stadium flyover */
export class Menu {
  readonly root: HTMLElement;
  private status: HTMLElement;
  private playBtn: HTMLButtonElement;
  choice: MenuChoice;
  onPlay: ((c: MenuChoice) => void) | null = null;
  onChange: ((key: keyof MenuChoice, c: MenuChoice) => void) | null = null;

  constructor(parent: HTMLElement, initial: MenuChoice) {
    this.choice = { ...initial };
    this.root = el('div', 'menu');
    const panel = el('div', 'panel');
    panel.append(
      el('div', 'kicker', 'CENTER COURT'),
      el('h1', '', 'Take the<br>court.'),
      el('p', 'lede', 'A full match under the lights of a sold-out arena. Real ball physics, motion-captured players, every stroke yours to time.'),
    );
    const field = (key: keyof MenuChoice, label: string, opts: Opt[]) => {
      const f = el('div', 'field');
      f.appendChild(el('label', '', label));
      const seg = el('div', 'seg');
      for (const [v, l] of opts) {
        const b = el('button', v === this.choice[key] ? 'on' : '', l) as HTMLButtonElement;
        b.onclick = () => {
          this.choice[key] = v;
          seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
          this.onChange?.(key, this.choice);
        };
        seg.appendChild(b);
      }
      f.appendChild(seg);
      panel.appendChild(f);
    };
    field('venue', 'Venue', Object.values(VENUES).map((v) => [v.id, `${v.short} · ${v.surface}`]));
    field('sky', 'Conditions', [['day', 'Day'], ['overcast', 'Overcast'], ['sunset', 'Sunset'], ['night', 'Night']]);
    field('player', 'You play as', ROSTER.map((r, i) => [String(i), r.name]));
    field('level', 'Opponent', [['rookie', 'Rookie'], ['club', 'Club'], ['pro', 'Pro'], ['legend', 'Legend']]);
    field('sets', 'Match', [['1', 'One set'], ['3', 'Best of three']]);
    field('assist', 'Movement assist', [['full', 'Full'], ['partial', 'Partial'], ['off', 'Off']]);
    this.playBtn = el('button', 'play', 'Play match') as HTMLButtonElement;
    this.playBtn.onclick = () => this.onPlay?.(this.choice);
    this.status = el('div', 'loading');
    panel.append(this.playBtn, this.status);
    this.root.appendChild(panel);
    parent.appendChild(this.root);
  }

  setStatus(s: string) {
    this.status.textContent = s;
  }

  busy(on: boolean) {
    this.playBtn.disabled = on;
    this.playBtn.style.opacity = on ? '0.5' : '1';
  }

  hide() {
    this.root.classList.add('off');
  }

  show() {
    this.root.classList.remove('off');
  }
}

/** the pause card */
export function pauseOverlay(parent: HTMLElement, onResume: () => void, onQuit: () => void, onVoice: (on: boolean) => void, voiceOn: boolean): HTMLElement {
  const o = el('div', 'overlay');
  const c = el('div', 'card');
  c.append(el('h2', '', 'Paused'), el('div', 'sub', 'Esc to resume · C cycles the camera'));
  const act = el('div', 'actions');
  const r = el('button', 'primary', 'Resume') as HTMLButtonElement;
  r.onclick = onResume;
  const v = el('button', '', voiceOn ? 'Umpire voice: on' : 'Umpire voice: off') as HTMLButtonElement;
  v.onclick = () => {
    voiceOn = !voiceOn;
    v.textContent = voiceOn ? 'Umpire voice: on' : 'Umpire voice: off';
    onVoice(voiceOn);
  };
  const q = el('button', '', 'Quit to menu') as HTMLButtonElement;
  q.onclick = onQuit;
  act.append(r, v, q);
  c.appendChild(act);
  o.appendChild(c);
  parent.appendChild(o);
  return o;
}

/** the match summary */
export function summaryOverlay(parent: HTMLElement, m: Match, names: [string, string], onAgain: () => void, onMenu: () => void): HTMLElement {
  const o = el('div', 'overlay');
  const c = el('div', 'card');
  const w = m.winner ?? 0;
  const score = m.sets.map((s) => `${s[w]}–${s[1 - w]}`).join('  ');
  c.append(el('h2', '', `${names[w]} wins`), el('div', 'sub', score));
  const rows: [string, (i: 0 | 1) => string][] = [
    ['Aces', (i) => String(m.stats[i].aces)],
    ['Double faults', (i) => String(m.stats[i].doubles)],
    ['First serve in', (i) => (m.stats[i].firstTotal ? Math.round((100 * m.stats[i].firstIn) / m.stats[i].firstTotal) + '%' : '–')],
    ['Winners', (i) => String(m.stats[i].winners)],
    ['Unforced errors', (i) => String(m.stats[i].unforced)],
    ['Break points won', (i) => String(m.stats[i].breaksWon)],
    ['Fastest serve', (i) => (m.stats[i].fastestServe ? Math.round(m.stats[i].fastestServe) + ' km/h' : '–')],
    ['Points won', (i) => String(m.stats[i].pointsWon)],
  ];
  const t = document.createElement('table');
  t.innerHTML = `<tr><td></td><td>${names[0]}</td><td>${names[1]}</td></tr>` + rows.map(([l, f]) => `<tr><td>${l}</td><td>${f(0)}</td><td>${f(1)}</td></tr>`).join('');
  c.appendChild(t);
  const act = el('div', 'actions');
  const a = el('button', 'primary', 'Play again') as HTMLButtonElement;
  a.onclick = onAgain;
  const b = el('button', '', 'Menu') as HTMLButtonElement;
  b.onclick = onMenu;
  act.append(a, b);
  c.appendChild(act);
  o.appendChild(c);
  parent.appendChild(o);
  return o;
}
