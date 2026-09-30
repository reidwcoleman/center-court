import * as THREE from 'three';
import { Renderer, type Quality } from './render/Renderer.ts';
import { World } from './world/World.ts';
import type { SkyName } from './world/Sky.ts';
import { Crowd } from './people/Crowd.ts';
import { Game, ROSTER } from './game/Game.ts';
import { Input } from './game/Input.ts';
import { HUD } from './ui/HUD.ts';
import { Menu, pauseOverlay, summaryOverlay, type MenuChoice } from './ui/Menu.ts';
import { Audio } from './audio/Audio.ts';
import type { Difficulty } from './game/AI.ts';
import { VENUES } from './world/venues.ts';
import type { StrokeKind } from './game/PlayerRig.ts';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;
const camera = new THREE.PerspectiveCamera(37, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 30, 60);
camera.lookAt(0, 0, 0);

const venueId = params.get('venue') && VENUES[params.get('venue')!] ? params.get('venue')! : 'harbour';
const renderer = new Renderer(canvas, new THREE.Scene(), camera);
const world = new World(renderer.gl, venueId);
renderer.renderPass.mainScene = world.scene;
renderer.composer.passes.forEach((p) => ((p as unknown as { mainScene: THREE.Scene }).mainScene = world.scene));
renderer.setQuality((params.get('q') as Quality) ?? 'high');
const exMul = +(params.get('ex') ?? 1);

const input = new Input();
const audio = new Audio();
const hud = new HUD(ui);
hud.show(false);
let crowd: Crowd | null = null;
let game: Game | null = null;
let paused = false;
let pauseEl: HTMLElement | null = null;
const choice: MenuChoice = {
  venue: venueId,
  sky: params.get('sky') ?? VENUES[venueId].sky,
  level: params.get('level') ?? 'pro',
  sets: params.get('sets') ?? '1',
  player: params.get('player') ?? '0',
  assist: params.get('assist') ?? 'partial',
};
const menu = new Menu(ui, choice);
menu.busy(true);
menu.setStatus('Building the stadium…');

async function boot() {
  await world.build(choice.sky as SkyName);
  menu.setStatus('Filling the stands…');
  crowd = new Crowd();
  await crowd.bake(renderer.gl, (f) => menu.setStatus(`Filling the stands… ${Math.round(f * 100)}%`));
  crowd.populate(world.stadium.seats);
  world.scene.add(crowd.mesh);
  game = new Game(world, camera, input, hud, audio, crowd);
  game.onDof = (on, focus, range) => renderer.setDof(on, focus, (range ?? 3) * 1.6, 1.8);
  game.dir.cut('intro');
  world.finalize();
  menu.setStatus('');
  menu.busy(false);
  start();
  const auto = params.get('auto');
  if (auto) void play(choice, auto === 'demo');
}

async function play(c: MenuChoice, demo = false) {
  if (!game) return;
  audio.start();
  menu.busy(true);
  menu.setStatus('Players walking out…');
  const human = +c.player;
  const cpu = (human + 1 + Math.floor(Math.random() * (ROSTER.length - 2))) % ROSTER.length;
  await game.setup({ level: c.level as Difficulty, sets: +c.sets as 1 | 3, human, cpu, assist: c.assist as 'full', demo });
  world.scene.environment = null;
  world.sky.captureEnv(world.dynamic);
  menu.hide();
  hud.show(true);
  game.begin();
  game.onMatchOver = (m) => {
    setTimeout(() => {
      summaryOverlay(ui, m, game!.names, () => location.reload(), () => location.reload());
    }, 4200);
  };
}

menu.onPlay = (c) => {
  if (c.venue !== venueId) {
    const q = new URLSearchParams({ venue: c.venue, sky: c.sky, level: c.level, sets: c.sets, player: c.player, assist: c.assist, auto: 'play' });
    location.search = q.toString();
    return;
  }
  void play(c);
};
menu.onChange = (key, c) => {
  audio.start();
  if (key === 'sky') void world.setSky(c.sky as SkyName);
};

input.onPause = () => {
  if (!game || game.state === 'idle') return;
  paused = !paused;
  if (paused) {
    pauseEl = pauseOverlay(ui, () => input.onPause?.(), () => location.reload(), (on) => (audio.umpireOn = on), audio.umpireOn);
  } else {
    pauseEl?.remove();
    pauseEl = null;
  }
};
input.onCamera = () => {
  if (game) game.dir.pref = (game.dir.pref + 1) % 3;
};

let last = performance.now();
let time = 0;
let raf = 0;
function frame(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  step(dt);
  raf = requestAnimationFrame(frame);
}
function step(dt: number) {
  time += dt;
  const gdt = paused ? 0 : dt;
  world.update(gdt, time);
  if (game) {
    if (game.state === 'idle') game.dir.update(dt, new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
    else game.update(gdt);
  }
  crowd?.update(gdt, camera);
  world.marks.flush();
  renderer.setExposure(world.sky.exposure * exMul);
  renderer.render(dt);
  renderer.adapt(dt, time);
}
function start() {
  last = performance.now();
  raf = requestAnimationFrame(frame);
  (window as unknown as Record<string, unknown>).__ready = true;
}

// ---- debug / headless hooks
const W = window as unknown as Record<string, unknown>;
W.__cc = { world, renderer, camera, THREE, get game() { return game; }, get crowd() { return crowd; } };
W.__pump = (n: number, dt = 1 / 60) => {
  cancelAnimationFrame(raf);
  for (let i = 0; i < n; i++) step(dt);
  last = performance.now();
  raf = requestAnimationFrame(frame);
};
/** a fixed camera for screenshots (the director stops until __cam(null)) */
W.__cam = (x: number | null, y = 0, z = 0, tx = 0, ty = 0, tz = 0, fov?: number) => {
  if (!game) return;
  if (x === null) { game.dir.fixed = null; return; }
  game.dir.fixed = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(tx, ty, tz), fov: fov ?? camera.fov };
};
W.__sky = (n: SkyName) => world.setSky(n);
/** a stand-in human for tests: arms a shot whenever the ball is coming (exercises the input path) */
W.__autoHuman = (type = 'topspin') => {
  const tick = () => {
    const g = game;
    if (g && g.human.human) {
      const incoming = g.state === 'rally' || g.state === 'serveFlight';
      const me = g.human;
      if (g.state === 'preServe' && g['serverIdx' as keyof Game] === 0 && g.stateT > 1.2) input['presses' as keyof Input] && (input as unknown as { presses: string[] }).presses.push('flat');
      if (incoming && me.plan && !me.shot && me.plan.tContact - g.clock < 1.1) (input as unknown as { presses: string[] }).presses.push(type);
    }
  };
  setInterval(tick, 100);
  const orig = W.__pump as (n: number, dt?: number) => void;
  W.__pump = (n: number, dt = 1 / 60) => { for (let i = 0; i < n; i += 6) { tick(); orig(Math.min(6, n - i), dt); } };
};
W.__play = (demo = true) => play(choice, demo);
W.__pose = (kind: StrokeKind | null, phase: number, cx = 0.8, cy = 0.95, cz = 11.9) => {
  const r = game?.players?.[0]?.rig;
  if (!r) return;
  if (!kind) { r.cancelStroke(); r.debugPhase = null; return; }
  r.swing(kind, 0.5, new THREE.Vector3(cx, cy, cz));
  r.debugPhase = phase;
};

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f66;padding:16px;white-space:pre-wrap">${String(e?.stack ?? e)}</pre>`);
});
