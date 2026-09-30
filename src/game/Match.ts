/**
 * Tennis scoring and the service rota, renderer-free. Player 0 and 1; `server` serves this
 * game (in a tiebreak the rota turns after the first point, then every two). Sides: player
 * 0 starts at the near end (+z); ends change after the first game and every two games after,
 * and every six points of a tiebreak.
 */

export type PointReason = 'ace' | 'winner' | 'out' | 'net' | 'double' | 'unforced' | 'forced' | 'unreturned' | 'service-winner';

export interface MatchConfig {
  sets: 1 | 3 | 5;
  gamesPerSet: number;
  /** tiebreak at games-all (and a 10-point tiebreak in the final set when true) */
  finalSetTiebreak10: boolean;
  noAd: boolean;
}

export const DEFAULT_MATCH: MatchConfig = { sets: 3, gamesPerSet: 6, finalSetTiebreak10: false, noAd: false };

export class Match {
  sets: [number, number][] = [[0, 0]];
  points: [number, number] = [0, 0];
  setsWon: [number, number] = [0, 0];
  server: 0 | 1 = 0;
  /** who served the first point of the current tiebreak */
  tbFirstServer: 0 | 1 = 0;
  tiebreak = false;
  /** player 0 at the near end (+z)? */
  p0Near = true;
  secondServe = false;
  winner: 0 | 1 | null = null;
  history: { winner: 0 | 1; reason: PointReason }[] = [];
  stats = [0, 1].map(() => ({ aces: 0, doubles: 0, winners: 0, unforced: 0, firstIn: 0, firstTotal: 0, pointsWon: 0, fastestServe: 0, breakPoints: 0, breaksWon: 0 }));

  constructor(readonly cfg: MatchConfig = DEFAULT_MATCH, firstServer: 0 | 1 = 0) {
    this.server = firstServer;
  }

  get set(): [number, number] {
    return this.sets[this.sets.length - 1];
  }

  /** points in the current game (or tiebreak) */
  get pointNumber(): number {
    return this.points[0] + this.points[1];
  }

  /** who serves the next point */
  get currentServer(): 0 | 1 {
    if (!this.tiebreak) return this.server;
    const n = this.pointNumber;
    // tiebreak: first point by tbFirstServer, then alternate every two
    const k = Math.floor((n + 1) / 2) % 2;
    return (k === 0 ? this.tbFirstServer : 1 - this.tbFirstServer) as 0 | 1;
  }

  /** serving from the deuce (right) court? */
  get deuceCourt(): boolean {
    return this.pointNumber % 2 === 0;
  }

  get tiebreakTarget(): number {
    const finalSet = this.sets.length === this.cfg.sets;
    return finalSet && this.cfg.finalSetTiebreak10 ? 10 : 7;
  }

  /** a point is won — returns what it ended (for the umpire and the crowd) */
  pointTo(w: 0 | 1, reason: PointReason): { game: boolean; set: boolean; match: boolean; breakOfServe: boolean; changeEnds: boolean } {
    const out = { game: false, set: false, match: false, breakOfServe: false, changeEnds: false };
    if (this.winner !== null) return out;
    this.history.push({ winner: w, reason });
    this.stats[w].pointsWon++;
    const l = (1 - w) as 0 | 1;
    const srv = this.currentServer;
    if (reason === 'ace') this.stats[w].aces++;
    if (reason === 'double') this.stats[l].doubles++;
    if (reason === 'winner') this.stats[w].winners++;
    if (reason === 'unforced' || reason === 'out' || reason === 'net') this.stats[l].unforced++;
    this.secondServe = false;
    this.points[w]++;
    const [a, b] = this.points;
    if (this.tiebreak) {
      const tgt = this.tiebreakTarget;
      if ((this.points[w] >= tgt) && this.points[w] - this.points[l] >= 2) {
        this.set[w]++;
        out.game = true;
        this.endGame(w, out, srv);
      } else if ((a + b) % 6 === 0) out.changeEnds = true;
      if (out.changeEnds && !out.game) this.p0Near = !this.p0Near;
      return out;
    }
    const won = this.cfg.noAd ? this.points[w] >= 4 : this.points[w] >= 4 && this.points[w] - this.points[l] >= 2;
    if (won) {
      this.set[w]++;
      out.game = true;
      out.breakOfServe = w !== srv;
      if (out.breakOfServe) this.stats[w].breaksWon++;
      this.endGame(w, out, srv);
    }
    return out;
  }

