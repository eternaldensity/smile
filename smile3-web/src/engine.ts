import {
  BALLOON, BRICK, CONVEY, DOOR, DYNO, ENERGY, EXPLODE, GLASS, KEY, LADDER,
  MINCE, MONEY, NITRO, NOWT, PANEL, PRODUCER, RADAR, ROPE, SMILE, SWITCH,
  TNT, TOLL, WARP, WATER, WEIGHT, WOOD,
  dBUP, dDOWN, dFALL, dLEFT, dRIGHT, dUP,
  exBNitro, exBalloon, exBalloonx, exDyno, exNotmuch, exPNitro, exSNitro,
  exSmile, exTNT, isEven, oppositeD, tollPrice,
  MONEY_VALUES, EXPLODEFRAMES, TNTFRAMES, WATERFRAMES,
  type Direction,
} from "./constants";
import type { ParsedLevel } from "./level-format";
import type { PopupData, SoundSink, SwitchData, ThingData } from "./types";

export interface SubResult {
  success: boolean;
  score: number;
  energy: number;
  keys: boolean[][];
}

export interface EngineEvents {
  sound: SoundSink;
  popup: (text: string) => void;
  levelComplete: () => void;
  levelFailed: () => void;
  hudChanged: () => void;
  /** Toll gate with a price: UI must ask the player, then payToll()/declineToll(). */
  toll: (amount: number) => void;
  /** Toll sublevel gate: UI must open a nested sub-game for subpath. */
  openSub: (subpath: string, smileNum: number) => void;
  /** Sub-game only: session ended. */
  subComplete: (result: SubResult) => void;
}

const noopEvents = (): EngineEvents => ({
  sound: () => {},
  popup: () => {},
  levelComplete: () => {},
  levelFailed: () => {},
  hudChanged: () => {},
  toll: () => {},
  openSub: () => {},
  subComplete: () => {},
});

interface CheckpointSnap {
  parsed: ParsedLevel;
  keys: boolean[][];
  energy: number[];
}

interface PendingToll {
  x: number;
  y: number;
  s: number;
  dir: Direction;
}

const blank = (): ThingData => ({ value: 0, extra1: 0, extra2: 0, extra3: 0 });

/**
 * Faithful port of smile3 Game.frm.
 *
 * Deviations from the VB6 original (documented, sensible):
 * - Money uses a frozen denomination table (Startup.frm values).
 * - MsgBox popups / toll Yes-No are non-blocking callbacks. A toll Yes is
 *   completed via payToll() (re-validates affordability, then resumes the step).
 * - Sublevels (VB: a second frmGame window) are nested Engine sessions driven
 *   through openSub/subComplete; the mother merges score/energy/keys on success.
 * - Recursion in MoveObjectCheck / MakeThingFromSwitch / CheckMince is
 *   depth-guarded; out-of-level cell reads yield blanks (VB's fixed 41x41
 *   arrays behaved the same way for in-range levels).
 */
export class Engine {
  xsize = 0;
  ysize = 0;
  levelId = "";
  numPlayers: 1 | 2 = 1;
  perm: ThingData[][] = [];
  coll: ThingData[][] = [];
  move: ThingData[][] = [];
  popups: PopupData[] = [];
  switches: SwitchData[] = [];
  subpaths: string[] = [];

  smileX = [0, 0];
  smileY = [0, 0];
  viewX = [0, 0];
  viewY = [0, 0];
  blnView = [true, true];

  keys: boolean[][] = [];
  score = [0, 0];
  energy = [0, 0];
  lives = [3, 3];
  shields = [0, 0];
  dead = [false, false];
  waterSafe = [false, false];
  makeZapNoise = true;

  checkpoint = false;
  private checkpointSnap: CheckpointSnap | null = null;
  currentLevelName = "";
  private currentParsed: ParsedLevel | null = null;

  /** Sub-game mode (VB blnSub). Set before loadParsed for sub sessions. */
  blnSub = false;
  subSmileNum = 0;
  /** Mother side: a sub-game is open (VB blnInSub). */
  blnInSub = false;
  private intSubX = 0;
  private intSubY = 0;
  private pendingToll: PendingToll | null = null;

  wIndex = 0;
  nIndex = 0;
  zapIndex = 1;
  cindex = [0, 0, 0];
  fpsCount = 0;

