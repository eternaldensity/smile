import {
  ARROW, BALL, BOLT, BRICK, DIR_NAME, DOWN, ELOCK, FLIPPERS, LADDER,
  LEFT, PANEL, PENGUIN, PENGUIN_LETTERS, RIGHT, SEAL, SHIP, SLOCK, UP,
  WARP, WATER, WOOD, DEATH_PAUSE_MS, oppositeDir,
  type Dir, type DirName,
} from "./constants";
import type { LevelData, LevelFlags, WarpRule } from "./levels";

export type SoundName = "bang" | "splash" | "thump" | "warp" | "beep";
export type SoundSink = (name: SoundName) => void;

export interface Obj {
  id: number;
  type: number;
  pname: number;
  x: number;
  y: number;
  dir: Dir;
  visible: boolean;
  home: { x: number; y: number };
  canDrop: boolean;
  dropping: boolean;
  flippers: number;
}

export interface EngineEvents {
  sound: SoundSink;
  message: (text: string) => void;
  finished: () => void;
  hudChanged: () => void;
}

const noop = (): EngineEvents => ({
  sound: () => {},
  message: () => {},
  finished: () => {},
  hudChanged: () => {},
});

/**
 * Faithful port of the per-level VB6 logic (levelN.frm code template).
 *
 * Deviations (documented, sensible):
 * - MsgBox popups become message() events; the death Pause() busy-wait is a
 *   250ms sim pause instead of freezing the thread.
 * - Warps referencing nothing (VB error 91, e.g. seals entering L11's
 *   fan-out gate) are no-ops.
 * - chkVisible roster UI is skipped: all three penguins are always active
 *   (the VB default); intPlayers is the visible-penguin count at load.
 * - Recursion in push chains is depth-guarded.
 * - Password/hints-form/Main.frm shell is replaced by level select 1-21
 *   plus auto-advance (Main.frm lived outside the repo).
 */
export class Engine {
  objs: Obj[] = [];
  warps: Record<string, WarpRule> = {};
  flags: LevelFlags = {};
  sealMs = 200;
  levelNum = 1;
  players = 3;
  homeCount = 0;
  finished = false;

  private sealTimer = false;
  private sealAcc = 0;
  private spawnCount = 0;
  private swapCount = 0;
  private pauseMs = 0;
  private dontSwap = false;
  private blnExit = false;
  private moveDepth = 0;

  events: EngineEvents = noop();

  byId(id: number): Obj {
    const o = this.objs.find((ob) => ob.id === id);
    if (!o) throw new Error(`object ${id} missing`);
    return o;
  }

  load(data: LevelData, levelNum: number): void {
    this.objs = data.objects.map((o) => ({
      id: o.id,
      type: o.type,
      pname: o.pname,
      x: o.x,
      y: o.y,
      dir: o.dir,
      visible: o.visible,
      home: { x: o.x, y: o.y },
      canDrop: true,
      dropping: false,
      flippers: 0,
    }));
    this.warps = data.warps;
    this.flags = data.flags ?? {};
    this.sealMs = data.sealMs || this.flags.sealMs || 200;
    this.levelNum = levelNum;
    this.players = this.objs.filter((o) => o.type === PENGUIN && o.id < 3 && o.visible).length;
    this.homeCount = 0;
    this.finished = false;
    this.sealTimer = false;
    this.sealAcc = 0;
    this.spawnCount = 0;
    this.swapCount = 0;
    this.pauseMs = 0;
    this.dontSwap = false;
    this.blnExit = false;
  }

  /** Keypress for penguin slot p (0-2): single discrete step. */
  key(p: number, dir: Dir): void {
    const po = this.objs.find((o) => o.id === p);
    if (!po || !po.visible || po.type !== PENGUIN) return;
    this.blnExit = false;
    this.sealTimer = true;
    po.dir = dir;
    po.dropping = false;
    po.canDrop = true;
    this.moveObjectCheck(p, dir);
    this.events.hudChanged();
  }