  private endGame(w: 0 | 1, out: { set: boolean; match: boolean; changeEnds: boolean }, srv: 0 | 1) {
    const s = this.set;
    const G = this.cfg.gamesPerSet;
    const wasTiebreak = this.tiebreak;
    this.points = [0, 0];
    this.tiebreak = false;
    // next server: after a tiebreak, the player who received first in it serves
    this.server = (wasTiebreak ? 1 - this.tbFirstServer : 1 - this.server) as 0 | 1;
    void srv;
    const setWon = (s[w] >= G && s[w] - s[1 - w] >= 2) || wasTiebreak;
    if (setWon) {
      out.set = true;
      this.setsWon[w]++;
      const need = Math.ceil(this.cfg.sets / 2);
      if (this.setsWon[w] >= need) {
        out.match = true;
        this.winner = w;
        return;
      }
      this.sets.push([0, 0]);
    } else if (s[0] === G && s[1] === G) {
      this.tiebreak = true;
      this.tbFirstServer = this.server;
    }
    // ends change when the total games in the set is odd (a new set continues the count)
    const total = this.totalGamesPlayed();
    if (total % 2 === 1) {
      out.changeEnds = true;
      this.p0Near = !this.p0Near;
    }
  }

  private totalGamesPlayed(): number {
    return this.sets.reduce((n, s) => n + s[0] + s[1], 0);
  }

  /** the umpire's call for the score after a point (in the server's order) */
  call(names: [string, string]): string {
    if (this.winner !== null) return `Game, set and match, ${names[this.winner]}`;
    const s = this.currentServer;
    const r = (1 - s) as 0 | 1;
    const [ps, pr] = [this.points[s], this.points[r]];
    if (this.tiebreak) {
      if (ps === pr) return `${num(ps)} all`;
      const lead = ps > pr ? s : r;
      return `${num(Math.max(ps, pr))}–${num(Math.min(ps, pr))}, ${names[lead]}`;
    }
    const W = ['Love', 'Fifteen', 'Thirty', 'Forty'];
    if (ps >= 3 && pr >= 3) {
      if (ps === pr) return 'Deuce';
      return `Advantage ${names[ps > pr ? s : r]}`;
    }
    if (ps === pr) return `${W[ps]} all`;
    return `${W[ps]}–${W[pr]}`;
  }

  /** short point score for the scorebug: "15", "40", "AD" */
  pointLabel(p: 0 | 1): string {
    const [a, b] = [this.points[p], this.points[1 - p]];
    if (this.tiebreak) return String(a);
    if (a >= 3 && b >= 3) return a > b ? 'AD' : '40';
    return ['0', '15', '30', '40'][Math.min(3, a)];
  }

  /** is the next point a break / set / match point? (for presentation) */
  pressure(): { breakPoint: boolean; setPoint: 0 | 1 | null; matchPoint: 0 | 1 | null } {
    const res = { breakPoint: false, setPoint: null as 0 | 1 | null, matchPoint: null as 0 | 1 | null };
    for (const p of [0, 1] as const) {
      // would winning the next point win the game?
      const [a, b] = [this.points[p], this.points[1 - p]];
      const winsGame = this.tiebreak ? a + 1 >= this.tiebreakTarget && a + 1 - b >= 2 : this.cfg.noAd ? a >= 3 : a >= 3 && a - b >= 1;
      if (!winsGame) continue;
      if (!this.tiebreak && p !== this.currentServer) res.breakPoint = true;
      const s = this.set;
      const G = this.cfg.gamesPerSet;
      const winsSet = this.tiebreak || (s[p] + 1 >= G && s[p] + 1 - s[1 - p] >= 2);
      if (winsSet) {
        res.setPoint = p;
        if (this.setsWon[p] + 1 >= Math.ceil(this.cfg.sets / 2)) res.matchPoint = p;
      }
    }
    return res;
  }
}

function num(n: number) {
  return ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n] ?? String(n);
}
