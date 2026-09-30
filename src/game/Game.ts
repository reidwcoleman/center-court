import * as THREE from 'three';
import { BallSim, predict, type BallEvent, v3 } from '../sim/Ball.ts';
import { solveShot, type ShotSpec } from '../sim/Shot.ts';
import { HL, HSW, SERVICE, BALL_R, FLOOR_HX, FLOOR_HZ } from '../sim/dims.ts';
import { Match, type PointReason } from './Match.ts';
import { Player, type Plan } from './Player.ts';
import { PlayerRig, type StrokeKind } from './PlayerRig.ts';
import { Human, type Outfit } from '../people/Human.ts';
import { BallView } from './BallView.ts';
import { Input, type ShotType } from './Input.ts';
import { aiChooseShot, aiServe, AI_LEVELS, type Difficulty } from './AI.ts';
import { CameraDirector } from './CameraDirector.ts';
import { Replay, HawkEye } from './Replay.ts';
import type { World } from '../world/World.ts';
import type { Crowd } from '../people/Crowd.ts';
import type { HUD } from '../ui/HUD.ts';
import type { Audio } from '../audio/Audio.ts';

export interface RosterEntry {
  avatar: string;
  name: string;
  short: string;
  outfit: Outfit;
  racket: [string, string, string];
}

/** fictional players on the Rocketbox athletes */
export const ROSTER: RosterEntry[] = [
  { avatar: 'Sports_Male_04', name: 'Adrian Voss', short: 'A. Voss', outfit: { shoes: '#f2f2f2' }, racket: ['#16171a', '#d6ff3a', '#f1f1ec'] },
  { avatar: 'Sports_Male_02', name: 'Mateo Serrano', short: 'M. Serrano', outfit: { top: '#f4f4f0', shorts: '#1b2a4a', socks: '#f4f4f0', shoes: '#f2f2f2' }, racket: ['#0f2d5c', '#ffffff', '#f1f1ec'] },
  { avatar: 'Sports_Male_03', name: 'Jalen Okafor', short: 'J. Okafor', outfit: { top: '#1a1b1f', shorts: '#1a1b1f', socks: '#f4f4f0', shoes: '#f2f2f2', trim: '#cfe34a' }, racket: ['#c8102e', '#141414', '#141414'] },
  { avatar: 'Sports_Female_02', name: 'Elena Marsh', short: 'E. Marsh', outfit: { top: '#f7f7f4', shorts: '#23324f', shoes: '#f2f2f2' }, racket: ['#f1f1ec', '#ff5aa5', '#f1f1ec'] },
];

type State = 'idle' | 'preServe' | 'toss' | 'serveFlight' | 'rally' | 'pointOver' | 'replay' | 'hawkeye' | 'changeover' | 'matchOver';

export interface GameConfig {
  level: Difficulty;
  sets: 1 | 3;
  human: number;
  cpu: number;
  assist: 'full' | 'partial' | 'off';
  demo?: boolean;
}

export class Game {
  readonly ball = new BallSim();
  readonly ballView = new BallView();
  players!: [Player, Player];
  match!: Match;
  readonly dir: CameraDirector;
  state: State = 'idle';
  stateT = 0;
  clock = 0;
  cfg!: GameConfig;
  /** the ball's predicted flight since the last strike */
  private pred: { pts: ReturnType<typeof predict>['pts']; events: BallEvent[]; t0: number } | null = null;
  private lastHitter: 0 | 1 | null = null;
  private bounceSide: 1 | -1 | 0 = 0;
  private bouncesAfterHit = 0;
  private rallyShots = 0;
  private isServe = false;
  private serveType: ShotType = 'flat';
  private serveContactT = 0;
  private tossReleaseT = 0;
  private tossReleased = false;
  private serverIdx: 0 | 1 = 0;
  private dribbleT = 0;
  private dribbles = 0;
  private aiServeAt = 0;
  private pendingPoint: { winner: 0 | 1; reason: PointReason; at: number } | null = null;
  private netCord = false;
  private receiverTouched = false;
  private lastSqueak = [0, 0];
  private prevVel = [new THREE.Vector3(), new THREE.Vector3()];
  private hitPause = 0;
  onMatchOver: ((m: Match) => void) | null = null;
  /** depth of field for replays (set by main) */
  onDof: ((on: boolean, focus?: number, range?: number) => void) | null = null;
  replay!: Replay;
  hawk: HawkEye;
  private highlight: { kind: 'rally' | 'ace' | 'winner'; hitter: 0 | 1 } | null = null;
  private close: { x: number; z: number; inside: boolean; mm: number; t: number; hitT: number } | null = null;
  private lastHitT = 0;
  private replayDone = false;
  /** event log for tools (tools/play.mjs) */
  readonly log: string[] = [];
  private say(s: string) {
    this.log.push(`${this.clock.toFixed(2)} ${s}`);
    if (this.log.length > 400) this.log.shift();
  }
  names: [string, string] = ['', ''];

  constructor(readonly world: World, readonly camera: THREE.PerspectiveCamera, readonly input: Input, readonly hud: HUD, readonly audio: Audio, readonly crowd: Crowd | null) {
    this.dir = new CameraDirector(camera);
    this.hawk = new HawkEye(hud.root);
    world.scene.add(this.hawk.group);
    world.scene.add(this.ballView.mesh, this.ballView.streak);
    world.dynamic.push(this.ballView.mesh, this.ballView.streak);
    this.ball.surface = world.venue.surface;
  }