  get boltsLeft(): number {
    return this.objs.filter((o) => o.type === BOLT && o.visible).length;
  }

  tick(dtMs: number): void {
    if (this.finished) return;
    if (this.pauseMs > 0) {
      this.pauseMs -= dtMs;
      return;
    }
    if (!this.sealTimer) return;
    this.sealAcc += dtMs;
    while (this.sealAcc >= this.sealMs) {
      this.sealAcc -= this.sealMs;
      this.sealStep();
    }
  }

  private sealStep(): void {
    for (const mov of this.objs) {
      if (!mov.visible || mov.type !== SEAL) continue;
      mov.dropping = false;
      mov.canDrop = true;
      if (!this.moveObjectCheck(mov.id, mov.dir)) {
        if (!this.dontSwap) mov.dir = oppositeDir(mov.dir);
        else this.dontSwap = false;
      }
    }
    this.spawnCount++;
    if (this.spawnCount >= 5) {
      this.spawnCount = 0;
      this.spawnPass();
    }
    this.swapCount++;
    if (this.swapCount >= 10) {
      this.swapCount = 0;
      this.swapArrows();
    }
    this.events.hudChanged();
  }

  private spawnPass(): void {
    for (const m of this.objs) {
      if (m.type !== ARROW || !m.visible) continue;
      const e = this.objs.find(
        (o) => !o.visible && o.type === SEAL && o.x === m.x && o.y === m.y,
      );
      if (e) {
        e.dir = m.dir;
        e.visible = true;
        this.events.sound("beep");
      }
    }
  }

  private swapArrows(): void {
    const pins = this.flags.arrowSwap?.pins ?? {};
    const all = this.flags.arrowSwap?.all;
    for (const o of this.objs) {
      if (o.type !== ARROW) continue;
      if (String(o.id) in pins) o.dir = pins[String(o.id)]! as Dir;
      else if (all !== undefined) o.dir = all as Dir;
      else o.dir = Math.floor(Math.random() * 2) as Dir;
    }
  }

  /** MoveObjectCheck port. Moves the object on success. */
  moveObjectCheck(id: number, dir: Dir): boolean {
    if (this.moveDepth > 64) return false;
    this.moveDepth++;
    try {
      const mover = this.byId(id);
      let ok = true;
      switch (dir) {
        case LEFT:
          if (mover.x === 0) ok = false;
          break;
        case RIGHT:
          if (mover.x === 11) ok = false;
          break;
        case UP:
          if (mover.y === 0) ok = false;
          break;
        case DOWN:
          if (mover.y === 11) {
            if (this.flags.wrapBottom) {
              mover.y = -1; // L9: off the bottom, back on the top
            } else {
              ok = false;
            }
          }
          break;
      }
      if (!ok) return false;
      for (const o of this.objs) {
        if (!o.visible || o.id === id) continue;
        let hit = false;
        switch (dir) {
          case LEFT:
            hit = mover.x === o.x + 1 && mover.y === o.y;
            break;
          case RIGHT:
            hit = mover.x === o.x - 1 && mover.y === o.y;
            break;
          case UP:
            hit = mover.x === o.x && mover.y === o.y + 1;
            break;
          case DOWN:
            hit = mover.x === o.x && mover.y === o.y - 1;
            break;
        }
        if (hit) {
          if (!this.objectTypeCheck(mover, o, dir)) return false;
        }
        if (this.blnExit) return false;
      }
      if (this.blnExit) return false;
      mover.x += dir === LEFT ? -1 : dir === RIGHT ? 1 : 0;
      mover.y += dir === UP ? -1 : dir === DOWN ? 1 : 0;
      this.bangsCheck(id, dir);
      if (mover.flippers > 0) {
        mover.flippers--;
      }
      this.events.hudChanged();
      return true;
    } finally {
      this.moveDepth--;
    }
  }

