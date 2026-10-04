import {
  BRICK, DOOR, DYNO, ELEVATED, ENERGY, EXPLODE, GLASS, ICE, KEY, MAGNET,
  MONEY, NITRO, NOWT, ONEWAY, PANEL, RADAR, SMILE, STAIR, SWITCH, TNT,
  TWOWAY, WARP, WATER, WOOD,
  addToDirection, dDOWN, dLEFT, dRIGHT, dUP, exBNitro, exDyno, exNotmuch,
  exPNitro, exSNitro, exSmile, exTNT, isEven, oppositeD,
  MONEY_VALUES, EXPLODEFRAMES, TNTFRAMES,
  type Direction,
} from "./constants";
import type { ParsedLevel } from "./level-format";
import type { PopupData, SoundSink, SwitchData, ThingData } from "./types";

export interface EngineEvents {
  sound: SoundSink;
  popup: (text: string) => void;
  levelComplete: () => void;
  levelFailed: () => void;
  hudChanged: () => void;
}

const noopEvents = (): EngineEvents => ({
  sound: () => {},
  popup: () => {},
  levelComplete: () => {},
  levelFailed: () => {},
  hudChanged: () => {},
});

interface CheckpointSnap {
  parsed: ParsedLevel;
  keys: boolean[][];
  energy: number[];
}

const blank = (): ThingData => ({ value: 0, extra1: 0, extra2: 0, extra3: 0 });