  events: EngineEvents = noopEvents();
  private moveDepth = 0;
  private switchDepth = 0;
  private minceDepth = 0;

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x <= this.xsize && y <= this.ysize;
  }

  /** OOB-safe read (VB fixed arrays returned blanks past the level edge). */
  private at(grid: ThingData[][], x: number, y: number): ThingData {
    if (!this.inBounds(x, y)) return blank();
    return grid[x]![y]!;
  }

  // ---------- loading ----------

  loadParsed(parsed: ParsedLevel, levelName: string, restartScores: boolean): void {
    this.xsize = parsed.xsize;
    this.ysize = parsed.ysize;
    this.levelId = parsed.levelId;
    this.numPlayers = parsed.players;
    const clone = (g: ThingData[][]) => g.map((col) => col.map((c) => ({ ...c })));
    this.perm = clone(parsed.perm);
    this.coll = clone(parsed.coll);
    this.move = clone(parsed.move);
    this.popups = parsed.popups.map((p) => ({ ...p }));
    this.switches = parsed.switches.map((s) => ({ ...s }));
    this.subpaths = [...parsed.subpaths];
    this.currentParsed = parsed;
    this.currentLevelName = levelName;
    this.checkpoint = false;
    this.checkpointSnap = null;
    this.pendingToll = null;
    for (let s = 0; s < this.numPlayers; s++) {
      if (this.dead[s]) {
        const sx = parsed.smileStarts[s]?.x ?? 0;
        const sy = parsed.smileStarts[s]?.y ?? 0;
        if (this.inBounds(sx, sy)) this.move[sx]![sy] = blank();
      }
    }
    for (let s = 0; s < this.numPlayers; s++) {
      this.smileX[s] = parsed.smileStarts[s]?.x ?? 0;
      this.smileY[s] = parsed.smileStarts[s]?.y ?? 0;
    }
    // Sub-game adjustment (Form_Load): player-2 slot mirrors player 1.
    if (this.blnSub && this.subSmileNum === 1) {
      this.smileX[1] = this.smileX[0]!;
      this.smileY[1] = this.smileY[0]!;
      if (this.inBounds(this.smileX[1]!, this.smileY[1]!)) {
        this.move[this.smileX[1]!]![this.smileY[1]!]!.extra1 = 1;
      }
    }
    this.initialize(restartScores);
    if (parsed.checkpointKeys && parsed.checkpointEnergy) {
      for (let k = 1; k <= 6; k++)
        for (let s = 0; s < 2; s++) this.keys[k]![s] = parsed.checkpointKeys[k]?.[s] ?? false;
      for (let s = 0; s < 2; s++) this.energy[s] = parsed.checkpointEnergy[s] ?? 0;
    }
    for (let s = 0; s < this.numPlayers; s++) {
      this.viewX[s] = this.smileX[s]!;
      this.viewY[s] = this.smileY[s]!;
    }
    this.events.hudChanged();
  }

  initialize(restart: boolean): void {
    this.checkpoint = false;
    this.makeZapNoise = true;
    for (let s = 0; s < this.numPlayers; s++) {
      this.score[s] = 0;
      this.energy[s] = 0;
      this.shields[s] = 0;
      if (restart) {
        this.lives[s] = this.blnSub ? 1 : 3;
        this.dead[s] = false;
      }
      this.blnView[s] = true;
      this.waterSafe[s] = false;
    }
    for (let k = 1; k <= 6; k++) {
      if (!this.keys[k]) this.keys[k] = [false, false];
      this.keys[k]![0] = false;
      this.keys[k]![1] = false;
    }
    this.events.hudChanged();
  }

  clearArrays(): void {
    for (let x = 0; x <= this.xsize; x++)
      for (let y = 0; y <= this.ysize; y++) {
        this.perm[x]![y] = blank();
        this.coll[x]![y] = blank();
        this.move[x]![y] = blank();
      }
  }

  // ---------- input (PB_KeyDown port) ----------

  press(s: number, dir: Direction): boolean {
    if (s >= this.numPlayers) return false;
    if (this.dead[s]) return false;
    if (this.blnInSub) return false;
    const sm = this.at(this.move, this.smileX[s]!, this.smileY[s]!);
    if (sm.value !== SMILE) {
      this.killSmile(s);
      return false;
    }
    const ok = this.moveObjectCheck(this.smileX[s]!, this.smileY[s]!, SMILE, dir);
    // Keep the follow-camera glued to the smile so the next painted frame
    // already uses the new viewport (VB did this in Draw; we draw on demand).
    if (ok && this.blnView[s]) {
      this.viewX[s] = this.smileX[s]!;
      this.viewY[s] = this.smileY[s]!;
    }
    return ok;
  }

  toggleView(s: number): void {
    if (s < this.numPlayers) this.blnView[s] = !this.blnView[s];
  }

  panView(s: number, dir: Direction): void {
    if (s >= this.numPlayers) return;
    if (dir === dUP || dir === dBUP) this.viewY[s]!--;
    else if (dir === dDOWN || dir === dFALL) this.viewY[s]!++;
    else if (dir === dLEFT) this.viewX[s]!--;
    else this.viewX[s]!++;
  }

  suicide(s: number): void {
    if (s < this.numPlayers && !this.dead[s]) this.killSmile(s);
  }

  // ---------- toll (async MsgBox replacement) ----------

  declineToll(): void {
    this.pendingToll = null;
  }

  /** Complete a pending toll Yes: re-validate, deduct, clear, resume the step. */
  payToll(): boolean {
    const p = this.pendingToll;
    this.pendingToll = null;
    if (!p || !this.inBounds(p.x, p.y)) return false;
    const cell = this.perm[p.x]![p.y]!;
    if (cell.value !== TOLL || cell.extra1 >= 5) return false;
    const pay = tollPrice(cell.extra1);
    if (this.score[p.s]! < pay) return false;
    cell.value = NOWT;
    cell.extra1 = NOWT;
    this.score[p.s]! -= pay;
    this.events.sound("cash", false);
    this.events.hudChanged();
    return this.press(p.s, p.dir);
  }

  // ---------- sub-game merge (tmrRef port) ----------

  /** Merge a finished sub-game back (success clears the toll cell). */
  mergeSub(result: SubResult, smileNum: number): void {
    this.blnInSub = false;
    if (result.success) {
      if (this.inBounds(this.intSubX, this.intSubY)) {
        const c = this.perm[this.intSubX]![this.intSubY]!;
        c.value = NOWT;
        c.extra1 = NOWT;
        c.extra2 = NOWT;
      }
      this.energy[smileNum]! += result.energy;
      this.score[smileNum]! += result.score;
      for (let k = 1; k <= 6; k++) {
        if (!this.keys[k]) this.keys[k] = [false, false];
        this.keys[k]![smileNum] = this.keys[k]![smileNum] || !!result.keys[k]?.[smileNum];
      }
      this.events.hudChanged();
    }
  }

  // ---------- per-tick update (MainLoop port; Draw lives in renderer) ----------

  tick(): void {
    const xs = this.xsize;
    const ys = this.ysize;

    // Warps + mince disarm.
    for (let x = 0; x <= xs; x++)
      for (let y = 0; y <= ys; y++) {
        if (this.perm[x]![y]!.value === WARP && this.perm[x]![y]!.extra2 !== 0) {
          this.moveThing(x, y);
        }
        if (this.move[x]![y]!.value === MINCE) this.move[x]![y]!.extra1 = 0;
      }

    // Stateful tiles.
    let zapSound = false;
    for (let x = 0; x <= xs; x++)
      for (let y = 0; y <= ys; y++) {
        const m = this.move[x]![y]!;
        switch (m.value) {
          case DYNO:
            if (m.extra1 !== NOWT) {
              m.value = EXPLODE;
              m.extra1 = NOWT;
              m.extra2 = exDyno;
              this.events.sound("bang", false);
            }
            break;
          case TNT:
            if (m.extra1 > 0) m.extra1++;
            if (m.extra1 > TNTFRAMES - 1) {
              m.extra1 = NOWT;
              m.extra2 = exTNT;
              m.value = EXPLODE;
              this.events.sound("tnt", false);
            }
            break;
          case EXPLODE:
            m.extra1++;
            if (m.extra1 > EXPLODEFRAMES) {
              if (m.extra2 !== 0 && m.extra2 !== exBNitro && m.extra2 !== exSNitro && m.extra2 !== exPNitro) {
                this.spreadExplode(x, y, m.extra2);
              }
              m.extra1 = NOWT;
              m.extra2 = NOWT;
              m.value = NOWT;
            } else if (m.extra2 === exBNitro || m.extra2 === exSNitro || m.extra2 === exPNitro) {
              if (m.extra1 === 4) {
                this.events.sound("nitro", false);
                this.spreadExplode(x, y, m.extra2);
              }
            }
            break;
          case NITRO:
            if (m.extra1 === 2 && this.zapIndex === 1 + m.extra3) {
              if (this.zap1Nitro(x, y)) zapSound = true;
            } else if (m.extra1 === 4 && this.nIndex === 3) {
              if (m.extra2 === NOWT) {
                m.extra2 = exBNitro;
                m.extra1 = NOWT;
                m.value = EXPLODE;
              } else if (isEven(m.extra2)) {
                m.extra2 -= 2;
              }
            }
            break;
          case RADAR:
            if (m.extra1 < 2) {
              if (!this.radarPoint(x, y)) {
                m.value = EXPLODE;
                m.extra1 = NOWT;
                m.extra2 = exTNT;
                m.extra3 = NOWT;
              }
            } else if (m.extra1 === 2 || m.extra1 === 3) {
              if (this.radarPoint(x, y)) m.extra1 -= 2;
            }
            break;
          case MINCE:
            this.minceCheck(x, y);
            this.checkMince(x, y);
            break;
        }
      }

    if (zapSound && this.makeZapNoise) this.events.sound("zap", false);

    // Falling (y bottom-up so chains resolve in one tick).
    for (let x = 0; x <= xs; x++)
      for (let y = ys; y >= 0; y--) {
        const m = this.move[x]![y]!;
        switch (m.value) {
          case PANEL:
          case DYNO:
          case TNT:
          case SMILE:
          case GLASS:
            if (this.canFall(x, y)) this.moveObjectCheck(x, y, m.value, dFALL);
            break;
          case NITRO:
            if (m.extra1 === 3 && this.canFall(x, y)) {
              this.moveObjectCheck(x, y, m.value, dFALL);
            }
            break;
          case RADAR:
            if (!isEven(m.extra1) && this.canFall(x, y)) {
              this.moveObjectCheck(x, y, m.value, dFALL);
            }
            break;
          case WEIGHT: {
            if (this.canFall(x, y)) {
              if (!this.moveObjectCheck(x, y, m.value, dDOWN) && this.move[x]![y]!.extra3 === 1) {
                this.move[x]![y]!.value = BALLOON;
              }
            } else if (this.move[x]![y]!.extra3 === 1) {
              this.move[x]![y]!.value = BALLOON;
            }
            const w = this.move[x]![y]!;
            if (w.extra3 === dLEFT || w.extra3 === dRIGHT) {
              if (w.extra2 === NOWT) {
                w.extra2 = 6;
                if (!this.moveObjectCheck(x, y, WEIGHT, w.extra3 as Direction)) {
                  w.extra3 = oppositeD(w.extra3);
                }
              } else {
                w.extra2--;
              }
            }
            break;
          }
          case BALLOON: {
            const b = this.move[x]![y]!;
            if (b.extra2 === 0) {
              b.extra2 = 1;
              if (!this.moveObjectCheck(x, y, BALLOON, dBUP)) {
                const c = this.move[x]![y]!;
                if (c.extra1 === 2) {
                  let blown = true;
                  if (y < ys && this.move[x]![y + 1]!.value === WOOD && this.move[x]![y + 1]!.extra1 === 2) {
                    blown = false;
                  } else if (y > 0 && this.perm[x]![y]!.value === CONVEY) {
                    blown = false;
                  } else if (c.extra3 > 0) {
                    this.makeThingFromSwitch(c.extra3, x, y, true);
                    const c2 = this.move[x]![y]!;
                    if (c2.value !== BALLOON || c2.extra1 !== 2) {
                      this.events.sound("nitro", false);
                      this.spreadExplode(x, y, exBNitro);
                    }
                    blown = false;
                    if (this.move[x]![y]!.extra3 === 1) this.move[x]![y]!.value = WEIGHT;
                  }
                  if (blown) {
                    c.value = EXPLODE;
                    c.extra1 = NOWT;
                    c.extra2 = exBNitro;
                    c.extra3 = NOWT;
                  }
                } else if (this.move[x]![y]!.extra3 === 1) {
                  this.move[x]![y]!.value = WEIGHT;
                }
              }
            } else if (b.extra2 >= 1 && b.extra2 <= 7) {
              b.extra2++;
            } else if (b.extra2 === 8) {
              b.extra2 = 0;
            }
            break;
          }
        }
      }

    // Conveyors (gated by ZapIndex % 3).
    if (this.zapIndex % 3 === 0) {
      for (let x = 0; x <= xs; x++)
        for (let y = 0; y <= ys; y++) {
          if (this.perm[x]![y]!.value !== CONVEY) continue;
          const mv = this.move[x]![y]!.value;
          if (!this.isMove(mv, x, y) && mv !== NITRO) continue;
          const sp = this.perm[x]![y]!.extra2;
          if (sp === 0) {
            if (this.zapIndex % 12 === 0) this.doConvey(x, y);
          } else if (sp === 1) {
            if (this.zapIndex % 6 === 0) this.doConvey(x, y);
          } else if (sp === 2) {
            this.doConvey(x, y);
          } else if (sp > 8) {
            this.perm[x]![y]!.extra2 = sp - 10;
          }
        }
    }

    // Producers: up to 10 random picks, first producer found acts.
    for (let s = 0; s < 10; s++) {
      const x = Math.floor(Math.random() * (xs + 1));
      const y = Math.floor(Math.random() * (ys + 1));
      if (this.perm[x]![y]!.value !== PRODUCER) continue;
      const p = this.perm[x]![y]!;
      if (p.extra1 !== NOWT && this.move[x]![y]!.value === NOWT) {
        this.move[x]![y] = { value: p.extra1, extra1: p.extra2, extra2: p.extra3, extra3: NOWT };
      } else {
        this.makeThingFromSwitch(p.extra2, x, y, p.extra3 === 0);
      }
      break;
    }

    // View follows.
    for (let s = 0; s < this.numPlayers; s++) {
      if (this.blnView[s]) {
        this.viewX[s] = this.smileX[s]!;
        this.viewY[s] = this.smileY[s]!;
      }
    }

    // Counters.
    this.wIndex++;
    if (this.wIndex > WATERFRAMES * 5) this.wIndex = 0;
    this.nIndex++;
    if (this.nIndex > 3) this.nIndex = 0;
    if (this.zapIndex % 12 === 0) this.cindex[0] = this.cindex[1]! + 1;
    if (this.zapIndex % 6 === 0) this.cindex[1]!++;
    if (this.zapIndex % 3 === 0) this.cindex[2]!++;
    for (let i = 0; i < 3; i++) if (this.cindex[i]! > 3) this.cindex[i] = 0;
    this.zapIndex++;
    if (this.zapIndex > 24) this.zapIndex = 1;

    // Finish: ANY permanent with Extra1 == 6 under a smile.
    for (let s = 0; s < this.numPlayers; s++) {
      if (this.dead[s]) continue;
      const sx = this.smileX[s]!;
      const sy = this.smileY[s]!;
      if (!this.inBounds(sx, sy)) continue;
      if (this.perm[sx]![sy]!.extra1 === 6) {
        this.finishLevel();
        break;
      }
    }
    this.fpsCount++;
  }

  get waterFrame(): number {
    return Math.floor(this.wIndex / 5) % 4;
  }

  /** Convey animation frame for a speed value (Extra2 with +10 cooldowns). */
  conveyFrame(speed: number): number {
    let c = speed;
    while (c > 9) c -= 10;
    return this.cindex[c] ?? 0;
  }

  // ---------- movement core (MoveObjectCheck port) ----------

  moveObjectCheck(x: number, y: number, objType: number, dir: Direction): boolean {
    if (this.moveDepth > 64) return false;
    this.moveDepth++;
    try {
      return this.moveObjectCheckInner(x, y, objType, dir);
    } finally {
      this.moveDepth--;
    }
  }

  private moveObjectCheckInner(x: number, y: number, objType: number, dir: Direction): boolean {
    let newx = x;
    let newy = y;
    const oldx = x;
    const oldy = y;
    switch (dir) {
      case dUP:
      case dBUP:
        newy--;
        if (newy < 0) return false;
        break;
      case dDOWN:
      case dFALL:
        newy++;
        if (newy > this.ysize) return false;
        break;
      case dLEFT:
        newx--;
        if (newx < 0) return false;
        break;
      case dRIGHT:
        newx++;
        if (newx > this.xsize) return false;
        break;
      default:
        return false;
    }

    // Suction wood holds from below.
    if (dir === dUP || dir === dBUP) {
      if (oldy < this.ysize) {
        const below = this.move[oldx]![oldy + 1]!;
        if (below.value === WOOD && below.extra1 === 2) return false;
      }
    }

    const intSmileNum = objType === SMILE ? this.move[oldx]![oldy]!.extra1 : 0;
    let ok = true;
    switch (objType) {
      case WOOD:
      case WATER:
      case NITRO:
      case RADAR:
      case MINCE:
        if (objType === NITRO && this.move[oldx]![oldy]!.extra1 === 3) {
          if (this.perm[oldx]![oldy]!.value === CONVEY && this.move[newx]![newy]!.value === NOWT) {
            ok = true;
          }
        } else if (objType === RADAR && !isEven(this.move[oldx]![oldy]!.extra1)) {
          // moveable radars pass the gate
        }
        break;
      case NOWT:
        ok = false;
        break;
      case EXPLODE:
        if (this.move[oldx]![oldy]!.extra2 === exSNitro || this.move[oldx]![oldy]!.extra2 === exBNitro) {
          ok = false;
        }
        break;
      case DYNO:
      case PANEL:
      case TNT:
      case GLASS:
      case WEIGHT:
      case BALLOON:
        ok = true;
        break;
      case SMILE:
        if (dir === dUP && this.perm[oldx]![oldy]!.value === ROPE) ok = false;
        break;
      default:
        ok = false;
    }
    if (!ok) return false;

    // Leaving-conveyor rule.
    if (this.perm[oldx]![oldy]!.value === CONVEY) {
      if (dir !== this.perm[oldx]![oldy]!.extra1) {
        if (objType === SMILE && dir !== dFALL) {
          if (this.perm[oldx]![oldy]!.extra3 === 1) {
            this.perm[oldx]![oldy]!.extra1 = dir;
          } else {
            return false;
          }
        } else {
          return false;
        }
      }
    }

    if (this.perm[newx]![newy]!.value !== NOWT) {
      ok = this.moveCheck1(newx, newy, oldx, oldy, objType, dir);
    }
    if (!ok) {
      if (this.perm[newx]![newy]!.value === BRICK) {
        // fall through to collectable (VB GoTo collectable)
      } else {
        return false;
      }
    }

    if (this.move[newx]![newy]!.value !== NOWT && ok) {
      ok = this.moveCheck2(newx, newy, oldx, oldy, objType, dir);
    }

    if (!ok) {
      if (this.perm[newx]![newy]!.value === WARP) this.perm[newx]![newy]!.extra2 = 0;
      // Swapper-panel fallback: trade places instead of pushing.
      if (objType === PANEL && this.move[oldx]![oldy]!.extra1 === 1) {
        if (!(this.move[newx]![newy]!.value === PANEL && this.move[newx]![newy]!.extra1 === 1)) {
          const m = this.move[oldx]![oldy]!.value;
          const n = this.move[oldx]![oldy]!.extra1;
          const o = this.move[oldx]![oldy]!.extra2;
          const p = this.move[oldx]![oldy]!.extra3;
          this.move[oldx]![oldy]!.value = this.move[newx]![newy]!.value;
          this.move[oldx]![oldy]!.extra1 = this.move[newx]![newy]!.extra1;
          this.move[oldx]![oldy]!.extra2 = this.move[newx]![newy]!.extra2;
          this.move[oldx]![oldy]!.extra3 = this.move[newx]![newy]!.extra3;
          this.move[newx]![newy]!.value = m;
          this.move[newx]![newy]!.extra1 = n;
          this.move[newx]![newy]!.extra2 = o;
          this.move[newx]![newy]!.extra3 = p;
          if (this.move[oldx]![oldy]!.value === SMILE) {
            if (this.smileX[intSmileNum] === newx && this.smileY[intSmileNum] === newy) {
              this.smileX[intSmileNum] = oldx;
              this.smileY[intSmileNum] = oldy;
            }
          }
        }
      }
      return false;
    }

    if (objType === SMILE && this.coll[newx]![newy]!.value !== NOWT) {
      ok = this.moveCheck3(newx, newy, objType, dir, ok, intSmileNum);
    }
    if (!ok) {
      if (this.perm[newx]![newy]!.value === WARP) this.perm[newx]![newy]!.extra2 = 0;
      return false;
    }

    if (this.move[oldx]![oldy]!.value === SMILE) {
      if (this.smileX[intSmileNum] === oldx && this.smileY[intSmileNum] === oldy) {
        this.smileX[intSmileNum] = newx;
        this.smileY[intSmileNum] = newy;
      }
    }

    this.move[newx]![newy]!.value = this.move[oldx]![oldy]!.value;
    this.move[newx]![newy]!.extra1 = this.move[oldx]![oldy]!.extra1;
    this.move[newx]![newy]!.extra2 = this.move[oldx]![oldy]!.extra2;
    this.move[newx]![newy]!.extra3 = this.move[oldx]![oldy]!.extra3;
    this.move[oldx]![oldy] = blank();

    if (this.move[newx]![newy]!.value === SMILE) {
      for (let p = 0; p < 51; p++) {
        const pp = this.popups[p];
        if (pp && pp.x === oldx && pp.y === oldy && pp.s !== "") {
          this.events.popup(pp.s);
          if (pp.d) pp.s = "";
        }
      }
      const nm = this.move[newx]![newy]!;
      if (nm.extra2 === 1) nm.extra2 = 2;
      else if (nm.extra2 === 2) {
        nm.extra2 = 0;
        this.move[oldx]![oldy]!.value = WATER;
      } else if (nm.extra2 === 3) {
        nm.extra2 = 2;
        this.move[oldx]![oldy]!.value = WATER;
      }
    } else if (this.move[newx]![newy]!.value === RADAR) {
      const nm = this.move[newx]![newy]!;
      if (nm.extra1 === 2 || nm.extra1 === 3) {
        if (this.radarPoint(newx, newy)) nm.extra1 -= 2;
      }
    }
    this.events.hudChanged();
    return true;
  }

  private moveCheck1(newx: number, newy: number, oldx: number, oldy: number, objType: number, dir: Direction): boolean {
    const intSmileNum = objType === SMILE ? this.move[oldx]![oldy]!.extra1 : 0;
    const target = this.perm[newx]![newy]!;
    switch (target.value) {
      case BRICK:
        return false;
      case WARP:
        target.extra2 = dir;
        if (this.move[oldx]![oldy]!.value === NITRO && this.move[oldx]![oldy]!.extra1 !== 3) {
          return false; // VB GoTo skip with default False
        }
        return true;
      case DOOR: {
        const open = target.extra2 !== 0;
        if (objType === SMILE) {
          if (!open) {
            if (this.getKey(target.extra1, intSmileNum)) {
              target.extra2 = 1;
              return true;
            }
            return false;
          }
          if (target.extra3 === 0 && target.extra1 !== 6) {
            this.collectKey(target.extra1, intSmileNum);
            target.extra2 = 0;
          }
          return true;
        }
        return open;
      }
      case CONVEY: {
        if (
          this.move[newx]![newy]!.value === NOWT &&
          this.perm[oldx]![oldy]!.value === CONVEY &&
          dir !== dFALL &&
          dir !== dBUP
        ) {
          let d = 0;
          if (target.extra3 === 2) d = dir;
          else if (target.extra3 === 3) {
            d = dir + 1;
            if (d === 5) d = 1;
          } else if (target.extra3 === 4) {
            d = dir - 1;
            if (d === 0) d = 4;
          }
          if (d !== 0) target.extra1 = d;
        }
        return true;
      }
      case TOLL: {
        if (objType === SMILE && dir !== dFALL && dir !== dBUP) {
          if (target.extra1 < 5) {
            const pay = tollPrice(target.extra1);
            if (this.score[intSmileNum]! < pay) return false;
            this.pendingToll = { x: newx, y: newy, s: intSmileNum, dir };
            this.events.toll(pay);
            return false;
          }
          // Sublevel gate.
          this.blnInSub = true;
          this.intSubX = newx;
          this.intSubY = newy;
          this.events.openSub(this.subpaths[target.extra2] ?? "", intSmileNum);
          return false;
        }
        return objType !== SMILE;
      }
      case ROPE:
        if (objType === SMILE && target.extra1 === 1) {
          if (!this.useEnergy(intSmileNum, PANEL, dUP)) {
            target.extra1 = NOWT;
            target.value = NOWT;
          }
        }
        return true;
      default:
        // LADDER, PRODUCER and anything else: passable.
        return true;
    }
  }

  private moveCheck2(newx: number, newy: number, oldx: number, oldy: number, objType: number, dir: Direction): boolean {
    const intSmileNum = objType === SMILE ? this.move[oldx]![oldy]!.extra1 : 0;
    const target = this.move[newx]![newy]!;
    switch (target.value) {
      case WOOD:
        if (objType === SMILE && target.extra1 === 1 && this.useEnergy(intSmileNum, TNT, dir)) {
          target.value = NOWT;
          target.extra1 = NOWT;
        }
        return false;
      case WATER: {
        if (objType === SMILE && this.waterSafe[intSmileNum]) {
          const o = this.move[oldx]![oldy]!;
          if (o.extra2 === 0) o.extra2 = 1;
          else if (o.extra2 === 2) o.extra2 = 3;
        } else {
          const o = this.move[oldx]![oldy]!;
          o.value = WATER;
          o.extra2 = NOWT;
          o.extra3 = NOWT;
        }
        if (objType === PANEL) this.move[oldx]![oldy] = blank();
        this.move[oldx]![oldy]!.extra1 = NOWT;
        this.events.sound("splash", false);
        return true;
      }
      case DYNO: {
        if (objType === NITRO) return false;
        if (objType === SMILE && !this.useEnergy(intSmileNum, DYNO, dir)) return false;
        const pushed = this.moveObjectCheck(newx, newy, DYNO, dir);
        if (objType === SMILE && !pushed) {
          if (this.shields[intSmileNum] === 0) {
            this.move[oldx]![oldy] = blank();
          } else {
            this.loseShield(intSmileNum);
          }
          this.move[newx]![newy]!.extra1 = exDyno;
        }
        return pushed;
      }
      case TNT: {
        if (objType === NITRO) return false;
        if (objType === SMILE) {
          const t = target.extra1 === 0 ? TNT : PANEL;
          if (!this.useEnergy(intSmileNum, t, dir)) return false;
        }
        const pushed = this.moveObjectCheck(newx, newy, TNT, dir);
        if (!pushed) {
          const bySmile = objType === SMILE;
          const byWeight = objType === WEIGHT;
          const byBalloon = objType === BALLOON;
          const byPanel0 = objType === PANEL && this.move[oldx]![oldy]!.extra1 === 0;
          if ((bySmile || byWeight || byBalloon || byPanel0) && target.extra1 === 0) {
            target.extra1 = 1;
          }
        }
        return pushed;
      }
      case PANEL:
      case EXPLODE:
      case WEIGHT:
      case BALLOON: {
        if (objType === NITRO) return false;
        if (objType === SMILE && !this.useEnergy(intSmileNum, target.value, dir)) return false;
        if (target.value === EXPLODE) {
          if (objType === EXPLODE || objType === SMILE) {
            return this.moveObjectCheck(newx, newy, target.value, dir);
          }
          return false;
        }
        if (target.value === BALLOON) {
          if (dir === dFALL) {
            if (objType === GLASS && this.move[oldx]![oldy]!.extra1 === 1) return true;
            return false;
          }
          return this.moveObjectCheck(newx, newy, target.value, dir);
        }
        if (target.value === PANEL && target.extra1 === 2) {
          if (dir === dFALL) return false;
          return this.moveObjectCheck(newx, newy, target.value, dir);
        }
        return this.moveObjectCheck(newx, newy, target.value, dir);
      }
      case SMILE: {
        if (objType === GLASS && this.move[oldx]![oldy]!.extra1 === 1) return true;
        if (objType === WEIGHT && dir === dDOWN) {
          return this.moveObjectCheck(newx, newy, SMILE, dir);
        }
        if (dir === dBUP) {
          return this.moveObjectCheck(newx, newy, SMILE, dir);
        }
        if (objType === SMILE && this.useEnergy(intSmileNum, SMILE, dir)) {
          if (intSmileNum === 0) {
            if (this.energy[0]! >= this.energy[1]!) {
              return this.moveObjectCheck(newx, newy, SMILE, dir);
            }
          } else if (this.energy[1]! >= this.energy[0]!) {
            return this.moveObjectCheck(newx, newy, SMILE, dir);
          }
        }
        return false;
      }
      case NITRO: {
        if (objType === SMILE && (target.extra1 !== 4 || !isEven(target.extra2))) {
          if (!this.useEnergy(intSmileNum, NITRO, dir) && target.extra1 !== 0 && target.extra1 !== 2) {
            return false;
          }
        }
        const oldval = target.extra1;
        if (target.extra1 === 3) {
          if (objType === SMILE || objType === BALLOON) {
            if (this.moveObjectCheck(newx, newy, NITRO, dir)) return true;
          }
          if (objType === NITRO && dir === dFALL) return false; // VB skipbang
        }
        if (!(target.extra1 === 3 && (objType === NITRO && dir === dFALL))) {
          let cause = 0;
          let blew = true;
          switch (oldval) {
            case 0:
            case 2:
              cause = exBNitro;
              break;
            case 1:
              if (target.extra2 > 2) {
                this.makeThingFromSwitch(target.extra2, newx, newy);
                const t2 = this.move[newx]![newy]!;
                if (t2.value !== NITRO || t2.extra1 !== 1) {
                  this.events.sound("nitro", false);
                  this.spreadExplode(newx, newy, exSNitro);
                  return false;
                }
              }
              cause = exSNitro;
              break;
            case 3:
              if (objType === PANEL && this.move[oldx]![oldy]!.extra1 === 1) return false;
              if (target.extra2 > 2) {
                this.makeThingFromSwitch(target.extra2, newx, newy);
                const t2 = this.move[newx]![newy]!;
                if (t2.value !== NITRO || t2.extra1 !== 3) {
                  this.events.sound("nitro", false);
                  this.spreadExplode(newx, newy, exPNitro);
                  return false;
                }
              }
              cause = exPNitro;
              break;
            case 4:
              if (!isEven(target.extra2)) {
                target.extra2--;
                if (target.extra3 === 1 && target.extra2 > 0) target.extra2--;
              }
              return false;
            default:
              blew = false;
              break;
          }
          if (blew) {
            target.extra2 = cause;
            target.extra1 = NOWT;
            target.value = EXPLODE;
            if (objType === SMILE && cause === exBNitro) {
              if (this.shields[intSmileNum] === 0) {
                this.move[oldx]![oldy] = { value: EXPLODE, extra1: NOWT, extra2: exSmile, extra3: NOWT };
              } else {
                this.loseShield(intSmileNum);
              }
            }
          }
        }
        return false;
      }
      case GLASS: {
        if (objType === NITRO) return false;
        if (objType === SMILE && target.extra1 === 0 && !this.useEnergy(intSmileNum, GLASS, dir)) {
          return false;
        }
        if (target.extra1 === 0) {
          const pushed = this.moveObjectCheck(newx, newy, GLASS, dir);
          if (!pushed) {
            target.extra1 = 1;
            this.events.sound("glass", false);
          }
          return pushed;
        }
        if (objType === SMILE || objType === BALLOON) this.move[oldx]![oldy] = blank();
        return false;
      }
      case RADAR: {
        if (objType === NITRO) return false;
        if (objType === SMILE && !this.useEnergy(intSmileNum, RADAR, dir)) return false;
        if (target.extra1 === 1 || target.extra1 === 3 || target.extra1 === 5) {
          return this.moveObjectCheck(newx, newy, RADAR, dir);
        }
        return false;
      }
      case MINCE: {
        if (target.extra1 === 1) {
          if (objType === NITRO && this.move[oldx]![oldy]!.extra1 === 3) {
            target.value = EXPLODE;
            target.extra1 = NOWT;
            target.extra2 = exSNitro;
            target.extra3 = NOWT;
            return false;
          }
          if (objType === BALLOON && this.move[oldx]![oldy]!.extra1 === 2) {
            target.value = EXPLODE;
            target.extra1 = NOWT;
            target.extra2 = exBNitro;
            target.extra3 = NOWT;
            return false;
          }
          this.move[oldx]![oldy] = blank();
          if (target.extra2 > 0) {
            target.extra2--;
            if (target.extra2 === 0) this.move[newx]![newy] = blank();
          }
        }
        return false;
      }
      default:
        return false;
    }
  }

  private moveCheck3(newx: number, newy: number, _objType: number, _dir: Direction, start: boolean, s: number): boolean {
    const c = this.coll[newx]![newy]!;
    switch (c.value) {
      case MONEY:
        if (c.extra1 !== 10) this.score[s]! += MONEY_VALUES[c.extra1] ?? 0;
        else this.score[s] = Math.floor(this.score[s]! * 0.9);
        c.value = NOWT;
        c.extra1 = NOWT;
        this.events.sound("cash", false);
        break;
      case KEY:
        this.collectKey(c.extra1, s);
        c.value = NOWT;
        c.extra1 = NOWT;
        break;
      case ENERGY:
        switch (c.extra1) {
          case 0:
            this.energy[s]! += 1;
            this.events.sound("powerup", false);
            break;
          case 1:
            this.energy[s]! += 2;
            this.events.sound("powerup", false);
            break;
          case 2:
            this.energy[s]! += 5;
            this.events.sound("powerup", false);
            break;
          case 3:
            this.energy[s]! += 10;
            this.events.sound("powerup", false);
            break;
          case 4:
            this.lives[s]! += 1;
            this.events.sound("powerup", false);
            break;
          case 5:
            this.events.sound("powerdown", false);
            if (this.energy[s] !== 0) this.energy[s] = 0;
            else if (this.lives[s] === 1) {
              this.killSmile(s);
              return false;
            } else this.lives[s]!--;
            break;
          case 6:
            this.waterSafe[s] = !this.waterSafe[s];
            return start;
          case 7:
            this.waterSafe[s] = false;
            return start;
          case 8:
            this.shields[s]! += 1;
            this.events.sound("shieldPlus", false);
            break;
          case 9:
            this.shields[s]! += 5;
            this.events.sound("shieldPlus", false);
            break;
        }
        c.value = NOWT;
        c.extra1 = NOWT;
        break;
      case SWITCH:
        this.doSwitch(newx, newy);
        break;
    }
    this.events.hudChanged();
    return start;
  }

  // ---------- explosions ----------

  spreadExplode(x: number, y: number, value: number): void {
    for (let d = dUP; d <= dRIGHT; d++) {
      let rx = x;
      let ry = y;
      if (d === dUP) ry--;
      else if (d === dDOWN) ry++;
      else if (d === dLEFT) rx--;
      else rx++;
      if (!this.inBounds(rx, ry)) continue;
      let push = false;
      let blow = false;
      const t = this.move[rx]![ry]!;
      switch (t.value) {
        case DYNO:
          if (value === exBalloon) continue;
          blow = true;
          break;
        case TNT:
        case RADAR:
          if (value === exBalloon) continue;
          blow = true;
          break;
        case WOOD:
          if (value === exDyno || value === exSNitro || value === exBNitro || value === exPNitro) blow = true;
          break;
        case PANEL:
        case WEIGHT:
          if (value === exDyno || value === exSNitro || value === exPNitro) push = true;
          else if (value === exBNitro) blow = true;
          break;
        case BALLOON:
          if (value === exDyno || value === exSNitro || value === exPNitro) push = true;
          else if (value === exBNitro || value === exBalloon || value === exBalloonx) blow = true;
          break;
        case SMILE:
          if (value === exDyno || value === exSNitro || value === exPNitro) push = true;
          else if (value === exBNitro) blow = true;
          break;
        case NITRO:
          if (value === exBalloon) continue;
          blow = true;
          break;
        case WATER:
        case MINCE:
          blow = value === exBNitro;
          break;
        case GLASS:
          if (t.extra1 === 0) {
            if (value === exSmile || value === exTNT || value === exDyno) blow = true;
            else if (value === exBNitro) {
              t.value = EXPLODE;
              t.extra2 = NOWT;
            } else if (value === exSNitro || value === exPNitro) {
              blow = true;
              push = true;
            }
          } else if (value === exBNitro || value === exSNitro || value === exPNitro) {
            t.value = EXPLODE;
            t.extra1 = NOWT;
            t.extra2 = NOWT;
          }
          break;
      }
      if (blow) {
        const b = this.move[rx]![ry]!;
        switch (b.value) {
          case WOOD:
          case PANEL:
          case WATER:
          case WEIGHT:
          case MINCE:
            b.value = EXPLODE;
            b.extra1 = NOWT;
            b.extra2 = NOWT;
            break;
          case SMILE:
            if (this.shields[b.extra1] === 0) {
              b.value = EXPLODE;
              b.extra1 = NOWT;
              b.extra2 = NOWT;
            } else {
              this.shields[b.extra1]!--;
              if (this.shields[b.extra1] === 0) this.events.sound("shieldMinus", false);
              this.events.hudChanged();
            }
            break;
          case BALLOON:
            if (b.extra1 === 2) b.extra2 = exBNitro;
            else if (b.extra1 !== 0) b.extra2 = exBalloonx;
            else b.extra2 = exBalloon;
            b.value = EXPLODE;
            b.extra1 = NOWT;
            break;
          case TNT:
          case DYNO:
            b.extra1 = 1;
            break;
          case RADAR:
            b.value = EXPLODE;
            b.extra1 = NOWT;
            b.extra2 = exTNT;
            break;
          case NITRO:
            if (b.extra1 === 1) {
              if (b.extra2 > 2) {
                this.makeThingFromSwitch(b.extra2, rx, ry);
                const b2 = this.move[rx]![ry]!;
                if (b2.value !== NITRO || b2.extra1 !== 1) {
                  this.events.sound("nitro", false);
                  this.spreadExplode(rx, ry, exSNitro);
                  continue;
                }
              }
              b.extra2 = exSNitro;
            } else if (b.extra1 === 3) {
              if (b.extra2 > 2) {
                this.makeThingFromSwitch(b.extra2, rx, ry);
                const b2 = this.move[rx]![ry]!;
                if (b2.value !== NITRO || b2.extra1 !== 3) {
                  this.events.sound("nitro", false);
                  this.spreadExplode(rx, ry, exPNitro);
                  continue;
                }
              }
              b.extra2 = exPNitro;
            } else if (b.extra1 === 4) {
              if (!isEven(b.extra2)) b.extra2--;
              continue;
            } else {
              b.extra2 = exBNitro;
            }
            b.value = EXPLODE;
            b.extra1 = NOWT;
            break;
          case GLASS:
            b.extra1 = 1;
            this.events.sound("glass", false);
            break;
        }
      }
      if (push) this.moveObjectCheck(rx, ry, this.move[rx]![ry]!.value, d as Direction);
    }
  }

  private moveThing(x: number, y: number): void {
    const dir = this.perm[x]![y]!.extra2 as Direction;
    const movType = this.move[x]![y]!.value;
    if (this.perm[x]![y]!.value !== WARP) return; // only warps remain active
    let putWater = false;
    if (movType === SMILE && this.move[x]![y]!.extra2 === 2) {
      putWater = true;
      this.move[x]![y]!.extra2 = 0;
    }
    this.warpThing(x, y, this.perm[x]![y]!.extra1, this.perm[x]![y]!.extra3);
    if (putWater) this.move[x]![y]!.value = WATER;
    this.moveObjectCheck(this.perm[x]![y]!.extra1, this.perm[x]![y]!.extra3, movType, dir);
  }

  private warpThing(x: number, y: number, newx: number, newy: number): void {
    if (!this.inBounds(newx, newy)) return;
    this.move[newx]![newy]!.value = this.move[x]![y]!.value;
    this.move[newx]![newy]!.extra1 = this.move[x]![y]!.extra1;
    this.move[newx]![newy]!.extra2 = this.move[x]![y]!.extra2;
    this.move[newx]![newy]!.extra3 = this.move[x]![y]!.extra3;
    if (this.move[newx]![newy]!.value === SMILE) {
      this.smileX[this.move[newx]![newy]!.extra1] = newx;
      this.smileY[this.move[newx]![newy]!.extra1] = newy;
    }
    this.move[x]![y] = blank();
    this.perm[x]![y]!.extra2 = NOWT;
    this.events.sound("warp", false);
  }

  private zap1Nitro(x: number, y: number): boolean {
    let hit = false;
    for (let d = dUP; d <= dRIGHT; d++) {
      let x1 = x;
      let y1 = y;
      let x2 = x;
      let y2 = y;
      if (d === dUP) {
        y1--;
        y2 -= 2;
      } else if (d === dDOWN) {
        y1++;
        y2 += 2;
      } else if (d === dLEFT) {
        x1--;
        x2 -= 2;
      } else {
        x1++;
        x2 += 2;
      }
      if (!this.inBounds(x1, y1) || !this.inBounds(x2, y2)) continue;
      const far = this.move[x2]![y2]!;
      if (
        (far.value !== NITRO && !(far.value === BALLOON && far.extra1 === 2)) ||
        this.perm[x1]![y1]!.value === BRICK
      ) {
        continue;
      }
      hit = true;
      const mid = this.move[x1]![y1]!;
      let stop = false;
      switch (mid.value) {
        case NOWT:
          if (this.move[x]![y]!.extra2 === 1 || this.move[x]![y]!.extra2 === 3) stop = true;
          break;
        case SMILE:
          if (this.shields[mid.extra1] === 0) {
            mid.extra2 = exSmile;
          } else {
            this.shields[mid.extra1]!--;
            if (this.shields[mid.extra1] === 0) this.events.sound("shieldMinus", false);
            this.events.hudChanged();
            stop = true;
          }
          break;
        case PANEL:
        case WOOD:
        case WATER:
        case GLASS:
        case WEIGHT:
        case MINCE:
          mid.extra2 = exNotmuch;
          break;
        case BALLOON:
          if (mid.extra1 === 2) mid.extra2 = exBNitro;
          else if (mid.extra1 !== 0) mid.extra2 = exBalloonx;
          else mid.extra2 = exBalloon;
          break;
        case TNT:
          mid.extra2 = exTNT;
          break;
        case DYNO:
          mid.extra2 = exDyno;
          break;
        case NITRO:
          if (mid.extra1 !== 4) {
            if (mid.extra1 === 0) {
              mid.extra2 = exBNitro;
            } else if (mid.extra1 === 2) {
              if (this.move[x]![y]!.extra2 === 2 || this.move[x]![y]!.extra2 === 3) stop = true;
              else mid.extra2 = exBNitro;
            } else {
              if (mid.extra2 > 2) this.makeThingFromSwitch(mid.extra2, x1, y1);
              mid.extra2 = mid.extra1 === 1 ? exSNitro : exPNitro;
            }
          } else {
            if (!isEven(mid.extra2)) {
              mid.extra2--;
              if (mid.extra3 === 1) mid.extra2--;
            }
            stop = true;
          }
          break;
      }
      if (stop) continue;
      mid.extra1 = 0;
      mid.value = EXPLODE;
    }
    return hit;
  }

  private radarPoint(x: number, y: number): boolean {
    const dir = this.move[x]![y]!.extra2;
    const scan = (nx: number, ny: number): boolean | null => {
      const v = this.move[nx]![ny]!.value;
      if (v === RADAR) return true;
      if (v === BALLOON) return this.move[nx]![ny]!.extra1 === 3;
      if (v !== NOWT) return false;
      return null;
    };
    if (dir === dUP) {
      for (let my = y - 1; my >= 0; my--) {
        const r = scan(x, my);
        if (r !== null) return r;
      }
    } else if (dir === dLEFT) {
      for (let mx = x - 1; mx >= 0; mx--) {
        const r = scan(mx, y);
        if (r !== null) return r;
      }
    } else if (dir === dDOWN) {
      for (let my = y + 1; my <= this.ysize; my++) {
        const r = scan(x, my);
        if (r !== null) return r;
      }
    } else if (dir === dRIGHT) {
      for (let mx = x + 1; mx <= this.xsize; mx++) {
        const r = scan(mx, y);
        if (r !== null) return r;
      }
    }
    return false;
  }

  canFall(x: number, y: number): boolean {
    const Ma = this.at(this.move, x, y).value;
    const Mb = this.at(this.move, x, y + 1).value;
    const Pa = this.at(this.perm, x, y);
    const Pb = this.at(this.perm, x, y + 1);
    let fall = true;
    if (Pa.value === LADDER) {
      if (Pa.extra1 === 1) fall = false;
      else if (Ma === SMILE) fall = false;
    } else if (Pa.value === ROPE) {
      if (Ma === SMILE) fall = false;
    } else if (Pa.value === WARP) {
      fall = false;
    }
    if (Pb.value === BRICK) fall = false;
    else if (Pb.value === DOOR) {
      if (Pb.extra2 === 0) fall = false;
    } else if (Pb.value === LADDER) {
      if (Pb.extra1 === 1) {
        fall = Ma === WEIGHT;
      } else if (Ma === SMILE) {
        fall = false;
      }
    } else if (Pb.value === TOLL) {
      fall = false;
    }
    if (Mb === WOOD || Mb === EXPLODE) fall = false;
    else if (Mb === SMILE) {
      if (Ma !== WEIGHT && Ma !== GLASS) fall = false;
    } else if (Mb === RADAR) {
      if (!isEven(this.at(this.move, x, y).extra1)) fall = false;
    }
    if (Ma === PANEL && this.at(this.move, x, y).extra1 === 2) fall = false;
    return fall;
  }

  private doConvey(x: number, y: number): void {
    const d = this.perm[x]![y]!.extra1;
    let nx = x;
    let ny = y;
    if (d === dUP) ny--;
    else if (d === dDOWN) ny++;
    else if (d === dLEFT) nx--;
    else if (d === dRIGHT) nx++;
    else return;
    if (!this.inBounds(nx, ny)) return;
    if (this.perm[nx]![ny]!.value === CONVEY) {
      if (this.isMove(this.move[nx]![ny]!.value, nx, ny)) return;
    }
    if (this.moveObjectCheck(x, y, this.move[x]![y]!.value, d as Direction) || this.move[x]![y]!.value === NITRO) {
      if ((d === dRIGHT || d === dDOWN) && this.perm[nx]![ny]!.value === CONVEY) {
        this.perm[nx]![ny]!.extra2 += 10;
      }
    }
  }

  private isMove(v: number, x: number, y: number): boolean {
    switch (v) {
      case WOOD:
      case WATER:
      case NITRO:
      case RADAR:
      case MINCE:
        if (v === NITRO && this.move[x]![y]!.extra1 === 3) break;
        else if (v === RADAR && !isEven(this.move[x]![y]!.extra1)) break;
        else return false;
        break;
      case NOWT:
        return false;
      case EXPLODE:
        if (this.move[x]![y]!.extra2 === exSNitro || this.move[x]![y]!.extra2 === exBNitro) return false;
        break;
      case DYNO:
      case PANEL:
      case TNT:
      case GLASS:
      case WEIGHT:
      case SMILE:
      case BALLOON:
        break;
      default:
        return false;
    }
    return true;
  }

  private minceCheck(x: number, y: number): void {
    for (let d = dUP; d <= dRIGHT; d++) {
      let rx = x;
      let ry = y;
      if (d === dUP) ry--;
      else if (d === dDOWN) ry++;
      else if (d === dLEFT) rx--;
      else rx++;
      if (!this.inBounds(rx, ry)) continue;
      const n = this.move[rx]![ry]!;
      if (n.value === NITRO) {
        if (this.move[x]![y]!.extra3 === 0) {
          this.move[x]![y]!.extra1 = 1;
          return;
        }
      } else if (n.value === MINCE) {
        if (n.extra1 === 1) {
          this.move[x]![y]!.extra1 = 1;
          return;
        }
      } else if (n.value === BALLOON) {
        if (n.extra1 === 2) {
          this.move[x]![y]!.extra1 = 1;
          return;
        }
      }
    }
  }

  private checkMince(x: number, y: number): void {
    if (this.minceDepth > 256) return;
    if (this.move[x]![y]!.extra1 === 0) return;
    this.minceDepth++;
    try {
      for (let d = dUP; d <= dRIGHT; d++) {
        let rx = x;
        let ry = y;
        if (d === dUP) ry--;
        else if (d === dDOWN) ry++;
        else if (d === dLEFT) rx--;
        else rx++;
        if (!this.inBounds(rx, ry)) continue;
        if (this.move[rx]![ry]!.value === MINCE && this.move[rx]![ry]!.extra1 === 0) {
          this.move[rx]![ry]!.extra1 = 1;
          this.checkMince(rx, ry);
        }
      }
    } finally {
      this.minceDepth--;
    }
  }

  // ---------- switches / keys / energy / shields ----------

  private doSwitch(x: number, y: number): void {
    const n0 = this.coll[x]![y]!.extra2;
    const n1 = this.coll[x]![y]!.extra3;
    this.makeThingFromSwitch(n0, x, y);
    this.makeThingFromSwitch(n1, x, y);
  }

  makeThingFromSwitch(n: number, sx: number, sy: number, dox = false): void {
    if (this.switchDepth > 16) return;
    this.switchDepth++;
    try {
      if (n >= 1 && n <= 49) {
        const sw = this.switches[n];
        if (!sw) return;
        let xp = sw.x;
        let yp = sw.y;
        if (xp === 50 && yp === 50) {
          xp = sx;
          yp = sy;
          const at = this.inBounds(xp, yp) ? this.move[xp]![yp]! : blank();
          if (at.value === BALLOON && at.extra1 === 2 && at.extra2 !== 0) dox = false;
          else if (at.value === NITRO && (at.extra1 === 3 || at.extra1 === 1) && at.extra3 !== 0) dox = false;
        }
        if (!this.inBounds(xp, yp)) return;
        if (sw.value === NOWT) {
          if (sw.extra3 === 0) this.placePerm(sw, xp, yp);
          else if (sw.extra3 === 1) this.placeColl(sw, xp, yp, dox);
          else if (sw.extra3 === 2) this.placeMove(sw, xp, yp, dox);
        } else if (sw.value >= BRICK && sw.value <= DOOR) {
          this.placePerm(sw, xp, yp);
        } else if (sw.value >= MONEY && sw.value <= SWITCH) {
          this.placeColl(sw, xp, yp, dox);
        } else if (sw.value >= WOOD && sw.value <= EXPLODE) {
          this.placeMove(sw, xp, yp, dox);
        }
      } else if (n === 0) {
        return;
      } else if (n === 50) {
        this.events.sound("allnitro", true);
        for (let x = 0; x <= this.xsize; x++)
          for (let y = 0; y <= this.ysize; y++) {
            const m = this.move[x]![y]!;
            if (m.value !== NITRO) continue;
            if ((m.extra2 > 2 && m.extra1 === 1) || m.extra1 === 3) {
              if (x === sx && y === sy) {
                // fall through to detonate below
              } else {
                const t = m.extra1;
                this.makeThingFromSwitch(m.extra2, x, y);
                const m2 = this.move[x]![y]!;
                if (m2.value !== NITRO || m2.extra1 !== t) {
                  this.events.sound("nitro", false);
                  this.spreadExplode(x, y, t === 1 ? exSNitro : exPNitro);
                  continue;
                }
              }
            }
            m.value = EXPLODE;
            if (m.extra1 === 1) m.extra2 = exSNitro;
            else if (m.extra1 === 3) m.extra2 = exPNitro;
            else m.extra2 = exBNitro;
            m.extra1 = NOWT;
          }
      } else if (n === 51) {
        if (!this.blnSub) {
          this.checkpoint = true;
          this.events.sound("check", true);
          this.takeCheckpointSnap();
        }
      }
      if (n < 51) {
        const nx = this.switches[n]?.next ?? 0;
        if (nx) this.makeThingFromSwitch(nx, sx, sy, dox);
      }
    } finally {
      this.switchDepth--;
    }
  }

  private placePerm(sw: SwitchData, xp: number, yp: number): void {
    if (sw.value === DOOR && (sw.extra1 === 0 || sw.extra1 > 6)) return;
    this.perm[xp]![yp] = { value: sw.value, extra1: sw.extra1, extra2: sw.extra2, extra3: sw.extra3 };
  }

  private placeColl(sw: SwitchData, xp: number, yp: number, dox: boolean): void {
    if (dox && this.coll[xp]![yp]!.value !== NOWT) return;
    if (sw.value === KEY && (sw.extra1 === 0 || sw.extra1 > 6)) return;
    if (sw.value === MONEY && (sw.extra1 < 0 || sw.extra1 > 10)) return;
    if (sw.value === ENERGY && (sw.extra1 < 0 || sw.extra1 > 9)) return;
    this.coll[xp]![yp] = { value: sw.value, extra1: sw.extra1, extra2: sw.extra2, extra3: sw.extra3 };
  }

  private placeMove(sw: SwitchData, xp: number, yp: number, dox: boolean): void {
    if (dox && this.move[xp]![yp]!.value !== NOWT) return;
    if (sw.value === SMILE && sw.extra1 >= 2) return;
    this.move[xp]![yp] = { value: sw.value, extra1: sw.extra1, extra2: sw.extra2, extra3: sw.extra3 };
  }

  private takeCheckpointSnap(): void {
    if (!this.currentParsed) return;
    const clone = (g: ThingData[][]) => g.map((col) => col.map((c) => ({ ...c })));
    this.checkpointSnap = {
      parsed: {
        xsize: this.xsize,
        ysize: this.ysize,
        levelId: this.levelId,
        players: this.numPlayers,
        perm: clone(this.perm),
        coll: clone(this.coll),
        move: clone(this.move),
        smileStarts: [{ x: this.smileX[0]!, y: this.smileY[0]! }, { x: this.smileX[1]!, y: this.smileY[1]! }],
        popups: this.popups.map((p) => ({ ...p })),
        switches: this.switches.map((s) => ({ ...s })),
        subpaths: [...this.subpaths],
        checkpointKeys: this.keys.map((k) => [...(k ?? [])]),
        checkpointEnergy: [...this.energy],
      },
      keys: this.keys.map((k) => [...(k ?? [])]),
      energy: [...this.energy],
    };
  }

  collectKey(col: number, s: number): void {
    if (!this.keys[col]) this.keys[col] = [false, false];
    this.keys[col]![s] = true;
    this.events.hudChanged();
  }

  getKey(col: number, s: number): boolean {
    const has = !!this.keys[col]?.[s];
    if (has) {
      this.keys[col]![s] = false;
      this.events.hudChanged();
    }
    return has;
  }

  useEnergy(s: number, objType: number, dir: Direction): boolean {
    if (dir === dFALL) {
      if (objType === PANEL || objType === WOOD || objType === WEIGHT || objType === RADAR || objType === EXPLODE || objType === BALLOON) {
        return true;
      }
    } else if (dir === dBUP) {
      return true;
    }
    if (this.energy[s] === 0) return false;
    this.energy[s]!--;
    if (this.energy[s] === 0) this.events.sound("powerdown", false);
    this.events.hudChanged();
    return true;
  }

  private loseShield(s: number): void {
    this.shields[s]!--;
    if (this.shields[s] === 0) this.events.sound("shieldMinus", false);
    this.events.hudChanged();
  }

  finishLevel(): void {
    if (this.blnSub) {
      const keys: boolean[][] = [];
      for (let k = 1; k <= 6; k++) keys[k] = [...(this.keys[k] ?? [false, false])];
      this.events.subComplete({
        success: true,
        score: this.score[this.subSmileNum] ?? 0,
        energy: this.energy[this.subSmileNum] ?? 0,
        keys,
      });
      return;
    }
    this.clearArrays();
    this.events.levelComplete();
  }

  killSmile(s: number): void {
    this.lives[s]!--;
    for (let k = 1; k <= 6; k++) {
      if (!this.keys[k]) this.keys[k] = [false, false];
      this.keys[k]![s] = false;
    }
    this.energy[s] = 0;
    this.score[s] = 0;
    this.shields[s] = 0;
    this.waterSafe[s] = false;
    this.clearArrays();
    if (s === 0 && this.numPlayers === 1) this.killSmile(1);
    if (this.lives[s]! < 1) {
      this.failLevel(s);
    }
    if (!this.blnSub) {
      if (this.checkpoint && this.checkpointSnap) {
        const snap = this.checkpointSnap;
        this.xsize = snap.parsed.xsize;
        this.ysize = snap.parsed.ysize;
        const clone = (g: ThingData[][]) => g.map((col) => col.map((c) => ({ ...c })));
        this.perm = clone(snap.parsed.perm);
        this.coll = clone(snap.parsed.coll);
        this.move = clone(snap.parsed.move);
        this.popups = snap.parsed.popups.map((p) => ({ ...p }));
        for (let k = 1; k <= 6; k++)
          for (let p = 0; p < 2; p++) this.keys[k]![p] = snap.keys[k]?.[p] ?? false;
        for (let p = 0; p < 2; p++) this.energy[p] = snap.energy[p] ?? 0;
        this.smileX[0] = snap.parsed.smileStarts[0]?.x ?? 0;
        this.smileY[0] = snap.parsed.smileStarts[0]?.y ?? 0;
        this.smileX[1] = snap.parsed.smileStarts[1]?.x ?? 0;
        this.smileY[1] = snap.parsed.smileStarts[1]?.y ?? 0;
        for (let p = 0; p < this.numPlayers; p++) {
          this.viewX[p] = this.smileX[p]!;
          this.viewY[p] = this.smileY[p]!;
        }
      } else if (this.currentParsed) {
        const keepLives = [...this.lives];
        const keepDead = [...this.dead];
        const keepScore = [...this.score];
        this.loadParsed(this.currentParsed, this.currentLevelName, false);
        this.lives = keepLives;
        this.dead = keepDead;
        this.score = keepScore;
      }
    }
    this.events.hudChanged();
  }

  private failLevel(s: number): void {
    if (this.blnSub) {
      this.events.subComplete({ success: false, score: 0, energy: 0, keys: [] });
      return;
    }
    this.dead[s] = true;
    let anyAlive = false;
    for (let p = 0; p < this.numPlayers; p++) {
      if (!this.dead[p]) anyAlive = true;
    }
    if (!anyAlive) this.events.levelFailed();
  }

  /** Right-click inspect text (PB_MouseDown right-button port). */
  inspect(x: number, y: number): string {
    if (!this.inBounds(x, y)) return "";
    const p = this.perm[x]![y]!;
    const c = this.coll[x]![y]!;
    const m = this.move[x]![y]!;
    let pn: string;
    switch (p.value) {
      case NOWT: pn = "Nothing"; break;
      case BRICK: pn = "Brick"; break;
      case WARP: pn = "Warp"; break;
      case DOOR: pn = "Door"; break;
      case LADDER: pn = p.extra1 === 0 ? "Ladder" : "Brick Ladder"; break;
      case ROPE: pn = "Rope"; break;
      case CONVEY: pn = "Convey"; break;
      case TOLL: pn = p.extra1 <= 4 ? "Toll" : p.extra1 === 5 ? "Sublevel" : "Bonus Level"; break;
      case PRODUCER: pn = "Producer"; break;
      default: pn = `?${p.value}`;
    }
    let mn: string;
    switch (m.value) {
      case NOWT: mn = "Nothing"; break;
      case WOOD: mn = ["Wood", "Breakable Wood", "Suction Wood"][m.extra1] ?? "Wood"; break;
      case DYNO: mn = "Dynomite"; break;
      case WATER: mn = "Water"; break;
      case TNT: mn = "TNT"; break;
      case PANEL: mn = "Panel"; break;
      case NITRO:
        mn = ["Nitro", "Small Nitro", "Zap Nitro", "Push Nitro", "Clock Nitro"][m.extra1] ?? "Nitro";
        if (m.extra1 === 2) this.makeZapNoise = !this.makeZapNoise;
        break;
      case GLASS: mn = m.extra1 === 0 ? "Glass" : "Broken Glass"; break;
      case SMILE: mn = "Smile"; break;
      case EXPLODE: mn = "Explode"; break;
      case RADAR: mn = "Radar"; break;
      case MINCE: mn = "Mince"; break;
      case BALLOON:
        mn = ["Balloon", "Spread Balloon", "Nitro Balloon", "Satellite Balloon"][m.extra1] ?? "Balloon";
        break;
      case WEIGHT: mn = "Weight"; break;
      default: mn = `?${m.value}`;
    }
    let cn: string;
    switch (c.value) {
      case NOWT: cn = "Nothing"; break;
      case MONEY: cn = c.extra1 === 10 ? "GST" : "Money"; break;
      case KEY: cn = "Key"; break;
      case ENERGY:
        cn = c.extra1 === 4 ? "Life" : c.extra1 === 5 ? "No Energy" : c.extra1 === 6 ? "Flippers" : c.extra1 === 7 ? "No Flippers" : "Energy";
        break;
      case SWITCH: cn = "Switch"; break;
      default: cn = `?${c.value}`;
    }
    return `${pn} and ${cn} and ${mn}`;
  }
}
