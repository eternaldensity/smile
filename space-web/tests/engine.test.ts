import { describe, expect, it, vi } from "vitest";
import {
  ARROW, BOUNCE, BRICK, DOOR, ELOCK, ENEMY, MAGNET, METAL, PANEL,
  ROOF, SHIP, SLOCK, WARP, WOOD,
  DOWN, LEFT, RIGHT, UP,
} from "../src/constants";
import { Engine } from "../src/engine";
import type { LevelData } from "../src/levels";

let nextId = 0;
function obj(type: number, x: number, y: number, extra?: Partial<{ dir: number; visible: boolean }>) {
  return { id: nextId++, type, x, y, visible: extra?.visible ?? true, dir: (extra?.dir ?? 0) as 0 | 1 | 2 | 3 };
}

function toy(objects: ReturnType<typeof obj>[], warps: LevelData["warps"] = {}): LevelData {
  return { level: 0, objects, warps };
}

function engineWith(lv: LevelData) {
  const eng = new Engine();
  eng.events.sound = vi.fn();
  eng.events.message = vi.fn();
  eng.events.finished = vi.fn();
  eng.load(lv, 0);
  return eng;
}

function room(): ReturnType<typeof obj>[] {
  nextId = 0;
  const objs = [obj(SHIP, 5, 5)];
  for (let i = 0; i < 12; i++) {
    objs.push(obj(BRICK, i, 0), obj(BRICK, i, 11), obj(BRICK, 0, i), obj(BRICK, 11, i));
  }
  return objs;
}

describe("engine mechanics", () => {
  it("slides until blocked by a wall", () => {
    const eng = engineWith(toy(room()));
    eng.steer(RIGHT);
    for (let i = 0; i < 20; i++) eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([10, 5]);
    for (let i = 0; i < 10; i++) eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([10, 5]); // halted, goes nowhere
  });

  it("first keypress starts the ship", () => {
    const eng = engineWith(toy(room()));
    expect(eng.running).toBe(false);
    eng.steer(UP);
    expect(eng.running).toBe(true);
  });

  it("ship eats wood but is stopped", () => {
    const objs = room();
    objs.push(obj(WOOD, 6, 5));
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect(eng.byId(objs[objs.length - 1]!.id).visible).toBe(false);
    expect([eng.ship.x, eng.ship.y]).toEqual([5, 5]);
  });

  it("panel blocks the ship with a wall sound", () => {
    const objs = room();
    objs.push(obj(PANEL, 6, 5));
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([5, 5]);
    expect(eng.events.sound).toHaveBeenCalledWith("wall");
  });

  it("enemy eats panels", () => {
    const objs = room();
    const panel = obj(PANEL, 6, 5);
    objs.push(panel);
    const enemy = obj(ENEMY, 7, 5, { dir: LEFT });
    objs.push(enemy);
    const eng = engineWith(toy(objs));
    eng.steer(UP); // start the timers; ship slides away harmlessly
    eng.tick(200);
    expect(eng.byId(panel.id).visible).toBe(false);
  });

  it("bounce reverses and locks input briefly", () => {
    const objs = room();
    objs.push(obj(BOUNCE, 6, 5));
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([6, 5]);
    expect(eng.ship.dir).toBe(LEFT);
    expect(eng.inputLocked).toBe(true); // bounce locks until the next ship tick
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([5, 5]);
    expect(eng.inputLocked).toBe(false);
  });

  it("locks filter by type", () => {
    const objs = room();
    const sl = obj(SLOCK, 6, 5);
    const el = obj(ELOCK, 6, 6);
    objs.push(sl, el);
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([5, 5]); // slock blocks ship
    eng.steer(DOWN);
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([5, 6]); // elock passes ship
  });

  it("roof blocks upward entry", () => {
    const objs = room();
    objs.push(obj(ROOF, 5, 4));
    const eng = engineWith(toy(objs));
    eng.steer(UP);
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([5, 5]);
  });

  it("metal kills and resets after a pause", () => {
    const objs = room();
    objs.push(obj(METAL, 6, 5));
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect(eng.ship.bang).toBe(true);
    expect(eng.events.sound).toHaveBeenCalledWith("thump");
    eng.tick(250);
    expect(eng.ship.bang).toBe(false);
    expect([eng.ship.x, eng.ship.y]).toEqual([5, 5]);
    expect(eng.running).toBe(false);
  });

  it("warps teleport by index map", () => {
    const objs = room();
    const w1 = obj(WARP, 6, 5);
    const w2 = obj(WARP, 9, 9);
    objs.push(w1, w2);
    const eng = engineWith(toy(objs, { [w1.id]: w2.id, [w2.id]: w1.id }));
    eng.steer(RIGHT);
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([9, 9]);
    expect(eng.events.sound).toHaveBeenCalledWith("warp");
  });

  it("arrows redirect and spawn enemies", () => {
    const objs = room();
    const arrow = obj(ARROW, 6, 5, { dir: DOWN });
    const pool = obj(ENEMY, 6, 5, { visible: false });
    objs.push(arrow, pool);
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect(eng.ship.dir).toBe(DOWN); // redirected
    for (let i = 0; i < 6; i++) eng.tick(200);
    expect(eng.byId(pool.id).visible).toBe(true); // spawned
  });

  it("reaching the door finishes", () => {
    const objs = room();
    objs.push(obj(DOOR, 6, 5));
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect(eng.finished).toBe(true);
    expect(eng.events.finished).toHaveBeenCalled();
  });

  it("enemy contact kills the ship", () => {
    const objs = room();
    // Box the ship in so it stays put while the enemy walks in.
    objs.push(obj(BRICK, 4, 5), obj(BRICK, 6, 5), obj(BRICK, 5, 4));
    const enemy = obj(ENEMY, 5, 6, { dir: UP });
    objs.push(enemy);
    const eng = engineWith(toy(objs));
    eng.steer(UP); // blocked by brick; ship stays, timers run
    eng.tick(200);
    expect(eng.ship.bang).toBe(true);
  });

  it("magnet locks input for a second, then halts the ship", () => {
    const objs = room();
    objs.push(obj(MAGNET, 6, 5));
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([6, 5]);
    expect(eng.inputLocked).toBe(true);
    eng.tick(800);
    expect(eng.inputLocked).toBe(true); // still stunned
    expect([eng.ship.x, eng.ship.y]).toEqual([6, 5]);
    eng.tick(200); // magnet timer fires
    expect(eng.inputLocked).toBe(false);
    expect(eng.events.sound).toHaveBeenCalledWith("magnet");
    expect([eng.ship.x, eng.ship.y]).toEqual([6, 5]); // halted until next key
  });

  it("ship pushes enemies", () => {
    const objs = room();
    const enemy = obj(ENEMY, 6, 5, { dir: RIGHT });
    objs.push(enemy);
    const eng = engineWith(toy(objs));
    eng.steer(RIGHT);
    eng.tick(100);
    expect([eng.ship.x, eng.ship.y]).toEqual([6, 5]);
    expect([eng.byId(enemy.id).x, eng.byId(enemy.id).y]).toEqual([7, 5]);
  });
});