  private objectTypeCheck(a: Obj, b: Obj, dir: Dir): boolean {
    switch (b.type) {
      case BRICK:
        return false;
      case SHIP:
        return true; // VB `If A = penguin Or seal Or ball` is always true.
      case SEAL:
        if (a.type === SEAL) {
          if (a.dir === b.dir) {
            return this.moveObjectCheck(b.id, dir);
          } else if (dir === LEFT || dir === RIGHT) {
            a.dir = oppositeDir(a.dir);
            b.dir = oppositeDir(b.dir);
            this.moveObjectCheck(a.id, oppositeDir(dir));
            this.dontSwap = true;
            return false;
          }
          // Head-on vertically: VB falls out of the If and returns True.
          return true;
        } else if (a.type === PENGUIN) {
          return true;
        } else if (a.type === BALL) {
          this.moveObjectCheck(b.id, dir);
          return true;
        }
        return false;
      case PENGUIN:
        if (a.type === PENGUIN || a.type === BALL) {
          this.moveObjectCheck(b.id, dir);
        }
        return true; // move anyway, even if the push failed
      case BALL:
        if (a.type === PENGUIN || a.type === BALL || a.type === SEAL) {
          return this.moveObjectCheck(b.id, dir);
        }
        return true;
      case WATER:
        return true;
      case WOOD:
        if (a.type === SEAL || a.type === BALL) return false;
        b.visible = false;
        this.events.sound("bang");
        return false;
      case PANEL:
        if (a.type === PENGUIN || a.type === BALL) return false;
        else if (a.type === SEAL) {
          b.visible = false;
          this.events.sound("bang");
          return false;
        }
        return true;
      case LADDER:
        if (a.type === SEAL) a.dir = oppositeDir(a.dir);
        return true;
      case SLOCK:
        if (a.type === PENGUIN) return false;
        else if (a.type === SEAL || a.type === BALL) return true;
        return true;
      case ELOCK:
        if (a.type === SEAL || a.type === BALL) return false;
        else if (a.type === PENGUIN) return true;
        return true;
      case WARP:
        return true;
      default:
        return true;
    }
  }

  private bangsCheck(id: number, dir: Dir): void {
    const mb = this.byId(id);
    mb.dropping = false;
    for (const gb of this.objs) {
      if (!mb.visible || !gb.visible || gb.id === id) continue;
      if (gb.x !== mb.x || gb.y !== mb.y) continue;
      if (gb.type === SEAL) {
        if (mb.type === PENGUIN) {
          if (dir === DOWN) {
            this.killSeal(gb);
          } else {
            gb.visible = false;
            this.killPenguin(mb);
            return;
          }
        } else if (mb.type === BALL) {
          this.killSeal(gb);
        }
      } else if (gb.type === WATER) {
        if (mb.type === PENGUIN) {
          if (mb.flippers === 0) {
            this.killPenguin(mb, "s");
            return;
          }
        } else if (mb.type === SEAL || mb.type === BALL) {
          this.sinkMover(mb);
          return;
        }
      } else if (gb.type === SHIP) {
        if (mb.type === PENGUIN) {
          this.finishHome(id);
          return;
        }
      } else if (gb.type === PENGUIN) {
        if (mb.type === SEAL || mb.type === BALL || mb.type === PENGUIN) {
          mb.visible = false;
          this.killPenguin(gb);
          return;
        }
      } else if (gb.type === LADDER) {
        if (mb.type === PENGUIN) {
          mb.canDrop = false;
        } else if (mb.type === SEAL) {
          if (dir !== DOWN) {
            mb.canDrop = false;
            if (!this.moveObjectCheck(mb.id, UP) && this.flags.sealClimbFallback) {
              mb.canDrop = true; // L19: failed climb re-enables falling
            }
          }
        }
      } else if (gb.type === WARP) {
        this.warpTeleport(gb.id, mb.id, dir);
        return;
      } else if (gb.type === ARROW) {
        mb.dir = gb.dir;
        this.moveObjectCheck(mb.id, gb.dir);
      } else if (gb.type === FLIPPERS) {
        if (mb.type === PENGUIN) {
          mb.flippers = 20;
          this.events.sound("beep");
        }
      } else if (gb.type === BOLT) {
        if (mb.type === PENGUIN) {
          gb.visible = false;
          const trig = this.flags.boltLadderTrigger;
          if (trig !== undefined && !this.byId(trig).visible) this.showLadders();
          if (this.allBolts()) this.showShips();
        }
      }
    }
    this.fallCheck(id);
  }