/**
 * Faithful port of Game.frm logic.
 *
 * Deviations from the VB6 original (documented, sensible):
 * - Money uses a fixed denomination table; the original had a bug where
 *   Initialize() zeroed denominations 0 and 1 (`intMoney(s) = 0` collided
 *   with the denomination array). Fixed here.
 * - MsgBox popups are non-blocking callbacks.
 * - Recursion in MoveObjectCheck / MakeThingFromSwitch is depth-guarded
 *   (original relied on level constraints; guard prevents stack overflow).
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

  smileX = [0, 0];
  smileY = [0, 0];
  viewX = [0, 0];
  viewY = [0, 0];
  blnView = [true, true];
  blnArrow = [true, true];

  keys: boolean[][] = [];
  score = [0, 0];
  energy = [0, 0];
  lives = [3, 3];
  dead = [false, false];
  waterSafe = [false, false];
  makeZapNoise = true;

  checkpoint = false;
  private checkpointSnap: CheckpointSnap | null = null;
  currentLevelName = "";
  private currentParsed: ParsedLevel | null = null;

  wIndex = 0;
  nIndex = 0;
  zapIndex = 1;
  fpsCount = 0;

  events: EngineEvents = noopEvents();
  private moveDepth = 0;
  private switchDepth = 0;

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x <= this.xsize && y <= this.ysize;
  }

  // ---------- loading ----------

  loadParsed(parsed: ParsedLevel, levelName: string, restartScores: boolean): void {
    this.xsize = parsed.xsize;
    this.ysize = parsed.ysize;
    this.levelId = parsed.levelId;
    this.numPlayers = parsed.players;
    const W = this.xsize + 1;
    const H = this.ysize + 1;
    const clone = (g: ThingData[][]) => g.map((col) => col.map((c) => ({ ...c })));
    this.perm = clone(parsed.perm);
    this.coll = clone(parsed.coll);
    this.move = clone(parsed.move);
    this.popups = parsed.popups.map((p) => ({ ...p }));
    this.switches = parsed.switches.map((s) => ({ ...s }));
    this.currentParsed = parsed;
    this.currentLevelName = levelName;
    this.checkpoint = false;
    this.checkpointSnap = null;
    // Clear dead-player smiles (Game.frm LoadLevel).
    for (let s = 0; s < this.numPlayers; s++) {
      if (this.dead[s]) {
        const sx = parsed.smileStarts[s]?.x ?? 0;
        const sy = parsed.smileStarts[s]?.y ?? 0;
        if (this.inBounds(sx, sy)) this.move[sx]![sy] = blank();
      }
    }
    // Smile positions come from the level header (VB reads them separately).
    for (let s = 0; s < this.numPlayers; s++) {
      this.smileX[s] = parsed.smileStarts[s]?.x ?? 0;
      this.smileY[s] = parsed.smileStarts[s]?.y ?? 0;
    }
    this.initialize(restartScores);
    // Checkpoint tail (only in checkpoint saves).
    if (parsed.checkpointKeys && parsed.checkpointEnergy) {
      for (let k = 1; k <= 6; k++)
        for (let s = 0; s < 2; s++) this.keys[k]![s] = parsed.checkpointKeys[k]?.[s] ?? false;
      for (let s = 0; s < 2; s++) this.energy[s] = parsed.checkpointEnergy[s] ?? 0;
    }
    // Views follow smiles.
    for (let s = 0; s < this.numPlayers; s++) {
      this.viewX[s] = this.smileX[s]!;
      this.viewY[s] = this.smileY[s]!;
    }
    this.events.hudChanged();
  }

  reloadCurrent(): void {
    if (!this.currentParsed) return;
    const keepLives = [...this.lives];
    const keepDead = [...this.dead];
    const keepScore = [...this.score];
    this.loadParsed(this.currentParsed, this.currentLevelName, false);
    // KillSmile path preserves lives/dead/score bookkeeping done by caller;
    // reloadCurrent is used for checkpoint restores where Initialize must not reset.
    this.lives = keepLives;
    this.dead = keepDead;
    this.score = keepScore;
  }

  initialize(restart: boolean): void {
    this.checkpoint = false;
    this.makeZapNoise = true;
    for (let s = 0; s < this.numPlayers; s++) {
      this.blnArrow[s] = true;
      this.score[s] = 0;
      this.energy[s] = 0;
      if (restart) {
        this.lives[s] = 3;
        this.dead[s] = false;
      }
      this.blnView[s] = true;
      this.waterSafe[s] = false;
      for (let k = 1; k <= 6; k++) {
        if (!this.keys[k]) this.keys[k] = [false, false];
        this.keys[k]![s] = false;
      }
    }
    // keys array is [1..6][0..1]; ensure shape.
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

  /** Returns "moved" | "view" | "ignored" | "suicide". */
  press(s: number, dir: Direction): boolean {
    if (s >= this.numPlayers) return false;
    if (this.dead[s]) return false;
    const sm = this.move[this.smileX[s]!]![this.smileY[s]!];
    if (!sm || sm.value !== SMILE) {
      this.killSmile(s);
      return false;
    }
    if (!this.blnArrow[s]) return false;
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
    if (dir === dUP) this.viewY[s]!--;
    else if (dir === dDOWN) this.viewY[s]!++;
    else if (dir === dLEFT) this.viewX[s]!--;
    else this.viewX[s]!++;
  }

  suicide(s: number): void {
    if (s < this.numPlayers && !this.dead[s]) this.killSmile(s);
  }

  // ---------- per-tick update (MainLoop logic half) ----------

  tick(): void {
    const xs = this.xsize;
    const ys = this.ysize;

    // Slide arming: Extra3 1 -> 2 (except warp).
    for (let x = 0; x <= xs; x++)
      for (let y = 0; y <= ys; y++) {
        const p = this.perm[x]![y]!;
        if (p.value > BRICK && p.value < STAIR) {
          if (p.extra3 === 1 && p.value !== WARP) p.extra3 = 2;
        }
      }
    // Slide moves.
    for (let x = 0; x <= xs; x++)
      for (let y = 0; y <= ys; y++) {
        const p = this.perm[x]![y]!;
        if (p.value > BRICK && p.value < STAIR) {
          if (p.value === WARP) {
            if (p.extra2 !== 0) this.moveThing(x, y);
          } else if (p.extra3 === 2) {
            this.moveThing(x, y);
          }
        }
        const m = this.move[x]![y]!;
        if (m.value === GLASS && m.extra1 === 2) m.extra3 = 1;
      }

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
            } else if (m.extra1 === 4) {
              if (this.nIndex === 3) {
                if (m.extra2 === NOWT) {
                  m.extra2 = exBNitro;
                  m.extra1 = NOWT;
                  m.value = EXPLODE;
                } else if (isEven(m.extra2)) {
                  m.extra2 -= 2;
                }
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
          case MAGNET:
            if (m.extra2 === 0) this.magnetCheck(x, y);
            break;
          case GLASS:
            if (m.extra1 === 2 && this.zapIndex === 6 && m.extra3 === 1) {
              m.extra3 = 0;
              this.moveObjectCheck(x, y, GLASS, m.extra2 as Direction);
            }
            break;
        }
        // Spread pass.
        const m2 = this.move[x]![y]!;
        switch (m2.value) {
          case WATER:
          case PANEL:
          case WOOD:
          case DYNO:
          case TNT:
            if (m2.extra2 === 2 && this.zapIndex === 12) this.spreadThing(x, y);
            else if (m2.extra2 === 1) m2.extra2 = 2;
            break;
          case GLASS:
            if (m2.extra1 !== 2) {
              if (m2.extra2 === 2 && this.zapIndex === 12) this.spreadThing(x, y);
              else if (m2.extra2 === 1) m2.extra2 = 2;
            }
            break;
          case NITRO:
            if (m2.extra1 !== 4) {
              if (m2.extra2 === 2 && this.zapIndex === 12) this.spreadThing(x, y);
              else if (m2.extra2 === 1) m2.extra2 = 2;
            }
            break;
        }
      }

    if (zapSound && this.makeZapNoise) this.events.sound("zap", false);

    // View follows.
    for (let s = 0; s < this.numPlayers; s++) {
      if (this.blnView[s]) {
        this.viewX[s] = this.smileX[s]!;
        this.viewY[s] = this.smileY[s]!;
      }
    }

    // Finish check (was in draw code): smile on finish door (color 6).
    for (let s = 0; s < this.numPlayers; s++) {
      if (this.dead[s]) continue;
      const sx = this.smileX[s]!;
      const sy = this.smileY[s]!;
      if (!this.inBounds(sx, sy)) continue;
      const p = this.perm[sx]![sy]!;
      if (p.value === DOOR && p.extra1 === 6) {
        this.finishLevel();
        break;
      }
    }

    this.wIndex++;
    if (this.wIndex > 3 * 5) this.wIndex = 0;
    this.nIndex++;
    if (this.nIndex > 3) this.nIndex = 0;
    this.zapIndex++;
    if (this.zapIndex > 24) this.zapIndex = 1;
    this.fpsCount++;
  }

  get waterFrame(): number {
    return Math.floor(this.wIndex / 5) % 4;
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
        newy--;
        if (newy < 0) {
          if (objType === GLASS && this.move[x]![y]!.extra1 === 2) this.move[x]![y]!.extra2 = oppositeD(dir);
          return false;
        }
        break;
      case dDOWN:
        newy++;
        if (newy > this.ysize) {
          if (objType === GLASS && this.move[x]![y]!.extra1 === 2) this.move[x]![y]!.extra2 = oppositeD(dir);
          return false;
        }
        break;
      case dLEFT:
        newx--;
        if (newx < 0) {
          if (objType === GLASS && this.move[x]![y]!.extra1 === 2) this.move[x]![y]!.extra2 = oppositeD(dir);
          return false;
        }
        break;
      case dRIGHT:
        newx++;
        if (newx > this.xsize) {
          if (objType === GLASS && this.move[x]![y]!.extra1 === 2) this.move[x]![y]!.extra2 = oppositeD(dir);
          return false;
        }
        break;
      default:
        return false;
    }

    let intSmileNum = 0;
    let startArrow = false;
    let blnFixArrow = false;
    if (objType === SMILE) {
      intSmileNum = this.move[oldx]![oldy]!.extra1;
      if (oldx === this.smileX[intSmileNum] && oldy === this.smileY[intSmileNum]) {
        // current player pos
      } else {
        startArrow = this.blnArrow[intSmileNum] ?? true;
        blnFixArrow = true;
      }
      this.blnArrow[intSmileNum] = false;
    }

    let ok = true;
    switch (objType) {
      case WOOD:
      case WATER:
      case NITRO:
      case RADAR:
        if (objType === NITRO && this.move[oldx]![oldy]!.extra1 === 3) break;
        else if (objType === RADAR && !isEven(this.move[oldx]![oldy]!.extra1)) break;
        else {
          if (this.perm[oldx]![oldy]!.value === TWOWAY && this.perm[oldx]![oldy]!.extra1 === 2) break;
          ok = false;
        }
        break;
      case NOWT:
        ok = false;
        break;
      case EXPLODE:
        if (this.move[oldx]![oldy]!.extra2 === exSNitro || this.move[oldx]![oldy]!.extra2 === exBNitro) ok = false;
        break;
      case SMILE:
      case DYNO:
      case PANEL:
      case TNT:
      case GLASS:
      case MAGNET:
        ok = true;
        break;
      default:
        ok = false;
    }
    if (!ok) return false;

    const oldPerm = this.perm[oldx]![oldy]!;
    if (oldPerm.value === ONEWAY || oldPerm.value === TWOWAY) {
      if (dir === oldPerm.extra2) {
        if (objType !== SMILE) {
          if (oldPerm.value === ONEWAY && dir !== oldPerm.extra1) return false;
        }
      }
    }

    // Permanent check.
    if (this.perm[newx]![newy]!.value !== NOWT) {
      ok = this.moveCheck1(newx, newy, oldx, oldy, objType, dir);
    } else if (objType === SMILE) {
      this.blnArrow[intSmileNum] = true;
    }
    if (!ok) {
      if (objType === SMILE) {
        this.blnArrow[intSmileNum] = true;
        if (this.perm[newx]![newy]!.value === BRICK) {
          // fall through to collectable (VB GoTo collectable)
        } else {
          return false;
        }
      } else {
        if ((objType as number) === GLASS && this.move[x]![y]!.extra1 === 2) this.move[x]![y]!.extra2 = oppositeD(dir);
        return false;
      }
    }
    // If blocked by brick, VB still runs collectable check for smile.
    if (!ok) {
      // collectable label path continues below with ok=false
    }

    // Moveable check.
    if (this.move[newx]![newy]!.value !== NOWT) {
      if (this.move[x]![y]!.extra3 === 1) {
        if (objType === SMILE && this.blnArrow[intSmileNum] === false) {
          const nv = this.move[newx]![newy]!.value;
          switch (nv) {
            case WATER:
            case NITRO:
              if (nv === NITRO && this.move[newx]![newy]!.extra1 === 3) ok = false;
              else {
                if (this.perm[newx]![newy]!.value === TWOWAY && this.perm[newx]![newy]!.extra1 === 2) ok = false;
                else ok = true;
              }
              break;
            default:
              ok = false;
          }
          const nv2 = this.move[newx]![newy]!.value;
          switch (nv2) {
            case NITRO:
              if (!ok && !this.useEnergy(intSmileNum)) this.perm[newx]![newy]!.extra3 = 0;
              break;
            case PANEL:
            case TNT:
            case DYNO:
            case MAGNET:
              if (!this.useEnergy(intSmileNum) && this.move[newx]![newy]!.extra3 !== 1)
                this.perm[newx]![newy]!.extra3 = 0;
              break;
            case GLASS:
              if (this.move[newx]![newy]!.extra1 === 0) {
                if (!this.useEnergy(intSmileNum) && this.move[newx]![newy]!.extra3 !== 1)
                  this.perm[newx]![newy]!.extra3 = 0;
              } else {
                ok = true;
              }
              break;
            case WOOD:
              if (this.move[newx]![newy]!.extra1 === 1 && this.useEnergy(intSmileNum)) {
                this.move[newx]![newy]!.value = NOWT;
                this.move[newx]![newy]!.extra1 = NOWT;
              }
              break;
          }
        }
      }
      if (ok) ok = this.moveCheck2(newx, newy, oldx, oldy, objType, dir);
    }

    if (!ok) {
      if (objType === SMILE) this.blnArrow[intSmileNum] = true;
      if (objType === GLASS && this.move[x]![y]!.extra1 === 2) this.move[x]![y]!.extra2 = oppositeD(dir);
      return false;
    }

    // Collectable (smile only).
    if (objType === SMILE) {
      if (this.coll[newx]![newy]!.value !== NOWT) {
        ok = this.moveCheck3(newx, newy, objType, dir, ok, intSmileNum);
      }
    }
    if (!ok) {
      if (objType === SMILE) this.blnArrow[intSmileNum] = true;
      if (objType === GLASS && this.move[x]![y]!.extra1 === 2) this.move[x]![y]!.extra2 = oppositeD(dir);
      return false;
    }

    if (this.move[oldx]![oldy]!.value === SMILE) {
      if (this.smileX[intSmileNum] === oldx && this.smileY[intSmileNum] === oldy) {
        this.smileX[intSmileNum] = newx;
        this.smileY[intSmileNum] = newy;
      }
    } else if (this.move[oldx]![oldy]!.value === GLASS && this.move[oldx]![oldy]!.extra1 === 2) {
      this.move[oldx]![oldy]!.extra2 = dir;
    }

    this.move[newx]![newy]!.value = this.move[oldx]![oldy]!.value;
    this.move[newx]![newy]!.extra1 = this.move[oldx]![oldy]!.extra1;
    this.move[newx]![newy]!.extra2 = this.move[oldx]![oldy]!.extra2;
    this.move[newx]![newy]!.extra3 = this.move[oldx]![oldy]!.extra3;
    this.move[oldx]![oldy] = blank();

    if (objType === SMILE) {
      if (blnFixArrow) this.blnArrow[intSmileNum] = startArrow;
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
    } else if (objType === RADAR) {
      const nm = this.move[newx]![newy]!;
      if (nm.extra1 === 2 || nm.extra1 === 3) {
        if (this.radarPoint(newx, newy)) nm.extra1 -= 2;
      }
    } else if (objType === MAGNET) {
      this.move[newx]![newy]!.extra2 = 0;
    }
    this.events.hudChanged();
    return true;
  }

  private moveCheck1(newx: number, newy: number, oldx: number, oldy: number, objType: number, dir: Direction): boolean {
    let intSmileNum = 0;
    if (objType === SMILE) intSmileNum = this.move[oldx]![oldy]!.extra1;
    const target = this.perm[newx]![newy]!;
    switch (target.value) {
      case BRICK:
        return false;
      case WARP: {
        target.extra2 = dir;
        if (this.move[oldx]![oldy]!.value === NITRO && this.move[oldx]![oldy]!.extra1 !== 3) break;
        this.move[oldx]![oldy]!.extra3 = 1;
        if (objType === SMILE) this.blnArrow[intSmileNum] = false;
        return true;
      }
      case ICE: {
        if (objType === target.extra1) return false;
        target.extra2 = dir;
        target.extra3 = 1;
        if (this.move[oldx]![oldy]!.value === NITRO && this.move[oldx]![oldy]!.extra1 !== 3) break;
        this.move[oldx]![oldy]!.extra3 = 1;
        if (objType === SMILE) {
          this.blnArrow[intSmileNum] = target.extra1 === 1;
        }
        return true;
      }
      case ONEWAY: {
        target.extra2 = dir;
        target.extra3 = 1;
        if (this.move[oldx]![oldy]!.value === NITRO && this.move[oldx]![oldy]!.extra1 !== 3) break;
        this.move[oldx]![oldy]!.extra3 = 1;
        if (objType === SMILE) this.blnArrow[intSmileNum] = false;
        return true;
      }
      case TWOWAY: {
        target.extra2 = dir;
        target.extra3 = 1;
        if (this.move[oldx]![oldy]!.value === NITRO && this.move[oldx]![oldy]!.extra1 !== 3) break;
        this.move[oldx]![oldy]!.extra3 = 1;
        if (objType === SMILE) this.blnArrow[intSmileNum] = false;
        return true;
      }
      case STAIR:
        if (objType === SMILE) this.blnArrow[intSmileNum] = true;
        return true;
      case ELEVATED: {
        if (objType === SMILE) this.blnArrow[intSmileNum] = true;
        const from = this.perm[oldx]![oldy]!.value;
        if (from === ELEVATED || from === STAIR || from === BRICK) {
          if (objType === SMILE && target.extra1 > 0) {
            target.extra1++;
            if (target.extra1 === 10) {
              target.extra1 = 0;
              target.value = BRICK;
            }
          }
          return true;
        }
        return false;
      }
      case DOOR: {
        let ok = target.extra2 !== 0;
        if (objType === SMILE) {
          this.blnArrow[intSmileNum] = true;
          if (!ok) {
            if (this.getKey(target.extra1, intSmileNum)) {
              target.extra2 = 1;
            }
          } else if (target.extra3 === 0) {
            this.collectKey(target.extra1, intSmileNum);
            target.extra2 = 0;
          }
        }
        return ok || (objType === SMILE && target.extra2 !== 0);
      }
    }
    return true; // VB skip label falls through with previous value; default allow
  }

  private moveCheck2(newx: number, newy: number, oldx: number, oldy: number, objType: number, dir: Direction): boolean {
    let intSmileNum = 0;
    if (objType === SMILE) intSmileNum = this.move[oldx]![oldy]!.extra1;
    const target = this.move[newx]![newy]!;
    switch (target.value) {
      case WOOD:
        if (objType === SMILE && target.extra1 === 1 && this.useEnergy(intSmileNum)) {
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
          this.move[oldx]![oldy] = { value: WATER, extra1: NOWT, extra2: NOWT, extra3: NOWT };
        }
        if (objType === PANEL) this.move[oldx]![oldy] = blank();
        else if (objType === SMILE) this.blnArrow[intSmileNum] = true;
        this.events.sound("splash", false);
        return true;
      }
      case DYNO: {
        if (objType === NITRO) return false;
        if (objType === SMILE && !this.useEnergy(intSmileNum)) return false;
        const pushed = this.moveObjectCheck(newx, newy, DYNO, dir);
        if (objType === SMILE && !pushed) {
          this.move[oldx]![oldy] = blank();
          this.move[newx]![newy]!.extra1 = exDyno;
        }
        return pushed;
      }
      case TNT: {
        if (objType === NITRO) return false;
        if (objType === SMILE && !this.useEnergy(intSmileNum)) return false;
        const pushed = this.moveObjectCheck(newx, newy, TNT, dir);
        if (!pushed) this.move[newx]![newy]!.extra1 = 1;
        return pushed;
      }
      case PANEL:
      case EXPLODE: {
        if (objType === NITRO) return false;
        if (objType === SMILE && !this.useEnergy(intSmileNum)) return false;
        return this.moveObjectCheck(newx, newy, target.value, dir);
      }
      case SMILE: {
        if (objType === GLASS) {
          if (this.move[oldx]![oldy]!.extra1 === 1) return true;
          if (this.move[oldx]![oldy]!.extra1 === 2) {
            this.moveObjectCheck(newx, newy, SMILE, dir);
            return true;
          }
        }
        if (objType === SMILE) {
          if (this.useEnergy(intSmileNum)) {
            if (intSmileNum === 0) {
              if (this.energy[0]! >= this.energy[1]!) return this.moveObjectCheck(newx, newy, SMILE, dir);
            } else {
              if (this.energy[1]! >= this.energy[0]!) return this.moveObjectCheck(newx, newy, SMILE, dir);
            }
          }
        }
        return false;
      }
      case NITRO: {
        if (objType === SMILE && !this.useEnergy(intSmileNum) && target.extra1 !== 0 && target.extra1 !== 2) return false;
        if (target.extra1 === 3 && objType === SMILE) {
          if (this.moveObjectCheck(newx, newy, NITRO, dir)) return true;
        }
        let cause = 0;
        let skipBang = false;
        switch (target.extra1) {
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
            skipBang = true;
            break;
        }
        if (skipBang) return false;
        target.extra2 = cause;
        target.extra1 = NOWT;
        target.value = EXPLODE;
        if (objType === SMILE && cause === exBNitro) {
          this.move[oldx]![oldy] = { value: EXPLODE, extra1: NOWT, extra2: exSmile, extra3: NOWT };
        }
        return false;
      }
      case GLASS: {
        if (objType === NITRO) return false;
        if (objType === SMILE && target.extra1 !== 1 && !this.useEnergy(intSmileNum)) return false;
        if (target.extra1 === 0) {
          const pushed = this.moveObjectCheck(newx, newy, GLASS, dir);
          if (!pushed) {
            target.extra1 = 1;
            this.events.sound("glass", false);
          }
          return pushed;
        } else if (target.extra1 === 1) {
          if (objType === SMILE) this.move[oldx]![oldy] = blank();
          return false;
        } else {
          const pushed = this.moveObjectCheck(newx, newy, GLASS, dir);
          if (objType === GLASS && this.move[oldx]![oldy]!.extra1 === 2 && pushed) {
            this.moveObjectCheck(oldx, oldy, GLASS, oppositeD(dir));
          }
          return pushed;
        }
      }
      case RADAR: {
        if (objType === NITRO) return false;
        if (objType === SMILE && !this.useEnergy(intSmileNum)) return false;
        switch (target.extra1) {
          case 1:
          case 3:
          case 5:
            return this.moveObjectCheck(newx, newy, RADAR, dir);
          default:
            return false;
        }
      }
      case MAGNET: {
        if (objType === NITRO) return false;
        if (objType === SMILE && !this.useEnergy(intSmileNum)) return false;
        return this.moveObjectCheck(newx, newy, MAGNET, dir);
      }
    }
    return false;
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

  // ---------- explosions / spread ----------

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
          blow = true;
          break;
        case TNT:
        case RADAR:
          blow = true;
          break;
        case WOOD:
          if (value === exDyno || value === exSNitro || value === exBNitro || value === exPNitro) blow = true;
          break;
        case PANEL:
          if (value === exDyno || value === exSNitro || value === exPNitro) push = true;
          else if (value === exBNitro) blow = true;
          break;
        case SMILE:
        case MAGNET:
          if (value === exDyno || value === exSNitro || value === exPNitro) push = true;
          else if (value === exBNitro) blow = true;
          break;
        case NITRO:
          blow = true;
          break;
        case WATER:
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
          } else if (t.extra1 === 1) {
            if (value === exBNitro || value === exSNitro || value === exPNitro) {
              t.value = EXPLODE;
              t.extra1 = NOWT;
              t.extra2 = NOWT;
            }
          } else {
            if (value === exBNitro) blow = true;
            else if (value === exDyno || value === exSNitro || value === exPNitro) push = true;
          }
          break;
      }
      if (blow) {
        const b = this.move[rx]![ry]!;
        switch (b.value) {
          case SMILE:
          case WOOD:
          case PANEL:
          case WATER:
            b.value = EXPLODE;
            b.extra1 = NOWT;
            b.extra2 = NOWT;
            break;
          case TNT:
          case DYNO:
            b.extra1 = 1;
            break;
          case RADAR:
          case MAGNET:
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
            if (b.extra1 === 0) {
              b.extra1 = 1;
              this.events.sound("glass", false);
            } else {
              b.value = EXPLODE;
              b.extra1 = NOWT;
              b.extra2 = exTNT;
            }
            break;
        }
      }
      if (push) this.moveObjectCheck(rx, ry, this.move[rx]![ry]!.value, d as Direction);
    }
  }

  private moveThing(x: number, y: number): void {
    const dir = this.perm[x]![y]!.extra2 as Direction;
    const objType = this.perm[x]![y]!.value;
    const movType = this.move[x]![y]!.value;
    let newDir: Direction = dir;
    switch (objType) {
      case ICE:
      case WARP:
        newDir = dir;
        break;
      case ONEWAY:
        newDir = this.perm[x]![y]!.extra1 as Direction;
        break;
      case TWOWAY:
        switch (this.perm[x]![y]!.extra1) {
          case 0:
            if (dir === dUP) newDir = dLEFT;
            else if (dir === dDOWN) newDir = dRIGHT;
            else if (dir === dLEFT) newDir = dUP;
            else newDir = dDOWN;
            break;
          case 1:
            if (dir === dUP) newDir = dRIGHT;
            else if (dir === dDOWN) newDir = dLEFT;
            else if (dir === dLEFT) newDir = dDOWN;
            else newDir = dUP;
            break;
          case 2:
            newDir = oppositeD(dir);
            break;
          case 3:
            newDir = addToDirection(dir, 1);
            break;
          case 4:
            newDir = addToDirection(dir, -1);
            break;
        }
        break;
    }
    if (objType === WARP) {
      let putWater = false;
      if (movType === SMILE && this.move[x]![y]!.extra2 === 2) {
        putWater = true;
        this.move[x]![y]!.extra2 = 0;
      }
      this.warpThing(x, y, this.perm[x]![y]!.extra1, this.perm[x]![y]!.extra3);
      if (putWater) this.move[x]![y]!.value = WATER;
      // NB: read both coords before assigning (VB used newx/newy temps).
      const destX = this.perm[x]![y]!.extra1;
      const destY = this.perm[x]![y]!.extra3;
      x = destX;
      y = destY;
    }
    if (!this.moveObjectCheck(x, y, movType, newDir) && objType !== WARP) {
      if (this.moveObjectCheck(x, y, movType, oppositeD(dir))) {
        this.move[x]![y]!.extra3 = NOWT;
        this.perm[x]![y]!.extra3 = NOWT;
        this.perm[x]![y]!.extra2 = NOWT;
      }
    } else if (objType !== WARP) {
      this.perm[x]![y]!.extra3 = NOWT;
      this.perm[x]![y]!.extra2 = NOWT;
      this.move[x]![y]!.extra3 = NOWT;
    }
  }

  private warpThing(x: number, y: number, newx: number, newy: number): void {
    if (!this.inBounds(newx, newy)) return;
    this.move[newx]![newy]!.value = this.move[x]![y]!.value;
    this.move[newx]![newy]!.extra1 = this.move[x]![y]!.extra1;
    this.move[newx]![newy]!.extra2 = this.move[x]![y]!.extra2;
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
      if (this.move[x2]![y2]!.value === NITRO && this.perm[x1]![y1]!.value === NOWT) {
        hit = true;
        const mid = this.move[x1]![y1]!;
        switch (mid.value) {
          case SMILE:
            mid.extra2 = exSmile;
            break;
          case PANEL:
          case WOOD:
          case WATER:
            mid.extra2 = exNotmuch;
            break;
          case TNT:
            mid.extra2 = exTNT;
            break;
          case DYNO:
            mid.extra2 = exDyno;
            break;
          case GLASS:
            if (mid.extra1 === 2) mid.extra2 = exTNT;
            break;
          case NITRO:
            if (mid.extra1 !== 4) {
              if (mid.extra1 === 0 || mid.extra1 === 2) mid.extra2 = exBNitro;
              else {
                if (mid.extra2 > 2) this.makeThingFromSwitch(mid.extra2, x1, y1);
                mid.extra2 = mid.extra1 === 1 ? exSNitro : exPNitro;
              }
            } else {
              if (!isEven(mid.extra2)) mid.extra2--;
              continue;
            }
            break;
        }
        mid.extra1 = 0;
        mid.value = EXPLODE;
      }
    }
    return hit;
  }

  private radarPoint(x: number, y: number): boolean {
    const dir = this.move[x]![y]!.extra2;
    if (dir === dUP) {
      for (let my = y - 1; my >= 0; my--) {
        const v = this.move[x]![my]!.value;
        if (v === RADAR) return true;
        if (v !== NOWT) return false;
      }
    } else if (dir === dLEFT) {
      for (let mx = x - 1; mx >= 0; mx--) {
        const v = this.move[mx]![y]!.value;
        if (v === RADAR) return true;
        if (v !== NOWT) return false;
      }
    } else if (dir === dDOWN) {
      for (let my = y + 1; my <= this.ysize; my++) {
        const v = this.move[x]![my]!.value;
        if (v === RADAR) return true;
        if (v !== NOWT) return false;
      }
    } else if (dir === dRIGHT) {
      for (let mx = x + 1; mx <= this.xsize; mx++) {
        const v = this.move[mx]![y]!.value;
        if (v === RADAR) return true;
        if (v !== NOWT) return false;
      }
    }
    return false;
  }

  private magnetCheck(x: number, y: number): void {
    if (this.move[x]![y]!.value !== MAGNET) return;
    this.move[x]![y]!.extra2 = 1;
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
      let doMove = false;
      if (this.move[x2]![y2]!.value === MAGNET) {
        if (this.move[x]![y]!.extra1 !== this.move[x2]![y2]!.extra1) {
          const mid = this.move[x1]![y1]!.value;
          const midE1 = this.move[x1]![y1]!.extra1;
          if (mid === NOWT || mid === WATER) doMove = true;
          else if (mid === NITRO && midE1 !== 3) doMove = true;
          if (doMove) {
            if (!this.moveObjectCheck(x2, y2, MAGNET, oppositeD(d as Direction))) {
              if (!this.moveObjectCheck(x, y, MAGNET, d as Direction)) this.move[x]![y]!.extra2 = 0;
            }
          }
        }
      }
      if (this.move[x1]![y1]!.value === MAGNET) {
        if (this.move[x]![y]!.extra1 === this.move[x1]![y1]!.extra1) {
          if (!this.moveObjectCheck(x1, y1, MAGNET, d as Direction)) {
            if (!this.moveObjectCheck(x, y, MAGNET, oppositeD(d as Direction))) this.move[x]![y]!.extra2 = 0;
            else {
              this.move[x]![y]!.extra2 = 0;
              return;
            }
          }
        }
      }
    }
  }

  private spreadThing(x: number, y: number): void {
    const objType = this.move[x]![y]!.value;
    this.move[x]![y]!.extra2 = NOWT;
    for (let d = dUP; d <= dRIGHT; d++) {
      let x1 = x;
      let y1 = y;
      if (d === dUP) y1--;
      else if (d === dDOWN) y1++;
      else if (d === dLEFT) x1--;
      else x1++;
      if (!this.inBounds(x1, y1)) continue;
      if (this.perm[x1]![y1]!.value === NOWT) {
        const t = this.move[x1]![y1]!;
        if (t.value === objType) continue;
        if (t.value === NOWT) {
          t.value = objType;
          t.extra1 = this.move[x]![y]!.extra1;
          t.extra2 = 1;
          t.extra3 = NOWT;
        } else {
          this.move[x]![y]!.extra2 = 1;
        }
      }
    }
  }

  // ---------- switches / keys / energy ----------

  private doSwitch(x: number, y: number): void {
    const n0 = this.coll[x]![y]!.extra2;
    const n1 = this.coll[x]![y]!.extra3;
    this.makeThingFromSwitch(n0, x, y);
    this.makeThingFromSwitch(n1, x, y);
  }

  makeThingFromSwitch(n: number, sx: number, sy: number): void {
    if (this.switchDepth > 16) return;
    this.switchDepth++;
    try {
      if (n >= 1 && n <= 49) {
        const sw = this.switches[n];
        if (!sw) return;
        let xp = sw.x;
        let yp = sw.y;
        if (xp === 50) xp = sx;
        if (yp === 50) yp = sy;
        if (!this.inBounds(xp, yp)) return;
        switch (true) {
          case sw.value === NOWT:
            if (sw.extra3 === 0) this.placePerm(sw, xp, yp);
            else if (sw.extra3 === 1) this.placeColl(sw, xp, yp);
            else if (sw.extra3 === 2) this.placeMove(sw, xp, yp);
            break;
          case sw.value >= BRICK && sw.value <= DOOR:
            this.placePerm(sw, xp, yp);
            break;
          case sw.value >= MONEY && sw.value <= SWITCH:
            this.placeColl(sw, xp, yp);
            break;
          case sw.value >= WOOD && sw.value <= EXPLODE:
            this.placeMove(sw, xp, yp);
            break;
        }
      } else if (n === 0) {
        return;
      } else if (n === 50) {
        this.events.sound("allnitro", true);
        for (let x = 0; x <= this.xsize; x++)
          for (let y = 0; y <= this.ysize; y++) {
            const m = this.move[x]![y]!;
            if (m.value === NITRO) {
              m.value = EXPLODE;
              if (m.extra1 === 1) m.extra2 = exSNitro;
              else if (m.extra1 === 3) m.extra2 = exPNitro;
              else m.extra2 = exBNitro;
              m.extra1 = NOWT;
            }
          }
      } else if (n === 51) {
        this.checkpoint = true;
        this.events.sound("check", true);
        this.takeCheckpointSnap();
      }
      if (n < 51) {
        const nx = this.switches[n]?.next ?? 0;
        if (nx) this.makeThingFromSwitch(nx, sx, sy);
      }
    } finally {
      this.switchDepth--;
    }
  }

  private placePerm(sw: SwitchData, xp: number, yp: number): void {
    if (sw.value === ONEWAY && (sw.extra1 === 0 || sw.extra1 > 4)) return;
    if (sw.value === TWOWAY && sw.extra1 > 2) return;
    if (sw.value === DOOR && (sw.extra1 === 0 || sw.extra1 > 6)) return;
    this.perm[xp]![yp] = { value: sw.value, extra1: sw.extra1, extra2: sw.extra2, extra3: sw.extra3 };
  }

  private placeColl(sw: SwitchData, xp: number, yp: number): void {
    if (sw.value === KEY && (sw.extra1 === 0 || sw.extra1 > 6)) return;
    if (sw.value === MONEY && (sw.extra1 < 0 || sw.extra1 > 10)) return;
    if (sw.value === ENERGY && (sw.extra1 < 0 || sw.extra1 > 7)) return;
    this.coll[xp]![yp] = { value: sw.value, extra1: sw.extra1, extra2: sw.extra2, extra3: sw.extra3 };
  }

  private placeMove(sw: SwitchData, xp: number, yp: number): void {
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

  useEnergy(s: number): boolean {
    if (this.energy[s] === 0) return false;
    this.energy[s]!--;
    if (this.energy[s] === 0) this.events.sound("powerdown", false);
    this.events.hudChanged();
    return true;
  }

  finishLevel(): void {
    this.clearArrays();
    this.events.levelComplete();
  }

  killSmile(s: number): void {
    this.blnArrow[s] = true;
    this.lives[s]!--;
    for (let k = 1; k <= 6; k++) {
      if (!this.keys[k]) this.keys[k] = [false, false];
      this.keys[k]![s] = false;
    }
    this.energy[s] = 0;
    this.waterSafe[s] = false;
    this.clearArrays();
    if (this.lives[s]! < 1) {
      this.failLevel(s);
    }
    if (this.checkpoint && this.checkpointSnap) {
      const snap = this.checkpointSnap;
      this.xsize = snap.parsed.xsize;
      this.ysize = snap.parsed.ysize;
      const clone = (g: ThingData[][]) => g.map((col) => col.map((c) => ({ ...c })));
      this.perm = clone(snap.parsed.perm);
      this.coll = clone(snap.parsed.coll);
      this.move = clone(snap.parsed.move);
      this.popups = snap.parsed.popups.map((p) => ({ ...p }));
      // NOTE: original reloads checkpoint.bmp from disk (fresh). Snapshot is equivalent.
      for (let k = 1; k <= 6; k++)
        for (let p = 0; p < 2; p++) this.keys[k]![p] = snap.keys[k]?.[p] ?? false;
      for (let p = 0; p < 2; p++) this.energy[p] = snap.energy[p] ?? 0;
      // Smile positions: checkpoint file stores smileStarts; VB LoadLevel reads them.
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
    this.events.hudChanged();
  }

  private failLevel(s: number): void {
    this.dead[s] = true;
    let anyAlive = false;
    for (let p = 0; p < this.numPlayers; p++) {
      if (this.dead[p]) this.blnArrow[p] = false;
      else anyAlive = true;
    }
    if (!anyAlive) this.events.levelFailed();
  }

  /** Right-click inspect text (PB_MouseDown right-button port). */
  inspect(x: number, y: number): string {
    if (!this.inBounds(x, y)) return "";
    const p = this.perm[x]![y]!;
    const c = this.coll[x]![y]!;
    const m = this.move[x]![y]!;
    const pn = ["Nothing", "Brick", "Warp", "Ice", "OneWay", "TwoWay", "Stair", "Elevated", "Door"][p.value] ?? `?${p.value}`;
    let mn: string;
    switch (m.value) {
      case NOWT: mn = "Nothing"; break;
      case WOOD: mn = "Wood"; break;
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
      case MAGNET: mn = "Magnet"; break;
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
