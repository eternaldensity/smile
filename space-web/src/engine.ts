import {
  ARROW, BOUNCE, BRICK, DOOR, ELOCK, ENEMY, MAGNET, METAL, PANEL, ROOF,
  SHIP, SLOCK, WARP, WOOD,
  DEATH_PAUSE_MS, DIR_NAME, ENEMY_MS, MAGNET_MS, SHIP_MS, oppositeDir,
  type Dir, type DirName,
} from "./constants";
import type { LevelData, WarpRule } from "./levels";

export type SoundName =
  | "bang" | "thump" | "warp" | "wall" | "ecrash"
  | "skid" | "start" | "finish" | "magnet" | "beep";

export type SoundSink = (name: SoundName) => void;

export interface Obj {
  id: number;
  type: number;
  x: number;
  y: number;
  dir: Dir;
  visible: boolean;
  home: { x: number; y: number };
  overroof: boolean;
  /** Explosion shown (ship only, during the death pause). */
  bang: boolean;
}

export interface EngineEvents {
  sound: SoundSink;
  message: (text: string) => void;
  /** Ship reached the door. */
  finished: () => void;
}

const noop = (): EngineEvents => ({ sound: () => {}, message: () => {}, finished: () => {} });

/**
 * Faithful port of the per-level VB6 logic (levelN.frm code template).
 *
 * Deviations (documented, sensible):
 * - MsgBox popups become message() events; the death Pause() busy-wait is a
 *   250ms sim pause instead of freezing the thread.
 * - Unmapped warps are no-ops (VB would crash with error 91; every shipped
 *   warp is mapped, so this never triggers in practice).
 * - Recursion in push chains is depth-guarded.
 * - Password/random-level/hidden-form UI from Main.frm is not ported
 *   (the random picker could even crash VB with Level(0)=Nothing);
 *   level select 1-16 + auto-advance covers it.
 */
export class Engine {
  objs: Obj[] = [];
  warps: Record<string, WarpRule> = {};
  levelNum = 1;
  inputLocked = false;
  finished = false;

  private shipRunning = false;
  private enemyRunning = false;
  private haltAfterTick = false;
  private magnetMs = 0;
  private pauseMs = 0;
  private pendingReset = false;
  private spawnCount = 0;
  private swapCount = 0;
  private shipAcc = 0;
  private enemyAcc = 0;
  private moveDepth = 0;

  events: EngineEvents = noop();

  byId(id: number): Obj {
    const o = this.objs.find((ob) => ob.id === id);
    if (!o) throw new Error(`object ${id} missing`);
    return o;
  }

  get ship(): Obj {
    return this.byId(0);
  }

  load(data: LevelData, levelNum: number): void {
    this.objs = data.objects.map((o) => ({
      id: o.id,
      type: o.type,
      x: o.x,
      y: o.y,
      dir: o.dir,
      visible: o.visible,
      home: { x: o.x, y: o.y },
      overroof: false,
      bang: false,
    }));
    this.warps = data.warps;
    this.levelNum = levelNum;
    this.inputLocked = false;
    this.finished = false;
    this.shipRunning = false;
    this.enemyRunning = false;
    this.haltAfterTick = false;
    this.magnetMs = 0;
    this.pauseMs = 0;
    this.pendingReset = false;
    this.spawnCount = 0;
    this.swapCount = 0;
    this.shipAcc = 0;
    this.enemyAcc = 0;
  }

  /** Arrow key: steer the ship (it keeps sliding until blocked). */
  steer(dir: Dir): void {
    if (this.inputLocked || this.finished) return;
    this.enemyRunning = true;
    this.shipRunning = true;
    this.ship.dir = dir;
  }

  get running(): boolean {
    return this.shipRunning || this.enemyRunning;
  }

  tick(dtMs: number): void {
    if (this.finished) return;
    if (this.pauseMs > 0) {
      this.pauseMs -= dtMs;
      if (this.pauseMs <= 0 && this.pendingReset) {
        this.pendingReset = false;
        this.doReset();
      }
      return;
    }
    if (this.magnetMs > 0) {
      this.magnetMs -= dtMs;
      if (this.magnetMs <= 0) {
        this.inputLocked = false;
        this.shipRunning = false;
        this.events.sound("magnet");
      }
    }
    if (this.shipRunning) {
      this.shipAcc += dtMs;
      while (this.shipAcc >= SHIP_MS) {
        this.shipAcc -= SHIP_MS;
        this.shipStep();
        if (!this.shipRunning) {
          this.shipAcc = 0;
          break;
        }
      }
    }
    if (this.enemyRunning) {
      this.enemyAcc += dtMs;
      while (this.enemyAcc >= ENEMY_MS) {
        this.enemyAcc -= ENEMY_MS;
        this.enemyStep();
      }
    }
  }