  /** load both players (human = roster index, cpu = roster index) */
  async setup(cfg: GameConfig) {
    this.cfg = cfg;
    const make = async (r: RosterEntry, i: 0 | 1, human: boolean) => {
      const h = await Human.create(r.avatar, r.outfit);
      const rig = new PlayerRig(h, r.racket);
      this.world.scene.add(h.root);
      this.world.dynamic.push(h.root);
      const p = new Player(i, r.name, rig, human, human ? { speed: 6.0, accel: 13, power: 0.9, accuracy: 0.85, spin: 0.85, reaction: 0.1 } : AI_LEVELS[cfg.level].skill);
      return p;
    };
    const a = ROSTER[cfg.human], b = ROSTER[cfg.cpu];
    this.players = [await make(a, 0, !cfg.demo), await make(b, 1, false)];
    this.names = [a.short, b.short];
    this.replay = new Replay(this.players, this.ballView.mesh);
    this.hud.names = this.names;
    this.match = new Match({ sets: cfg.sets, gamesPerSet: 6, finalSetTiebreak10: false, noAd: false }, Math.random() < 0.5 ? 0 : 1);
    this.applySides();
    this.dir.cut('intro');
  }

  get human(): Player {
    return this.players[0];
  }

  private applySides() {
    const near = this.match.p0Near;
    this.players[0].side = near ? 1 : -1;
    this.players[1].side = near ? -1 : 1;
    this.dir.side = this.players[0].side;
  }

  private boards(speed?: number) {
    this.world.props.score(this.match, this.names, this.match.currentServer, speed);
  }

  begin() {
    this.hud.score(this.match, this.match.currentServer);
    this.boards();
    this.setupPoint();
    this.dir.cut('broadcast');
  }

  // ------------------------------------------------------------------------------------ points
  private setupPoint() {
    const m = this.match;
    this.applySides();
    const srv = m.currentServer;
    this.serverIdx = srv;
    const S = this.players[srv], R = this.players[1 - srv];
    const deuce = m.deuceCourt;
    // the server stands just behind the baseline, a step from the centre mark on their right (deuce) or left (ad)
    const sx = S.side * (deuce ? 1 : -1) * 0.55;
    S.place(sx, S.side * (HL + 0.12));
    // the receiver waits diagonally, a metre behind the baseline
    const rx = -S.side * (deuce ? 1 : -1) * 2.9 * 1;
    R.place(rx, R.side * (HL + (m.secondServe ? 0.4 : 1.1)));
    for (const p of this.players) {
      p.plan = null;
      p.shot = null;
      p.moveTarget = null;
      p.rig.cancelStroke();
    }
    this.ball.frozen = true;
    this.ballView.mesh.visible = true;
    this.pred = null;
    this.lastHitter = null;
    this.bouncesAfterHit = 0;
    this.bounceSide = 0;
    this.rallyShots = 0;
    this.isServe = false;
    this.pendingPoint = null;
    this.netCord = false;
    this.receiverTouched = false;
    this.dribbles = 0;
    this.dribbleT = 0;
    this.replay?.clear();
    this.highlight = null;
    this.close = null;
    this.replayDone = false;
    this.hawk.hide();
    this.aiServeAt = this.clock + 1.6 + Math.random() * 1.4;
    this.setState('preServe');
    this.input.clearPresses();
    this.audio.crowdLevel(0.15);
    const pr = m.pressure();
    if (pr.matchPoint !== null) this.hud.call('Match point', this.names[pr.matchPoint], 2.2);
    else if (pr.setPoint !== null) this.hud.call('Set point', this.names[pr.setPoint], 2.2);
    else if (pr.breakPoint) this.hud.call('Break point', '', 2);
    if (m.secondServe) this.hud.call('Second serve', '', 1.4);
  }

