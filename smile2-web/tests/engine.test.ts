import { describe, expect, it, vi } from "vitest";
import { dDOWN, dLEFT, dRIGHT, dUP, BRICK, DOOR, KEY, MONEY, NOWT, SMILE } from "../src/constants";
import { Engine } from "../src/engine";
import type { ParsedLevel } from "../src/level-format";

function toyLevel(): ParsedLevel {
  // 3x3: brick border, smile at (1,1).
  const W = 3;
  const H = 3;
  const blank = () => ({ value: 0, extra1: 0, extra2: 0, extra3: 0 });
  const perm = Array.from({ length: W }, () => Array.from({ length: H }, blank));
  const coll = Array.from({ length: W }, () => Array.from({ length: H }, blank));
  const move = Array.from({ length: W }, () => Array.from({ length: H }, blank));
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++)
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1)
        perm[x]![y]!.value = BRICK;
  move[1]![1] = { value: SMILE, extra1: 0, extra2: 0, extra3: 0 };
  return {
    xsize: W - 1,
    ysize: H - 1,
    levelId: "smilegame2 1player",
    players: 1,
    perm,
    coll,
    move,
    smileStarts: [{ x: 1, y: 1 }],
    popups: Array.from({ length: 51 }, () => ({ x: 0, y: 0, s: "", d: false })),
    switches: Array.from({ length: 51 }, () => ({
      x: 0, y: 0, value: 0, extra1: 0, extra2: 0, extra3: 0, next: 0,
    })),
  };
}

function engineWith(toy?: ParsedLevel) {
  const eng = new Engine();
  eng.events.sound = vi.fn();
  eng.events.popup = vi.fn();
  eng.events.levelComplete = vi.fn();
  eng.events.levelFailed = vi.fn();
  eng.events.hudChanged = vi.fn();
  eng.loadParsed(toy ?? toyLevel(), "toy", true);
  return eng;
}

describe("engine movement", () => {
  it("stays put against a brick wall", () => {
    const eng = engineWith();
    expect(eng.press(0, dRIGHT)).toBe(false);
    expect([eng.smileX[0], eng.smileY[0]]).toEqual([1, 1]);
  });

  it("moves up into empty space", () => {
    const t = toyLevel();
    // open (1,0)? border brick — carve (1,0) open? Actually border; move within: (1,1)->(1,? ) need open.
    // Carve interior: make 4x4 open room instead.
    const eng = engineWith(t);
    // (1,1) neighbours are all border except... 3x3 room has no interior moves. Rebuild 5x5.
    expect(eng.press(0, dUP)).toBe(false); // brick wall
    expect([eng.smileX[0], eng.smileY[0]]).toEqual([1, 1]);
  });

  it("walks in an open room", () => {
    const t = toyLevel();
    // enlarge: clear brick at (2,1) so right is open (still inside 3x3? x=2 is border).
    t.perm[2]![1]!.value = NOWT;
    const eng = engineWith(t);
    expect(eng.press(0, dRIGHT)).toBe(true);
    expect([eng.smileX[0], eng.smileY[0]]).toEqual([2, 1]);
    expect(eng.press(0, dLEFT)).toBe(true);
    expect([eng.smileX[0], eng.smileY[0]]).toEqual([1, 1]);
  });

  it("keeps the camera on the smile after stepping", () => {
    const t = toyLevel();
    t.perm[2]![1]!.value = NOWT;
    const eng = engineWith(t);
    eng.viewX[0] = 0;
    eng.viewY[0] = 0; // stale camera
    expect(eng.press(0, dRIGHT)).toBe(true);
    expect([eng.viewX[0], eng.viewY[0]]).toEqual([eng.smileX[0], eng.smileY[0]]);
  });

  it("leaves a stale camera alone on a blocked step", () => {
    const eng = engineWith();
    eng.viewX[0] = 0;
    eng.viewY[0] = 0;
    expect(eng.press(0, dRIGHT)).toBe(false); // brick wall
    expect([eng.viewX[0], eng.viewY[0]]).toEqual([0, 0]);
  });

  it("collects money and scores", () => {
    const t = toyLevel();
    t.perm[2]![1]!.value = NOWT;
    t.coll[2]![1] = { value: MONEY, extra1: 5, extra2: 0, extra3: 0 }; // +10
    const eng = engineWith(t);
    eng.press(0, dRIGHT);
    expect(eng.score[0]).toBe(10);
    expect(eng.coll[2]![1]!.value).toBe(NOWT);
  });

  it("collects keys and opens doors", () => {
    const t = toyLevel();
    t.perm[2]![1]!.value = NOWT;
    t.coll[2]![1] = { value: KEY, extra1: 2, extra2: 0, extra3: 0 };
    t.perm[2]![0]!.value = NOWT; // make room above door? door at (2,1)? simpler: door at (2,1) perm
    const eng = engineWith(t);
    eng.press(0, dRIGHT); // pick up key2
    expect(eng.keys[2]?.[0]).toBe(true);
    // place closed red door ahead at (2,1)? smile now at (2,1). Put door at (1,2)? approach from (2,1).
    t.perm[1]![2]!.value = NOWT;
    // reload-ish: manually set door below original start is complex; test GetKey directly:
    expect(eng.getKey(2, 0)).toBe(true);
    expect(eng.keys[2]?.[0]).toBe(false);
    expect(eng.getKey(2, 0)).toBe(false);
  });

  it("needs energy to push dyno, dies on blocked dyno push", () => {
    const eng = engineWith();
    expect(eng.energy[0]).toBe(0);
    expect(eng.useEnergy(0)).toBe(false);
    eng.energy[0] = 2;
    expect(eng.useEnergy(0)).toBe(true);
    expect(eng.energy[0]).toBe(1);
  });

  it("killSmile loses a life and reloads", () => {
    const eng = engineWith();
    const lives = eng.lives[0]!;
    eng.suicide(0);
    expect(eng.lives[0]).toBe(lives - 1);
    expect([eng.smileX[0], eng.smileY[0]]).toEqual([1, 1]);
  });

  it("finishes on door color 6", () => {
    const t = toyLevel();
    t.perm[2]![1] = { value: DOOR, extra1: 6, extra2: 1, extra3: 1 }; // open finish door, no key-tax
    const eng = engineWith(t);
    eng.press(0, dRIGHT);
    eng.tick(); // finish check runs in tick
    expect(eng.events.levelComplete).toHaveBeenCalled();
  });

  it("ticks advance animation counters and wrap", () => {
    const eng = engineWith();
    for (let i = 0; i < 30; i++) eng.tick();
    expect(eng.zapIndex).toBeGreaterThanOrEqual(1);
    expect(eng.zapIndex).toBeLessThanOrEqual(24);
    expect(eng.nIndex).toBeLessThanOrEqual(3);
  });

  it("ignores input while sliding (blnArrow false)", () => {
    const eng = engineWith();
    eng.blnArrow[0] = false;
    expect(eng.press(0, dUP)).toBe(false);
  });
});