  private shipStep(): void {
    this.inputLocked = false;
    const ok = this.moveObjectCheck(0, this.ship.dir);
    this.shipRunning = ok;
    if (!this.haltAfterTick) return;
    // Magnet aftermath: halt until the next keypress (tmrMagnet_Timer).
    this.shipRunning = false;
    this.haltAfterTick = false;
  }

  private enemyStep(): void {
    for (const e of this.objs) {
      if (!e.visible || e.type !== ENEMY) continue;
      for (let w = 0; w <= 10; w++) {
        if (this.moveObjectCheck(e.id, e.dir)) break;
        e.dir = Math.floor(Math.random() * 4) as Dir;
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
      for (const o of this.objs) {
        if (o.type === ARROW) o.dir = Math.floor(Math.random() * 4) as Dir;
      }
    }
  }

  private spawnPass(): void {
    for (const m of this.objs) {
      if (m.type !== ARROW || !m.visible) continue;
      const e = this.objs.find(
        (o) => !o.visible && o.type === ENEMY && o.x === m.x && o.y === m.y,
      );
      if (e) {
        e.dir = m.dir;
        e.visible = true;
        this.events.sound("beep");
      }
    }
  }

  /** MoveObjectCheck port. Moves the object on success. */
  moveObjectCheck(id: number, dir: Dir): boolean {
    if (this.moveDepth > 64) return false;
    this.moveDepth++;
    try {
      const mover = this.byId(id);
      // Edge of screen (+ roof trapdoor).
      if (dir === 0 && mover.x === 0) return this.bump(mover);
      if (dir === 1 && mover.x === 11) return this.bump(mover);
      if (dir === 2 && mover.y === 0) return this.bump(mover);
      if (dir === 3) {
        if (mover.y === 11) return this.bump(mover);
        if (mover.overroof) return this.bump(mover);
      }
      for (const o of this.objs) {
        if (!o.visible || o.id === id) continue;
        if (!adjacent(mover, o, dir)) continue;
        if (!this.objectTypeCheck(mover, o, dir)) return false;
      }
      mover.x += dx(dir);
      mover.y += dy(dir);
      this.bangsCheck(id, dir);
      return true;
    } finally {
      this.moveDepth--;
    }
  }

  private bump(mover: Obj): boolean {
    if (mover.type === SHIP) this.events.sound("wall");
    return false;
  }

  private objectTypeCheck(a: Obj, b: Obj, dir: Dir): boolean {
    switch (b.type) {
      case DOOR:
        return true; // VB `If A = ship Or enemy` is always true; doors pass all.
      case ENEMY:
        if (a.type === ENEMY) {
          if (a.dir === b.dir) {
            return this.moveObjectCheck(b.id, dir);
          } else if (a.dir === oppositeDir(b.dir)) {
            a.dir = oppositeDir(a.dir);
            b.dir = oppositeDir(b.dir);
            this.events.sound("ecrash");
            this.moveObjectCheck(a.id, oppositeDir(dir));
            return false;
          }
          this.events.sound("ecrash");
          return false;
        } else if (a.type === SHIP) {
          return this.moveObjectCheck(b.id, dir);
        }
        return false;
      case SHIP:
        return true;
      case BRICK:
        if (a.type === SHIP) this.events.sound("wall");
        return false;
      case METAL:
        if (a.type === SHIP || a.type === ENEMY) {
          this.bangActor(a, "t");
          return false;
        }
        return true;
      case WOOD:
        if (a.type === ENEMY) return false;
        b.visible = false;
        this.events.sound("bang");
        return false;
      case PANEL:
        if (a.type === SHIP) {
          this.events.sound("wall");
          return false;
        } else if (a.type === ENEMY) {
          b.visible = false;
          this.events.sound("bang");
          return false;
        }
        return true;
      case BOUNCE:
        a.dir = oppositeDir(a.dir);
        if (a.type === SHIP) this.inputLocked = true;
        return true;
      case SLOCK:
        if (a.type === SHIP) {
          this.events.sound("wall");
          return false;
        } else if (a.type === ENEMY) {
          return true;
        }
        return true;
      case ELOCK:
        if (a.type === ENEMY) return false;
        else if (a.type === SHIP) return true;
        return true;
      case ROOF:
        if (dir === 2) return false;
        return true;
      default:
        // Arrow, warp, magnet: pass through; BangsCheck handles the effect.
        return true;
    }
  }

  /** BangActor = MBang("t") for ship/enemy: thump + death handling. */
  private bangActor(a: Obj, special: "t"): void {
    if (a.type === ENEMY) {
      a.visible = false;
      this.events.sound("thump");
      return;
    }
    if (a.type === SHIP) {
      this.events.sound(special === "t" ? "thump" : "bang");
      this.startDeath();
    }
  }

  private startDeath(): void {
    const s = this.ship;
    s.bang = true;
    this.pauseMs = DEATH_PAUSE_MS;
    this.pendingReset = true;
  }

  private doReset(): void {
    for (const o of this.objs) {
      if (o.id === 0) continue;
      o.x = o.home.x;
      o.y = o.home.y;
      o.bang = false;
      o.visible = o.type !== ENEMY;
    }
    const s = this.ship;
    s.x = s.home.x;
    s.y = s.home.y;
    s.bang = false;
    s.visible = true;
    s.overroof = false;
    this.shipRunning = false;
    this.enemyRunning = false;
    this.inputLocked = false;
    this.haltAfterTick = false;
    this.magnetMs = 0;
  }

  private bangsCheck(id: number, dir: Dir): void {
    const mb = this.byId(id);
    mb.overroof = false;
    for (const gb of this.objs) {
      if (!mb.visible || !gb.visible || gb.id === id) continue;
      if (gb.x !== mb.x || gb.y !== mb.y) continue;
      if (gb.type === ENEMY) {
        if (mb.type === SHIP) {
          gb.visible = false;
          this.events.sound("thump");
          this.startDeath();
          return;
        }
      } else if (gb.type === DOOR) {
        if (mb.type === SHIP) {
          this.finish();
          return;
        }
      } else if (gb.type === SHIP) {
        if (mb.type === ENEMY) {
          mb.visible = false;
          this.events.sound("thump");
          this.startDeath();
          return;
        }
      } else if (gb.type === WARP) {
        this.warpTeleport(gb.id, mb.id, dir);
        return;
      } else if (gb.type === ARROW) {
        mb.dir = gb.dir;
        if (mb.type === SHIP) {
          this.inputLocked = true;
          this.events.sound("skid");
        }
        return;
      } else if (gb.type === MAGNET) {
        if (mb.type === SHIP) {
          this.haltAfterTick = true;
          this.inputLocked = true;
          this.events.sound("warp");
          this.magnetMs = MAGNET_MS;
        }
      }
      if (gb.type === ROOF) mb.overroof = true;
    }
  }

  private warpTeleport(warperId: number, warpeeId: number, moveDir: Dir): void {
    const rule = this.warps[String(warperId)];
    if (rule === undefined) return; // unmapped warp: no-op (VB would crash)
    const warpee = this.byId(warpeeId);
    const place = (targetId: number) => {
      const t = this.byId(targetId);
      warpee.x = t.x;
      warpee.y = t.y;
      if (warpee.id === 0) this.inputLocked = true;
      if (warpee.type === SHIP) this.events.sound("warp");
    };
    if (typeof rule === "number") {
      place(rule);
    } else if ("dir" in rule) {
      const name: DirName = DIR_NAME[moveDir]!;
      place(rule.dir[name] ?? rule.dir["*"]!);
    } else if ("warpee" in rule) {
      place(warpee.type === ENEMY ? rule.warpee.enemy : rule.warpee["*"]!);
    } else if ("enemiesOnly" in rule) {
      if (warpee.type === SHIP) return; // VB Exit Sub: ships pass through
      place(rule.enemiesOnly);
    } else {
      // L15 one-way gates.
      const pass = rule.bounce.pass as DirName;
      if (DIR_NAME[moveDir] === pass) {
        place(rule.bounce.other);
      } else {
        warpee.dir = oppositeDir(moveDir);
        if (warpee.id === 0) this.inputLocked = true;
        if (warpee.type === SHIP) this.events.sound("warp");
      }
    }
  }

  private finish(): void {
    this.events.sound("finish");
    this.events.message(`Space ship 0 got to the finish.`);
    this.finished = true;
    this.events.finished();
  }

  /** Right-click inspect (VB had none; describes the cell like the smile games). */
  inspect(x: number, y: number): string {
    const names = ["ship", "enemy", "brick", "wood", "panel", "bounce", "metal", "door", "warp", "ship-lock", "enemy-lock", "arrow", "roof", "magnet"];
    const here = this.objs.filter((o) => o.visible && o.x === x && o.y === y);
    if (!here.length) return "empty space";
    return here.map((o) => names[o.type] ?? `?${o.type}`).join(" + ");
  }
}

function adjacent(mover: Obj, o: Obj, dir: Dir): boolean {
  switch (dir) {
    case 0:
      return mover.x === o.x + 1 && mover.y === o.y;
    case 1:
      return mover.x === o.x - 1 && mover.y === o.y;
    case 2:
      return mover.x === o.x && mover.y === o.y + 1;
    case 3:
      return mover.x === o.x && mover.y === o.y - 1;
  }
}

function dx(dir: Dir): number {
  return dir === 0 ? -1 : dir === 1 ? 1 : 0;
}

function dy(dir: Dir): number {
  return dir === 2 ? -1 : dir === 3 ? 1 : 0;
}