  private setState(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  // ------------------------------------------------------------------------------------ the frame
  update(dt: number) {
    if (this.state === 'idle') return;
    // a few frames of hit-stop on big hits feel physical (the ball keeps its time)
    this.clock += dt;
    this.stateT += dt;
    this.input.pollPad();
    const [p0, p1] = this.players;
    if (this.state === 'replay' || this.state === 'hawkeye') {
      this.replayTick(dt);
      this.hud.update(dt);
      return;
    }
    switch (this.state) {
      case 'preServe': this.preServe(dt); break;
      case 'toss': this.toss(dt); break;
      case 'serveFlight':
      case 'rally': this.rally(dt); break;
      case 'pointOver': this.pointOver(dt); break;
      case 'changeover': this.changeover(dt); break;
      case 'matchOver': this.idlePlayers(dt); break;
    }
    this.faultCheck?.();
    // ball
    if (!this.ball.frozen) {
      const ev = this.ball.step(dt);
      for (const e of ev) this.onBallEvent(e);
      // out of the arena / dead ball
      const p = this.ball.p;
      if (Math.abs(p.x) > FLOOR_HX - 0.1 || Math.abs(p.z) > FLOOR_HZ - 0.1) {
        p.x = THREE.MathUtils.clamp(p.x, -FLOOR_HX + 0.1, FLOOR_HX - 0.1);
        p.z = THREE.MathUtils.clamp(p.z, -FLOOR_HZ + 0.1, FLOOR_HZ - 0.1);
        this.ball.v.x *= -0.3;
        this.ball.v.z *= -0.3;
        this.onBallDead('wall');
      }
      if (this.ball.p.y <= BALL_R + 0.001 && Math.hypot(this.ball.v.x, this.ball.v.z) < 0.4 && Math.abs(this.ball.v.y) < 0.1) this.onBallDead('stopped');
    }
    const look = new THREE.Vector3(this.ball.p.x, this.ball.p.y, this.ball.p.z);
    for (const p of [p0, p1]) {
      p.syncRig(dt, look);
      this.footSounds(p, dt);
    }
    // ball held in the server's hand before the toss
    if (this.ball.frozen && (this.state === 'preServe' || (this.state === 'toss' && !this.tossReleased))) {
      const S = this.players[this.serverIdx];
      const h = S.rig.offHand;
      let y = h.y + 0.02;
      if (this.state === 'preServe') y = this.dribbleY(h.y);
      this.ball.p = v3(h.x, y, h.z);
      this.ball.v = v3();
      this.ball.w = v3();
    }
    this.ballView.update(this.ball.p, this.ball.w, this.ball.v, dt, this.camera.position);
    this.world.ballPos.copy(look);
    if (this.state === 'toss' || this.state === 'serveFlight' || this.state === 'rally' || (this.state === 'pointOver' && this.stateT < 1.2)) this.replay.record(dt, this.clock);
    // camera
    const hp = this.human.pos;
    this.dir.update(dt, look, hp, this.players[1].pos);
    // power meter
    const hs = this.human.shot;
    if (this.human.human && hs && !hs.released && (this.state === 'rally' || this.state === 'serveFlight' || this.state === 'toss')) this.hud.power(this.chargeOf(hs));
    else this.hud.power(null);
    this.hud.update(dt);
  }

  private dribbleY(handY: number): number {
    // the server bounces the ball a few times: down to the floor and back up to the hand
    const S = this.players[this.serverIdx];
    const want = S.human ? 99 : 3;
    if (this.dribbles >= want) return handY;
    this.dribbleT += 1 / 60;
    const period = 0.72;
    const u = (this.dribbleT % period) / period;
    if (this.dribbleT > (this.dribbles + 1) * period) {
      this.dribbles++;
    }
    if (this.dribbleT < 0.6) return handY;
    const y = handY - (handY - BALL_R) * Math.sin(u * Math.PI);
    if (Math.abs(u - 0.5) < 0.012) this.audio.bounce(this.world.venue.surface, 6, 0, S.pos.distanceTo(this.camera.position));
    return y;
  }

  // ------------------------------------------------------------------------------------ serve
  private preServe(dt: number) {
    const S = this.players[this.serverIdx], R = this.players[1 - this.serverIdx];
    // the server can shuffle along the baseline (human), the receiver splits their weight
    if (S.human) {
      const st = this.input.stick();
      const want = new THREE.Vector3(st.x * S.side * 2.2, 0, 0);
      S.drive(dt, want);
      const deuce = this.match.deuceCourt;
      const side = S.side * (deuce ? 1 : -1);
      S.pos.x = side > 0 ? THREE.MathUtils.clamp(S.pos.x, 0.15, HSW - 0.3) : THREE.MathUtils.clamp(S.pos.x, -HSW + 0.3, -0.15);
      S.pos.z = S.side * (HL + 0.12);
      const press = this.input.takePress();
      if (press) this.startToss(press);
    } else {
      S.drive(dt, new THREE.Vector3());
      if (this.clock > this.aiServeAt && this.stateT > 1.2) {
        const c = aiServe(this.cfg.level, this.match.secondServe);
        this.startToss(c.type);
        S.shot = { type: c.type, aimX: c.aimX, aimD: 0, power: c.power, pressT: this.clock, released: true };
      }
    }
    if (R.human) {
      const st = this.input.stick();
      R.drive(dt, new THREE.Vector3(st.x * R.side * 3, 0, -st.y * R.side * 2));
      this.input.clearPresses();
    } else R.drive(dt, R.seek(R.pos, 0.5));
  }

  private startToss(type: ShotType) {
    const S = this.players[this.serverIdx];
    this.serveType = type;
    if (S.human) {
      S.shot = { type, aimX: 0, aimD: 0, power: 0, pressT: this.clock, released: false };
      this.hud.hideHint();
    }
    this.audio.start();
    this.tossReleaseT = this.clock + 0.26;
    this.tossReleased = false;
    this.serveContactT = this.clock + 1.1;
    const contact = S.pos.clone().addScaledVector(S.right, 0.28).addScaledVector(S.fwd, 0.5).setY(2.72);
    S.rig.swing('serve', 1.1, contact, S.fwd);
    this.setState('toss');
    this.audio.crowdLevel(0.0, 0.6);
  }

  private toss(dt: number) {
    const S = this.players[this.serverIdx], R = this.players[1 - this.serverIdx];
    S.drive(dt, new THREE.Vector3());
    R.drive(dt, R.seek(R.pos, 0.3));
    if (S.human && S.shot && !S.shot.released && !this.input.isHeld(S.shot.type)) {
      S.shot.released = true;
      S.shot.power = this.chargeOf(S.shot);
    }
    if (!this.tossReleased && this.clock >= this.tossReleaseT) {
      // release: a ballistic arc that falls through the contact point at the strike time
      this.tossReleased = true;
      const contact = S.pos.clone().addScaledVector(S.right, 0.28).addScaledVector(S.fwd, 0.5).setY(2.72);
      const T = this.serveContactT - this.clock;
      const p0 = this.ball.p;
      const g = -9.81;
      const v = v3((contact.x - p0.x) / T, (contact.y - p0.y - 0.5 * g * T * T) / T, (contact.z - p0.z) / T);
      this.ball.set(p0, v, v3(0, 0, 0));
    }
    if (this.clock >= this.serveContactT) this.serveStrike();
  }

  private serveStrike() {
    const S = this.players[this.serverIdx];
    const m = this.match;
    const deuce = m.deuceCourt;
    const second = m.secondServe;
    const shot = S.shot ?? { type: this.serveType, aimX: 0, aimD: 0, power: 0.7, pressT: this.clock, released: true };
    let power = S.human ? (shot.released ? shot.power : this.chargeOf(shot)) : shot.power;
    power = THREE.MathUtils.clamp(power, 0.15, 1);
    // target: the diagonal service box; aim from wide (−1) to the T (+1)
    const serverXSign = S.side * (deuce ? 1 : -1);
    const boxSign = -serverXSign;
    let wide: number;
    if (S.human) {
      const st = this.input.stick();
      // pushing toward the box's sideline (on screen) = wide
      wide = THREE.MathUtils.clamp(0.5 + 0.5 * st.x * S.side * boxSign, 0, 1);
    } else wide = THREE.MathUtils.clamp(0.5 - 0.5 * shot.aimX, 0, 1);
    const tx = boxSign * THREE.MathUtils.lerp(0.35, HSW - 0.45, wide);
    const tz = -S.side * (SERVICE - 0.55 - (second ? 0.5 : 0));
    const acc = S.skill.accuracy;
    const sigma = (0.1 + power * power * 0.55) * (1.3 - acc) * (S.human ? 1 : 0.9);
    const target = { x: tx + gauss() * sigma, z: tz + gauss() * sigma * 1.3 };
    const contact = { x: this.ball.p.x, y: Math.max(2.3, this.ball.p.y), z: this.ball.p.z };
    const hand = 1; // right-handed
    let spec: ShotSpec;
    const t = shot.type;
    if (t === 'topspin' || t === 'lob') spec = { speed: 30 + 13 * power * S.skill.power, rpm: 2800, side: 900 * hand, clear: 0.3 };
    else if (t === 'slice' || t === 'drop') spec = { speed: 35 + 15 * power * S.skill.power, rpm: 800, side: -2300 * hand, clear: 0.1 };
    else spec = { speed: 40 + 18 * power * S.skill.power, rpm: 450, clear: 0.04 };
    // big first serves are committed: the pace stays and they can find the net
    spec.commit = power > 0.82 && Math.random() < 0.5;
    const sol = solveShot(contact, target, spec, this.world.venue.surface);
    this.ball.set(contact, sol.v, sol.w);
    this.ball.bounces = 0;
    this.isServe = true;
    this.lastHitT = this.clock;
    this.replay.mark('hit', this.clock, contact.x, contact.z);
    this.lastHitter = this.serverIdx;
    this.bouncesAfterHit = 0;
    this.bounceSide = 0;
    this.netCord = false;
    this.receiverTouched = false;
    const kmh = sol.speed * 3.6;
    this.hud.serveSpeed(kmh);
    this.boards(kmh);
    this.say(`serve ${this.names[this.serverIdx]} ${shot.type} ${kmh.toFixed(0)}kmh target(${target.x.toFixed(2)},${target.z.toFixed(2)}) ok=${sol.ok} clear=${sol.netClear.toFixed(2)} second=${second}`);
    const st = this.match.stats[this.serverIdx];
    st.fastestServe = Math.max(st.fastestServe, kmh);
    if (!second) st.firstTotal++;
    this.audio.hit(power, 'serve', this.pan(contact), S.pos.distanceTo(this.camera.position));
    this.dir.bump(0.2);
    S.shot = null;
    this.afterStrike();
    this.setState('serveFlight');
  }

  // ------------------------------------------------------------------------------------ rally
  /** after any strike: predict the flight, the receiver plans, the striker recovers */
  private afterStrike() {
    const b = this.ball;
    this.pred = { ...predict(b.p, b.v, b.w, b.surface, 4.5, 1 / 120, 3), t0: this.clock };
    const hitter = this.players[this.lastHitter!];
    const recv = this.players[1 - this.lastHitter!];
    hitter.plan = null;
    hitter.moveTarget = hitter.recoverySpot(this.pred.pts[this.pred.pts.length - 1].x, hitter.pos.z * hitter.side < 5);
    recv.plan = null;
    recv.rig.splitStep();
    this.replan(recv, true);
  }

  private replan(p: Player, force = false): void {
    if (!this.pred && this.ball.frozen) return;
    // re-predict from the ball's current state (handles net cords and spin exactly)
    const b = this.ball;
    const pr = predict(b.p, b.v, b.w, b.surface, 3.5, 1 / 120, 3);
    // bounces already taken count: tell the planner about a bounce that already happened on this side
    const events = pr.events.slice();
    if (this.bouncesAfterHit > 0 && this.bounceSide === p.side) events.unshift({ kind: 'bounce', x: b.p.x, z: b.p.z, t: -0.01, speed: 0, vy: 0 });
    const allowVolley = !this.isServe;
    const plan = p.planIntercept(pr.pts, events, this.clock, allowVolley);
    if (!plan) return;
    if (p.plan && p.plan.swung) {
      const moved = plan.ball.distanceTo(p.plan.ball);
      if (moved < 0.6 || plan.tContact - this.clock < 0.35) {
        // keep the swing, just refresh where the ball will be
        p.plan.ball.copy(plan.ball);
        p.plan.tContact = plan.tContact;
        p.rig.setContact(plan.ball, plan.tContact - this.clock);
        return;
      }
      // the ball isn't where the swing was going: start over
      p.rig.cancelStroke();
      force = true;
    }
    if (force || !p.plan || Math.abs(plan.tContact - p.plan.tContact) > 0.05 || plan.body.distanceTo(p.plan.body) > 0.3 || plan.forehand !== p.plan.forehand) {
      p.plan = plan;
      if (!p.human) {
        const opp = this.players[1 - p.index];
        const c = aiChooseShot(p, plan, opp, this.cfg.level);
        p.shot = { ...c, pressT: this.clock - 1, released: true };
      }
    } else p.plan = { ...plan, swung: p.plan.swung };
  }

  private rally(dt: number) {
    const hitterIdx = this.lastHitter;
    for (const p of this.players) {
      const receiving = hitterIdx !== null && p.index !== hitterIdx;
      if (receiving && p.tickPlanCooldown(dt)) this.replan(p);
      if (p.human) this.humanControl(p, dt, receiving);
      else this.aiControl(p, dt, receiving);
      // swing and strike
      if (receiving && p.plan) this.tryStrike(p);
    }
    // pending point (a net ball rolling back, a double bounce) resolves after a beat
    if (this.pendingPoint && this.clock >= this.pendingPoint.at) {
      const pp = this.pendingPoint;
      this.pendingPoint = null;
      this.awardPoint(pp.winner, pp.reason);
    }
  }

  private humanControl(p: Player, dt: number, receiving: boolean) {
    const st = this.input.stick();
    // screen-relative: the camera sits behind the human's end
    const s = p.side;
    const want = new THREE.Vector3(st.x * s, 0, -st.y * s).multiplyScalar(p.skill.speed * (this.input.sprint ? 1 : 0.92));
    // shot buttons arm the next stroke; release freezes the charge
    const press = this.input.takePress();
    if (press) {
      p.shot = { type: press, aimX: 0, aimD: 0, power: 0, pressT: this.clock, released: false };
      this.hud.hideHint();
    }
    if (p.shot && !p.shot.released && !this.input.isHeld(p.shot.type)) {
      p.shot.released = true;
      p.shot.power = this.chargeOf(p.shot);
    }
    // positioning assist: with a shot armed the player is drawn to the ideal contact spot
    const assist = this.cfg.assist;
    if (receiving && p.plan && (p.shot || assist === 'full')) {
      const auto = p.seek(p.plan.body, 1);
      const idle = Math.hypot(st.x, st.y) < 0.1;
      const k = assist === 'off' ? 0 : idle ? (assist === 'full' ? 1 : 0.85) : assist === 'full' ? 0.75 : 0.45;
      want.lerp(auto, k);
    }
    p.drive(dt, want);
  }

  private aiControl(p: Player, dt: number, receiving: boolean) {
    let target: THREE.Vector3 | null = null;
    let urgency = 1;
    if (receiving && p.plan) target = p.plan.body;
    else if (p.moveTarget) {
      target = p.moveTarget;
      urgency = 0.75;
    }
    // reaction delay after the opponent's strike
    if (this.pred && this.clock - this.pred.t0 < p.skill.reaction) target = null;
    p.drive(dt, target ? p.seek(target, urgency) : new THREE.Vector3());
  }

  private strokeFor(p: Player, plan: Plan): StrokeKind {
    const t = p.shot?.type;
    if (plan.smash) return 'smash';
    if (plan.volley) return plan.forehand ? 'fhVolley' : 'bhVolley';
    if (t === 'slice' || t === 'drop') return plan.forehand ? 'fhSlice' : 'bhSlice';
    if (t === 'lob') return plan.forehand ? 'fhLob' : 'bhLob';
    return plan.forehand ? 'fh' : 'bh';
  }

  private tryStrike(p: Player) {
    const plan = p.plan!;
    const tTo = plan.tContact - this.clock;
    const lead = plan.volley ? 0.42 : plan.smash ? 0.7 : 0.72;
    if (!plan.swung && tTo <= lead && tTo > 0.06 && (!p.human || p.shot)) {
      plan.swung = true;
      const aim = p.fwd;
      p.rig.swing(this.strokeFor(p, plan), tTo, plan.ball, aim);
    }
    if (tTo > 0) return;
    // contact time: is the ball on the strings?
    const b = this.ball.p;
    const ballV = new THREE.Vector3(b.x, b.y, b.z);
    const lat = plan.smash ? 0.28 : plan.forehand ? 0.78 : 0.72;
    const ahead = plan.smash ? 0.45 : plan.volley ? 0.7 : 0.45;
    const ideal = p.pos.clone().addScaledVector(p.right, plan.forehand ? lat : -lat).addScaledVector(p.fwd, ahead);
    const dh = Math.hypot(ideal.x - b.x, ideal.z - b.z);
    const dy = Math.abs(b.y - plan.ball.y);
    p.plan = null;
    if (!plan.swung || (p.human && !p.shot)) { this.say(`no swing ${this.names[p.index]}`); return; } // no swing: the ball goes by
    if (dh > 1.15 || dy > 0.9 || b.y > 3.0 || b.y < 0.08) {
      this.say(`miss ${this.names[p.index]} dh=${dh.toFixed(2)} dy=${dy.toFixed(2)} ballY=${b.y.toFixed(2)} late=${plan.late.toFixed(2)}`);
      // a whiff, or the frame
      if (dh < 1.45) this.audio.hit(0.3, 'frame', this.pan(b), p.pos.distanceTo(this.camera.position));
      return;
    }
    const quality = THREE.MathUtils.clamp(1 - Math.max(0, dh - 0.3) / 0.85 - dy * 0.3, 0.1, 1);
    this.strike(p, ballV, quality, plan);
  }

  private chargeOf(s: NonNullable<Player['shot']>): number {
    return THREE.MathUtils.clamp((this.clock - s.pressT) / 0.75, 0.2, 1);
  }

  /** the ball leaves the strings: choose the target from the aim, add the error, solve the flight */
  private strike(p: Player, contact: THREE.Vector3, quality: number, plan: Plan) {
    const shot = p.shot ?? { type: 'topspin' as ShotType, aimX: 0, aimD: 0, power: 0.5, pressT: this.clock, released: true };
    let power: number, aimX: number, aimD: number;
    if (p.human) {
      power = shot.released ? shot.power : this.chargeOf(shot);
      // a late press is a rushed swing
      const prep = this.clock - shot.pressT;
      if (prep < 0.25) quality *= 0.6 + prep * 1.6;
      const st = this.input.stick();
      aimX = st.x;
      aimD = st.y;
    } else {
      power = shot.power;
      aimX = shot.aimX;
      aimD = shot.aimD;
      // the AI's consistency roll, worse under pressure (pace, stretch)
      const L = AI_LEVELS[this.cfg.level];
      const pressure = Math.min(0.25, Math.max(0, plan.late + 0.25)) + Math.min(0.2, Math.hypot(this.ball.v.x, this.ball.v.z) / 150);
      if (Math.random() > L.consistency - pressure) quality *= 0.45 + Math.random() * 0.2;
    }
    const type = shot.type;
    const incoming = Math.hypot(this.ball.v.x, this.ball.v.y, this.ball.v.z);
    const s = p.side;
    // target in the opponent's court (aimX in the player's screen-right frame)
    let depth: number; // metres from the net
    let tx = aimX * 3.35;
    if (type === 'drop') depth = 2.4 + Math.max(0, aimD) * 0.8;
    else if (type === 'lob') depth = HL - 1.3 + aimD * 0.4;
    else if (aimD < -0.55 && !plan.volley) {
      depth = 5.6;
      tx = Math.sign(aimX || (Math.random() - 0.5)) * 3.7;
    } else depth = 8.3 + aimD * 2.0;
    if (plan.volley) depth = Math.min(depth, 8.5);
    depth = Math.min(depth, HL - 0.55);
    const skill = p.skill;
    const stretched = plan.late > -0.12 ? 0.35 : 0;
    const sigma = (0.34 + (1 - quality) * 1.9 + power * power * 0.75 + (incoming / 40) * 0.5 + stretched) * (1.4 - skill.accuracy);
    const target = { x: THREE.MathUtils.clamp(tx * s, -4.6, 4.6) + gauss() * sigma, z: -s * depth + gauss() * sigma * 1.2 };
    const pw = power * skill.power * (0.55 + 0.45 * quality);
    let spec: ShotSpec;
    const isVolley = plan.volley;
    switch (type) {
      case 'flat': spec = { speed: 28 + 17 * pw, rpm: 800, clear: 0.12 }; break;
      case 'slice': spec = { speed: 20 + 11 * pw, rpm: -2500 * (0.7 + 0.3 * skill.spin), clear: 0.18 }; break;
      case 'lob': spec = { speed: 17 + 6 * pw, rpm: 1500, arc: 'high', clear: 1.5 }; break;
      case 'drop': spec = { speed: 9 + 4 * pw, rpm: -2400, clear: 0.12 }; break;
      default: spec = { speed: 24 + 14 * pw, rpm: 2000 + 1200 * pw * skill.spin, clear: 0.35 };
    }
    if (isVolley && type !== 'drop') spec = { speed: 18 + 12 * pw, rpm: -1200, clear: 0.12 };
    if (plan.smash) spec = { speed: 34 + 16 * pw, rpm: 300, clear: 0.2 };
    // a poor contact can't be steered: commit (the pace and angle stay, errors happen)
    spec.commit = quality < 0.45 && Math.random() < 0.6;
    const sol = solveShot({ x: contact.x, y: contact.y, z: contact.z }, target, spec, this.world.venue.surface);
    this.ball.set({ x: contact.x, y: contact.y, z: contact.z }, sol.v, sol.w);
    this.ball.bounces = 0;
    if (this.lastHitter !== null && this.lastHitter !== p.index) this.receiverTouched = true;
    this.lastHitter = p.index;
    this.isServe = false;
    this.bouncesAfterHit = 0;
    this.bounceSide = 0;
    this.rallyShots++;
    this.lastHitT = this.clock;
    this.replay.mark('hit', this.clock, contact.x, contact.z);
    this.say(`hit ${this.names[p.index]} ${type} q=${quality.toFixed(2)} pw=${power.toFixed(2)} ${(sol.speed * 3.6).toFixed(0)}kmh from(${contact.x.toFixed(1)},${contact.y.toFixed(2)},${contact.z.toFixed(1)}) to(${target.x.toFixed(1)},${target.z.toFixed(1)}) ok=${sol.ok}${plan.volley ? ' volley' : ''}`);
    const kind = type === 'slice' || type === 'drop' ? 'slice' : isVolley ? 'volley' : 'drive';
    this.audio.hit(Math.min(1, sol.speed / 40), kind, this.pan(contact), p.pos.distanceTo(this.camera.position));
    p.shot = null;
    if (this.state === 'serveFlight') this.setState('rally');
    this.afterStrike();
    this.audio.crowdLevel(0.0, 0.4);
  }

  // ------------------------------------------------------------------------------------ ball events
  private onBallEvent(e: BallEvent) {
    if (e.kind === 'net') {
      this.say(`net cord=${e.cord} over=${e.over}`);
      this.world.net.shake(e.x, e.y, e.speed);
      this.audio.net(e.speed);
      if (e.cord) {
        this.netCord = true;
        this.audio.ooh(0.6);
      }
      if (!e.over && !this.pendingPoint && this.lastHitter !== null && (this.state === 'rally' || this.state === 'serveFlight')) {
        // into the net: the point (or the fault) once it drops
        if (this.isServe) this.pendingFault(this.clock + 0.6);
        else this.pendingPoint = { winner: (1 - this.lastHitter) as 0 | 1, reason: 'net', at: this.clock + 0.9 };
      }
      return;
    }
    if (e.kind !== 'bounce') return;
    this.say(`bounce (${e.x.toFixed(2)},${e.z.toFixed(2)}) v=${e.speed.toFixed(1)}`);
    this.replay?.mark('bounce', this.clock, e.x, e.z);
    this.ballView.bounce();
    const surf = this.world.venue.surface;
    this.audio.bounce(surf, e.speed + e.vy, this.pan({ x: e.x, y: 0, z: e.z }), Math.hypot(e.x - this.camera.position.x, e.z - this.camera.position.z));
    if (surf === 'clay') this.world.marks.stamp(e.x, e.z, 0.085, 0.06, Math.atan2(this.ball.v.x, this.ball.v.z), 0, 0.9);
    else if (surf === 'hard' && e.speed > 18) this.world.marks.stamp(e.x, e.z, 0.1, 0.05, Math.atan2(this.ball.v.x, this.ball.v.z), 2, 0.25);
    if (this.pendingPoint || this.lastHitter === null) return;
    if (this.state !== 'rally' && this.state !== 'serveFlight') return;
    const hitter = this.players[this.lastHitter];
    const side: 1 | -1 = e.z > 0 ? 1 : -1;
    const tol = 0.02;
    if (this.bouncesAfterHit === 0) {
      this.bouncesAfterHit = 1;
      this.bounceSide = side;
      if (this.isServe) {
        // service box: the receiver's side, diagonal to the server
        const S = hitter;
        const deuce = this.match.deuceCourt;
        const boxSign = -S.side * (deuce ? 1 : -1);
        const inZ = e.z * -S.side >= -tol && e.z * -S.side <= SERVICE + tol;
        const inX = e.x * boxSign >= -tol && Math.abs(e.x) <= HSW + tol;
        const good = side === -S.side && inZ && inX;
        this.closeCall(e.x, e.z, good, true);
        if (good && this.netCord) {
          this.hud.call('Let', '', 1.5);
          this.audio.say('Let');
          this.pendingLet();
          return;
        }
        if (!good) {
          this.hud.call(this.netCord ? 'Fault' : 'Fault', '', 1.4);
          this.pendingFault(this.clock + 0.4);
          return;
        }
        if (!this.match.secondServe) this.match.stats[this.serverIdx].firstIn++;
        return;
      }
      if (side === hitter.side) {
        // it came back on the hitter's own side (off the net)
        this.pendingPoint = { winner: (1 - hitter.index) as 0 | 1, reason: 'net', at: this.clock + 0.5 };
        return;
      }
      const inside = Math.abs(e.x) <= HSW + tol && Math.abs(e.z) <= HL + tol;
      this.closeCall(e.x, e.z, inside);
      if (!inside) {
        this.hud.call('Out', '', 1.4);
        this.audio.say('Out');
        this.pendingPoint = { winner: (1 - hitter.index) as 0 | 1, reason: 'out', at: this.clock + 0.7 };
      }
      return;
    }
    // a second bounce: the receiver never got it back
    this.bouncesAfterHit++;
    if (this.bouncesAfterHit === 2) {
      const reason: PointReason = this.isServe ? (this.receiverTouched ? 'service-winner' : 'ace') : 'winner';
      this.pendingPoint = { winner: hitter.index, reason, at: this.clock + 0.35 };
    }
  }

  private onBallDead(_why: string) {
    if (this.pendingPoint || this.lastHitter === null) return;
    if (this.state !== 'rally' && this.state !== 'serveFlight') return;
    // the ball hit the wall before a bounce: out (or a winner if it had bounced in)
    const hitter = this.players[this.lastHitter];
    if (this.bouncesAfterHit === 0) {
      if (this.isServe) this.pendingFault(this.clock + 0.2);
      else this.pendingPoint = { winner: (1 - hitter.index) as 0 | 1, reason: 'out', at: this.clock + 0.2 };
    } else this.pendingPoint = { winner: hitter.index, reason: this.isServe ? 'ace' : 'winner', at: this.clock + 0.2 };
  }

  /** a close line call gets a murmur (and a Hawk-Eye look later) */
  private closeCall(x: number, z: number, good: boolean, box = false) {
    // signed distance of the ball's edge to the nearest line it could have been called on (mm)
    const edges = box ? [Math.abs(Math.abs(x) - HSW), Math.abs(Math.abs(z) - SERVICE), Math.abs(x)] : [Math.abs(Math.abs(x) - HSW), Math.abs(Math.abs(z) - HL)];
    const dx = Math.min(...edges);
    if (dx < 0.06) this.audio.ooh(0.5);
    if (dx < 0.045) this.close = { x, z, inside: good, mm: (dx - 0.0) * 1000 * (good ? 1 : -1), t: this.clock, hitT: this.lastHitT };
  }

  private faultAt = 0;
  private letAt = 0;
  private pendingFault(at: number) {
    this.faultAt = at;
    this.pendingPoint = { winner: this.serverIdx, reason: 'double', at: 1e9 }; // placeholder blocks other calls
    this.state = 'serveFlight';
    const check = () => {
      if (this.clock < this.faultAt) return;
      this.pendingPoint = null;
      if (this.match.secondServe) {
        this.hud.call('Double fault', '', 1.8);
        this.audio.say('Double fault');
        this.awardPoint((1 - this.serverIdx) as 0 | 1, 'double');
      } else {
        this.audio.say('Fault');
        this.match.secondServe = true;
        this.ball.frozen = true;
        this.ballView.mesh.visible = false;
        this.setState('pointOver');
        this.afterFault = true;
      }
    };
    this.faultCheck = check;
  }
  private pendingLet() {
    this.letAt = this.clock + 1.0;
    this.pendingPoint = { winner: this.serverIdx, reason: 'double', at: 1e9 };
    this.faultCheck = () => {
      if (this.clock < this.letAt) return;
      this.pendingPoint = null;
      this.ball.frozen = true;
      this.setState('pointOver');
      this.afterFault = true; // same serve again
    };
  }
  private faultCheck: (() => void) | null = null;
  private afterFault = false;

  // ------------------------------------------------------------------------------------ point over
  private lastResult: ReturnType<Match['pointTo']> | null = null;

  private awardPoint(w: 0 | 1, reason: PointReason) {
    this.faultCheck = null;
    if (reason === 'ace') this.highlight = { kind: 'ace', hitter: w };
    else if (reason === 'winner' && this.rallyShots >= 3) this.highlight = { kind: 'winner', hitter: w };
    else if (this.rallyShots >= 9) this.highlight = { kind: 'rally', hitter: w };
    const res = this.match.pointTo(w, reason);
    this.say(`POINT ${this.names[w]} (${reason}) rally=${this.rallyShots} → ${this.match.call(this.names)} | games ${this.match.sets.map((x) => x.join('-')).join(' ')}`);
    this.lastResult = res;
    this.afterFault = false;
    this.setState('pointOver');
    const call = this.match.call(this.names);
    const wName = this.names[w];
    const big = res.game || reason === 'ace' || this.rallyShots > 8;
    const humanWon = w === 0;
    if (res.match) {
      this.hud.call('Game, set and match', this.names[w], 5);
      this.audio.say(call);
    } else if (res.set) {
      this.hud.call('Set', wName, 3);
      this.audio.say(`Game and set, ${this.fullName(w)}`);
    } else if (res.game) {
      this.hud.call(res.breakOfServe ? 'Break' : 'Game', wName, 2.6);
      this.audio.say(`Game, ${this.fullName(w)}`);
    } else {
      const title = reason === 'ace' ? 'Ace' : reason === 'double' ? 'Double fault' : reason === 'winner' && this.rallyShots > 0 ? 'Winner' : '';
      if (title) this.hud.call(title, call, 2.2);
      else this.hud.call(call, '', 2);
      setTimeout(() => this.audio.say(call), title === 'Ace' ? 500 : 250);
    }
    this.hud.score(this.match, this.match.currentServer);
    this.boards();
    // the crowd
    const intensity = Math.min(1, 0.35 + this.rallyShots * 0.06 + (res.game ? 0.25 : 0) + (res.breakOfServe ? 0.2 : 0) + (res.set ? 0.3 : 0));
    this.audio.applause(intensity, 2.5 + intensity * 2.5);
    this.crowd?.react(res.set || res.match ? 2 : 1, 0.45 + intensity * 0.45);
    setTimeout(() => this.crowd?.react(0), (2.8 + intensity * 2) * 1000);
    this.audio.crowdLevel(0.9, 0.5);
    // the players: a fist pump or a shrug
    const W = this.players[w], L = this.players[1 - w];
    if (big) W.rig.react('cheer3', 1.8);
    if (reason !== 'ace' && Math.random() < 0.6) L.rig.react(Math.random() < 0.5 ? 'shrug' : 'dust', 1.8);
    void humanWon;
    if (res.match) {
      this.onMatchOver?.(this.match);
    }
  }

  private fullName(i: 0 | 1): string {
    return this.players[i].name.split(' ').slice(-1)[0];
  }

  private pointOver(dt: number) {
    this.idlePlayers(dt);
    if (!this.replayDone && this.stateT > 1.3) {
      this.replayDone = true;
      if (this.close && this.startHawkEye()) return;
      if (!this.afterFault && this.highlight && (this.highlight.kind !== 'rally' || Math.random() < 0.6) && this.startReplay()) return;
    }
    const wait = this.afterFault ? 1.3 : this.lastResult?.game ? 3.4 : 2.6;
    if (this.stateT < wait) return;
    if (this.match.winner !== null) {
      this.setState('matchOver');
      return;
    }
    if (!this.afterFault && this.lastResult?.changeEnds) {
      this.setState('changeover');
      this.hud.call('Change of ends', '', 2.2);
      this.dir.subject.copy(this.human.pos);
      this.dir.cut('close');
      return;
    }
    this.setupPoint();
  }

  // ------------------------------------------------------------------------------------ replays
  private replayPhase = 0;
  private startReplay(): boolean {
    const back = Math.min(this.replay.duration - 0.2, Math.max(3.2, this.clock - this.lastHitT + 2.4));
    if (!this.replay.start(back, 0.2, 0.42)) return false;
    this.state = 'replay';
    this.stateT = 0;
    const h = this.highlight!;
    const hitter = this.players[h.hitter];
    this.dir.subject.copy(hitter.pos);
    this.dir.cut(h.kind === 'ace' ? 'replayBaseline' : Math.random() < 0.5 ? 'replaySide' : 'replayBaseline');
    this.hud.call('Replay', '', 1.6);
    this.hud.replayTag(true);
    this.audio.crowdLevel(0.6);
    return true;
  }

  private startHawkEye(): boolean {
    const c = this.close!;
    const path = this.replay.path(c.hitT, c.t + 0.02);
    if (path.length < 4) return false;
    // play the last metres of the flight into the bounce, slowly, from low beside the line
    const back = this.clock - c.t + 0.7;
    if (!this.replay.start(back, Math.max(0, this.clock - c.t - 0.25), 0.3)) return false;
    this.state = 'hawkeye';
    this.stateT = 0;
    this.replayPhase = 0;
    this.dir.subject.set(c.x, 0, c.z);
    this.dir.cut('hawkeye');
    this.hawk.show(path, c, c.inside, c.mm);
    this.hud.replayTag(true);
    return true;
  }

  private replayTick(dt: number) {
    const b = this.ballView.mesh.position;
    const playing = this.replay.step(dt);
    // the camera follows the recorded ball
    this.dir.update(dt, b, this.dir.subject, this.players[1].pos);
    const dist = this.camera.position.distanceTo(this.state === 'hawkeye' ? this.dir.subject : b);
    this.onDof?.(true, dist, this.state === 'hawkeye' ? 1.2 : 3.5);
    this.world.ballPos.copy(b);
    if (this.input.takePress()) this.replay.stop();
    const hold = this.state === 'hawkeye' ? 2.2 : 0.4;
    if (!playing) {
      this.replayPhase += dt;
      if (this.replayPhase > hold || !this.replay.playing && this.stateT > 12) this.endReplay();
    } else this.replayPhase = 0;
  }

  private endReplay() {
    this.onDof?.(false);
    this.hawk.hide();
    this.hud.replayTag(false);
    // restore the live pose (the rig poses everyone again next frame)
    this.state = 'pointOver';
    this.stateT = 1.4;
    this.dir.cut('broadcast');
  }

  private changeover(dt: number) {
    this.idlePlayers(dt);
    if (this.stateT > 3.2) {
      this.setupPoint();
      this.dir.cut('broadcast');
    }
  }

  private idlePlayers(dt: number) {
    for (const p of this.players) p.drive(dt, new THREE.Vector3());
  }

  private footSounds(p: Player, _dt: number) {
    const i = p.index;
    const dv = p.vel.clone().sub(this.prevVel[i]);
    this.prevVel[i].copy(p.vel);
    if (this.world.venue.surface !== 'hard') return;
    // a hard stop or change of direction squeaks
    if (dv.length() > 0.19 && p.vel.length() > 1.2 && this.clock - this.lastSqueak[i] > 0.45 && Math.random() < 0.35) {
      this.lastSqueak[i] = this.clock;
      this.audio.squeak(this.pan(p.pos), Math.min(1, p.pos.distanceTo(this.camera.position) < 20 ? 1 : 0.5));
    }
  }

  private pan(p: { x: number; z: number; y?: number }): number {
    const cam = this.camera;
    const v = new THREE.Vector3(p.x, p.y ?? 0.5, p.z).project(cam);
    return THREE.MathUtils.clamp(v.x * 0.7, -0.9, 0.9);
  }

  // ------------------------------------------------------------------------------------ tools
  /** skip the intro (tests) */
  skipIntro() {
    this.begin();
  }
}

function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