  private killSeal(seal: Obj): void {
    seal.visible = false;
    this.events.sound("thump");
    this.resetMover(seal);
    this.events.hudChanged();
  }

  /** MBang("s"): sink. Balls pause like other bangs; seals don't. */
  private sinkMover(mb: Obj): void {
    mb.visible = false;
    this.events.sound("splash");
    if (mb.type === BALL) this.pauseMs = DEATH_PAUSE_MS;
    this.resetMover(mb);
    this.events.hudChanged();
  }

  /** MBang("t") on a penguin / drowning: pause + wipe ITS flippers + full reset. */
  private killPenguin(mb: Obj, how: "t" | "s" = "t"): void {
    mb.visible = false;
    mb.flippers = 0;
    this.events.sound(how === "s" ? "splash" : "thump");
    this.pauseMs = DEATH_PAUSE_MS;
    this.clearLevel();
    this.events.hudChanged();
  }

  /** EClear port: send one object home. */
  private resetMover(o: Obj): void {
    o.x = o.home.x;
    o.y = o.home.y;
    o.canDrop = true;
    o.visible = o.type !== SEAL && o.type !== SHIP;
  }

  /** ClearLevel port: full wipe after a penguin death. */
  private clearLevel(): void {
    for (const o of this.objs) this.resetMover(o);
    this.sealTimer = false;
    this.homeCount = 0;
    this.dontSwap = false;
    this.blnExit = true;
    const hide = this.flags.hideOnReset ?? [];
    for (const id of hide) {
      const o = this.objs.find((ob) => ob.id === id);
      if (o) o.visible = false;
    }
    this.events.hudChanged();
  }

  private fallCheck(id: number): void {
    if (this.finished) return;
    const o = this.byId(id);
    if (!o.visible) return;
    if (o.type === PENGUIN) {
      for (const l of this.objs) {
        // NB: VB checks every ladder, visible or not.
        if (l.type === LADDER && l.x === o.x && l.y === o.y + 1) return;
      }
    }
    if (!o.canDrop) return;
    o.dropping = true;
    o.canDrop = true;
    this.moveObjectCheck(id, DOWN);
  }

  private allBolts(): boolean {
    return !this.objs.some((o) => o.type === BOLT && o.visible);
  }

  private showShips(): void {
    for (const o of this.objs) {
      if (o.type === SHIP) o.visible = true;
    }
    for (const id of this.flags.showShipsExtra ?? []) {
      const o = this.objs.find((ob) => ob.id === id);
      if (o) o.visible = true;
    }
  }

  private showLadders(): void {
    for (const o of this.objs) {
      if (o.type === LADDER) o.visible = true;
    }
  }

  private warpTeleport(warperId: number, warpeeId: number, moveDir: Dir): void {
    const rule = this.warps[String(warperId)] ?? null;
    const warpee = this.byId(warpeeId);
    const resolved = this.resolveWarp(rule, warpee, moveDir);
    if (!resolved) return; // VB would crash (error 91); we no-op instead
    const t = this.byId(resolved.to);
    warpee.x = t.x;
    warpee.y = t.y;
    if (warpee.type === PENGUIN) this.events.sound("warp");
    this.moveObjectCheck(warpeeId, resolved.exit);
  }

