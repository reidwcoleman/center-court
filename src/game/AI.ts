import type { Player, Plan, Skill } from './Player.ts';
import type { ShotType } from './Input.ts';
import { HL } from '../sim/dims.ts';

export type Difficulty = 'rookie' | 'club' | 'pro' | 'legend';

/** per level: movement + shot skills, how often it attacks, how steady it is, and its error rate per shot */
export const AI_LEVELS: Record<Difficulty, { skill: Skill; aggression: number; consistency: number; errors: number; name: string }> = {
  rookie: { skill: { speed: 4.6, accel: 9, power: 0.55, accuracy: 0.55, spin: 0.6, reaction: 0.3 }, aggression: 0.15, consistency: 0.55, errors: 0.2, name: 'Rookie' },
  club: { skill: { speed: 5.3, accel: 11, power: 0.7, accuracy: 0.7, spin: 0.75, reaction: 0.22 }, aggression: 0.3, consistency: 0.72, errors: 0.13, name: 'Club' },
  pro: { skill: { speed: 5.9, accel: 12.5, power: 0.85, accuracy: 0.84, spin: 0.85, reaction: 0.17 }, aggression: 0.45, consistency: 0.86, errors: 0.085, name: 'Pro' },
  legend: { skill: { speed: 6.3, accel: 14, power: 0.95, accuracy: 0.93, spin: 0.95, reaction: 0.13 }, aggression: 0.55, consistency: 0.94, errors: 0.055, name: 'Legend' },
};

/**
 * The computer's shot choice for a planned contact: defend when stretched or deep (slice,
 * lob), attack a short ball (flat to the open court), otherwise rally with topspin, mostly
 * cross-court, going down the line when the opponent is pulled wide.
 */
export function aiChooseShot(me: Player, plan: Plan, opp: Player, level: Difficulty): { type: ShotType; aimX: number; aimD: number; power: number } {
  const L = AI_LEVELS[level];
  const R = Math.random;
  const depth = Math.abs(plan.ball.z); // distance from the net
  const stretched = plan.late > -0.05 || Math.abs(plan.body.x) > 5.5;
  const high = plan.ball.y > 1.45;
  const low = plan.ball.y < 0.55;
  // the opponent's position in my aim frame: my right is +aimX
  const oppX = opp.pos.x * me.side; // + = opponent on my right
  const open = oppX > 0.6 ? -1 : oppX < -0.6 ? 1 : R() < 0.5 ? -1 : 1;
  // cross-court: from my forehand corner to their forehand corner, i.e. the same side of the centre line as me
  const myX = plan.body.x * me.side;
  const cross = myX > 0.3 ? 1 : myX < -0.3 ? -1 : open;
  // the opponent at the net: pass them, or lob
  if (Math.abs(opp.pos.z) < 5.5 && !plan.volley) {
    if (R() < 0.3) return { type: 'lob', aimX: -Math.sign(oppX || 1) * 0.4, aimD: 0.7, power: 0.55 };
    return { type: R() < 0.6 ? 'topspin' : 'flat', aimX: oppX > 0 ? -0.9 : 0.9, aimD: -0.2 - R() * 0.3, power: 0.8 + R() * 0.2 };
  }
  if (plan.smash) return { type: 'flat', aimX: open * (0.5 + R() * 0.4), aimD: 0.2, power: 0.85 + L.skill.power * 0.15 };
  if (plan.volley) {
    const drop = R() < 0.18 * L.aggression * 2;
    return drop ? { type: 'drop', aimX: open * 0.6, aimD: -0.3, power: 0.3 } : { type: 'slice', aimX: open * (0.55 + R() * 0.35), aimD: 0.3, power: 0.6 };
  }
  if (stretched || (low && depth > HL - 0.5)) {
    // defend: a high deep ball, or a slice to reset
    if (R() < 0.35) return { type: 'lob', aimX: (R() - 0.5) * 0.8, aimD: 0.6, power: 0.5 };
    return { type: 'slice', aimX: cross * (0.2 + R() * 0.4), aimD: 0.6, power: 0.55 };
  }
  const short = depth < HL - 3.2;
  if (short && !low && R() < 0.35 + L.aggression) {
    // attack: flat into the open court, or a drop shot now and then
    if (R() < 0.12 * L.aggression * 2 && opp.pos.z * opp.side > HL - 0.5) return { type: 'drop', aimX: open * 0.5, aimD: -0.4, power: 0.35 };
    return { type: high ? 'flat' : 'topspin', aimX: open * (0.7 + R() * 0.25), aimD: 0.3 + R() * 0.5, power: 0.75 + L.skill.power * 0.25 };
  }
  // rally: topspin cross-court, some down the line when the opponent drifts
  const dtl = R() < 0.18 + L.aggression * 0.3 && Math.abs(oppX) > 1.0;
  const aimX = dtl ? -cross * (0.55 + R() * 0.3) : cross * (0.45 + R() * 0.45);
  // depth varies: some balls land short (and invite the attack)
  const aimD = R() < 0.22 ? -0.4 - R() * 0.3 : 0.1 + R() * 0.85;
  const t: ShotType = R() < 0.12 ? 'slice' : R() < 0.25 * L.aggression ? 'flat' : 'topspin';
  return { type: t, aimX, aimD, power: 0.45 + R() * 0.35 * (0.5 + L.aggression) + L.skill.power * 0.15 };
}

/** serve choice: first serves go for more; second serves are kicked in */
export function aiServe(level: Difficulty, second: boolean): { type: ShotType; aimX: number; power: number } {
  const L = AI_LEVELS[level];
  const R = Math.random;
  const spot = R();
  // aimX: −1 wide … +1 at the T (from the server's view this maps per court side in Game)
  const aimX = spot < 0.4 ? -0.85 - R() * 0.15 : spot < 0.75 ? 0.85 + R() * 0.15 : (R() - 0.5) * 0.4;
  if (second) return { type: 'topspin', aimX: aimX * 0.6, power: 0.45 + L.skill.power * 0.25 };
  return { type: R() < 0.65 ? 'flat' : 'slice', aimX, power: 0.7 + L.skill.power * 0.3 * (0.6 + R() * 0.4) };
}
