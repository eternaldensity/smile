import { describe, expect, it, vi } from "vitest";
import {
  ARROW, BALL, BOLT, BRICK, DOWN, ELOCK, FLIPPERS, LADDER, LEFT,
  PANEL, PENGUIN, RIGHT, SEAL, SHIP, SLOCK, UP, WARP, WATER, WOOD,
} from "../src/constants";
import { Engine } from "../src/engine";
import type { LevelData } from "../src/levels";

let nextId = 0;
function obj(
  type: number, x: number, y: number,
  extra?: Partial<{ id: number; pname: number; dir: number; visible: boolean }>,
) {
  const id = extra?.id ?? nextId++;
  return {
    id, type, pname: extra?.pname ?? 0, x, y,
    visible: extra?.visible ?? true, dir: (extra?.dir ?? 0) as 0 | 1 | 2 | 3,
  };
}

function toy(objects: ReturnType<typeof obj>[], extra?: Partial<LevelData>): LevelData {
  return {
    level: 0, sealMs: 200, objects, warps: {},
    flags: { sealMs: 200, ...(extra?.flags ?? {}) },
    ...(extra ?? {}),
  };
}

function engineWith(lv: LevelData) {
  const eng = new Engine();
  eng.events.sound = vi.fn();
  eng.events.message = vi.fn();
  eng.events.finished = vi.fn();
  eng.events.hudChanged = vi.fn();
  eng.load(lv, 0);
  return eng;
}

/** Open bordered room with penguin 0 at (5,5) and a brick floor at y=6. */
function room(): ReturnType<typeof obj>[] {
  nextId = 0;
  const objs = [obj(PENGUIN, 5, 5, { id: 0, pname: 1 })];
  for (let i = 0; i < 12; i++) {
    objs.push(obj(BRICK, i, 0), obj(BRICK, i, 11), obj(BRICK, 0, i), obj(BRICK, 11, i));
  }
  for (let x = 1; x <= 10; x++) objs.push(obj(BRICK, x, 6));
  return objs;
}