  private resolveWarp(
    rule: WarpRule | null, warpee: Obj, moveDir: Dir,
  ): { to: number; exit: Dir } | null {
    const entry: DirName = DIR_NAME[moveDir]!;
    if (rule === null || rule === undefined) {
      const wElse = this.flags.warpElse;
      if (!wElse?.random) return null;
      const [lo, hi] = wElse.random;
      return { to: lo + Math.floor(Math.random() * (hi - lo + 1)), exit: this.applyWarpExit(moveDir) };
    }
    if (typeof rule === "number") return { to: rule, exit: this.applyWarpExit(moveDir) };
    if ("dir" in rule) {
      const to = rule.dir[entry] ?? rule.dir["*"];
      if (to === undefined) return null;
      return { to, exit: this.applyWarpExit(moveDir) };
    }
    if ("random" in rule) {
      const [lo, hi] = rule.random;
      return { to: lo + Math.floor(Math.random() * (hi - lo + 1)), exit: this.applyWarpExit(moveDir) };
    }
    if ("fanout" in rule) {
      const to = rule.fanout[String(warpee.pname)];
      if (to === undefined) return null; // seals/balls: VB crashed here
      return { to, exit: this.exitName(rule.exit, moveDir, warpee) };
    }
    if ("exitBy" in rule && "to" in rule) {
      return { to: rule.to, exit: this.exitName(this.exitForType(rule, warpee), moveDir, warpee) };
    }
    if ("to" in rule) {
      return { to: rule.to, exit: this.exitName(rule.exit, moveDir, warpee) };
    }
    return null;
  }

  private exitForType(rule: { exitBy: { seal: string; ball: string } }, warpee: Obj): string | undefined {
    if (warpee.type === SEAL) return rule.exitBy.seal;
    if (warpee.type === BALL) return rule.exitBy.ball;
    return undefined; // keep entry direction (VB `d = d`)
  }

  private exitName(
    exit: string | Record<string, string> | undefined, moveDir: Dir, _warpee: Obj,
  ): Dir {
    const entry = DIR_NAME[moveDir]!;
    if (exit === undefined || exit === "keep") return moveDir;
    if (exit === "entry") return moveDir;
    if (typeof exit === "string") {
      const idx = DIR_NAME.indexOf(exit as DirName);
      return (idx === -1 ? moveDir : idx) as Dir;
    }
    const mapped = exit[entry];
    if (mapped === undefined) return moveDir;
    const idx = DIR_NAME.indexOf(mapped as DirName);
    return (idx === -1 ? moveDir : idx) as Dir;
  }

  private applyWarpExit(moveDir: Dir): Dir {
    const flag = this.flags.warpExit;
    if (flag === undefined) return moveDir;
    if (typeof flag === "string") {
      const idx = DIR_NAME.indexOf(flag as DirName);
      return (idx === -1 ? moveDir : idx) as Dir;
    }
    const mapped = flag[DIR_NAME[moveDir]!];
    if (mapped === undefined) return moveDir;
    const idx = DIR_NAME.indexOf(mapped as DirName);
    return (idx === -1 ? moveDir : idx) as Dir;
  }

  private finishHome(idx: number): void {
    this.homeCount++;
    const letter = PENGUIN_LETTERS[idx] ?? "?";
    this.events.message(`${letter}idgel got to the ship.`);
    const po = this.byId(idx);
    po.visible = false;
    this.events.hudChanged();
    if (this.homeCount >= this.players) {
      this.clearLevel();
      this.finished = true;
      this.events.finished();
    }
  }

  /** Right-click inspect. */
  inspect(x: number, y: number): string {
    const names = ["penguin", "brick", "seal", "ball", "wood", "panel", "ladder", "water", "ship", "warp", "ship-lock", "enemy-lock", "arrow", "flippers", "bolt"];
    const here = this.objs.filter((o) => o.visible && o.x === x && o.y === y);
    if (!here.length) return "empty";
    return here.map((o) => names[o.type] ?? `?${o.type}`).join(" + ");
  }
}