describe("engine mechanics", () => {
  it("steps one cell per keypress into empty space", () => {
    const eng = engineWith(toy(room()));
    eng.key(0, RIGHT);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([6, 5]);
    eng.key(0, RIGHT);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([7, 5]);
  });

  it("stops at brick walls", () => {
    const objs = room();
    objs.push(obj(BRICK, 5, 4));
    const eng = engineWith(toy(objs));
    eng.key(0, UP);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([5, 5]);
  });

  it("penguins break wood but are stopped", () => {
    const objs = room();
    const wood = obj(WOOD, 6, 5);
    objs.push(wood);
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT);
    expect(eng.byId(wood.id).visible).toBe(false);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([5, 5]);
    expect(eng.events.sound).toHaveBeenCalledWith("bang");
  });

  it("seals break panels, penguins are blocked by them", () => {
    const objs = room();
    const panel = obj(PANEL, 6, 5);
    objs.push(panel);
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT);
    expect(eng.byId(panel.id).visible).toBe(true);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([5, 5]);
  });

  it("water drowns without flippers", () => {
    const objs = room();
    objs.push(obj(WATER, 6, 5));
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT);
    expect(eng.events.sound).toHaveBeenCalledWith("splash");
    eng.tick(250);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([5, 5]); // reset home
  });

  it("flippers grant 20 safe water moves", () => {
    const objs = room();
    objs.push(obj(FLIPPERS, 6, 5), obj(WATER, 7, 5), obj(WATER, 8, 5));
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT);
    expect(eng.byId(0).flippers).toBe(19); // 20 minus the post-move burn
    eng.key(0, RIGHT); // onto water, survives, burns one
    expect(eng.byId(0).visible).toBe(true);
    expect(eng.byId(0).flippers).toBe(18);
  });

  it("locks filter by type", () => {
    const objs = room();
    objs.push(obj(ELOCK, 6, 5), obj(SLOCK, 8, 5));
    objs.push(obj(LADDER, 6, 6), obj(LADDER, 7, 6));
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([6, 5]); // elock passes penguin
    eng.key(0, RIGHT);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([7, 5]);
    eng.key(0, RIGHT);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([7, 5]); // slock blocks penguin
  });

  it("side contact with a seal kills, stomping kills the seal", () => {
    const objs = room();
    const seal = obj(SEAL, 6, 5, { dir: LEFT });
    objs.push(seal);
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT); // walk into the seal: penguin dies, level resets
    expect(eng.events.sound).toHaveBeenCalledWith("thump");
    eng.tick(250);
    expect(eng.byId(seal.id).visible).toBe(false); // reserve seal hides on reset
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([5, 5]);
  });

  it("balls squash seals that cannot be pushed aside", () => {
    const objs = room();
    const ball = obj(BALL, 6, 5);
    const seal = obj(SEAL, 7, 5, { dir: LEFT });
    objs.push(ball, seal, obj(BRICK, 8, 5)); // seal boxed in
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT); // push the ball onto the trapped seal
    expect(eng.byId(seal.id).visible).toBe(false);
    expect([eng.byId(ball.id).x, eng.byId(ball.id).y]).toEqual([7, 5]);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([6, 5]);
  });

  it("gravity drops penguins without ladders", () => {
    const eng = engineWith(toy(room()));
    eng.key(0, RIGHT); // step then fall
    expect(eng.byId(0).y).toBeGreaterThanOrEqual(5);
  });

  it("ladders hold penguins", () => {
    const objs = room();
    objs.push(obj(LADDER, 6, 6));
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT);
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([6, 5]); // stays, no fall
  });

  it("collecting the last bolt reveals the ship", () => {
    const objs = room();
    const bolt = obj(BOLT, 6, 5);
    const ship = obj(SHIP, 9, 9, { visible: false });
    objs.push(bolt, ship);
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT);
    expect(eng.byId(bolt.id).visible).toBe(false);
    expect(eng.byId(ship.id).visible).toBe(true);
  });

  it("bringing penguins home finishes", () => {
    const objs = room();
    const ship = obj(SHIP, 6, 5);
    objs.push(ship);
    const eng = engineWith(toy(objs));
    eng.players = 1;
    eng.key(0, RIGHT);
    expect(eng.events.message).toHaveBeenCalledWith("Zidgel got to the ship.");
    expect(eng.finished).toBe(true);
    expect(eng.events.finished).toHaveBeenCalled();
  });

  it("arrows convey and spawn seals", () => {
    const objs = room();
    const arrow = obj(ARROW, 6, 5, { dir: DOWN });
    const pool = obj(SEAL, 6, 5, { visible: false });
    objs.push(arrow, pool, obj(BRICK, 6, 4)); // pin the spawn area
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT); // steps on, redirected down, conveyed one more
    expect(eng.byId(0).dir).toBe(DOWN);
    for (let i = 0; i < 6; i++) eng.tick(200);
    expect(eng.byId(pool.id).visible).toBe(true); // spawned
    expect(eng.events.sound).toHaveBeenCalledWith("beep");
  });

  it("warps teleport by index map", () => {
    const objs = room();
    const w1 = obj(WARP, 6, 5);
    const w2 = obj(WARP, 9, 9);
    objs.push(w1, w2);
    const eng = engineWith(toy(objs, { warps: { [w1.id]: w2.id, [w2.id]: w1.id } }));
    eng.key(0, RIGHT);
    // Teleports to (9,9), keeps sliding right, then gravity takes one step.
    expect([eng.byId(0).x, eng.byId(0).y]).toEqual([10, 10]);
    expect(eng.events.sound).toHaveBeenCalledWith("warp");
  });

  it("seals reverse on walls each tick", () => {
    const objs = room();
    const seal = obj(SEAL, 1, 5, { dir: LEFT });
    objs.push(seal);
    const eng = engineWith(toy(objs));
    eng.key(0, RIGHT); // start the seal timer
    eng.tick(200);
    expect(eng.byId(seal.id).dir).toBe(RIGHT);
  });
});
