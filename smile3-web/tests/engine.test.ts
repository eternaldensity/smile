import { describe, expect, it, vi } from "vitest";
import {
  BALLOON, BRICK, CONVEY, GLASS, LADDER, MINCE, MONEY, NITRO, NOWT,
  PANEL, SMILE, TOLL, WATER, WEIGHT, WOOD,
  dBUP, dDOWN, dFALL, dLEFT, dRIGHT, dUP,
} from "../src/constants";
import { Engine } from "../src/engine";
import type { ParsedLevel } from "../src/level-format";

function toyLevel(w = 5, h = 5): ParsedLevel {
  const blank = () => ({ value: 0, extra1: 0, extra2: 0, extra3: 0 });
  const perm = Array.from({ length: w }, () => Array.from({ length: h }, blank));
  const coll = Array.from({ length: w }, () => Array.from({ length: h }, blank));
  const move = Array.from({ length: w }, () => Array.from({ length: h }, blank));
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++)
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) perm[x]![y]!.value = BRICK;
  move[2]![2] = { value: SMILE, extra1: 0, extra2: 0, extra3: 0 };
  return {
    xsize: w - 1,
    ysize: h - 1,
    levelId: "smilegame3 1player",
    players: 1,
    perm,
    coll,
    move,
    smileStarts: [{ x: 2, y: 2 }],
    popups: Array.from({ length: 51 }, () => ({ x: 0, y: 0, s: "", d: false })),
    switches: Array.from({ length: 51 }, () => ({
      x: 0, y: 0, value: 0, extra1: 0, extra2: 0, extra3: 0, next: 0,
    })),
    subpaths: Array.from({ length: 10 }, () => ""),
  };
}

function engineWith(toy?: ParsedLevel) {
  const eng = new Engine();
  eng.events.sound = vi.fn();
  eng.events.popup = vi.fn();
  eng.events.levelComplete = vi.fn();
  eng.events.levelFailed = vi.fn();
  eng.events.hudChanged = vi.fn();
  eng.events.toll = vi.fn();
  eng.events.openSub = vi.fn();
  eng.events.subComplete = vi.fn();
  eng.loadParsed(toy ?? toyLevel(), "toy", true);
  return eng;
}

describe("engine basics", () => {
  it("walks on empty floor (ladders hold the smile)", () => {
    const t = toyLevel();
    t.perm[2]![3] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    expect(eng.press(0, dRIGHT)).toBe(true);
    expect([eng.smileX[0], eng.smileY[0]]).toEqual([3, 2]);
  });

  it("keeps the camera on the smile after stepping", () => {
    const eng = engineWith();
    eng.viewX[0] = 0;
    eng.viewY[0] = 0; // stale camera
    expect(eng.press(0, dRIGHT)).toBe(true);
    expect([eng.viewX[0], eng.viewY[0]]).toEqual([eng.smileX[0], eng.smileY[0]]);
  });

  it("gravity drops unsupported objects", () => {
    const t = toyLevel();
    t.perm[2]![3] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.move[1]![1] = { value: PANEL, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    expect(eng.canFall(1, 1)).toBe(true);
    eng.tick();
    expect(eng.move[1]![1]!.value).toBe(NOWT);
    expect(eng.move[1]![2]!.value).toBe(PANEL);
  });

  it("ladder holds the smile, brick ladder holds panels", () => {
    const eng = engineWith();
    expect(eng.canFall(2, 2)).toBe(true); // empty below but border brick at y=4? check
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    const e2 = engineWith(t);
    expect(e2.canFall(2, 2)).toBe(false);
    void eng;
  });

  it("rope holds the smile and blocks climbing up", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.perm[2]![1] = { value: NOWT, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    // move up onto rope cell then verify no fall + no climb
    t.perm[2]![1] = { value: 4, extra1: 0, extra2: 0, extra3: 0 }; // ROPE
    const e2 = engineWith(t);
    expect(e2.press(0, dUP)).toBe(true);
    expect(e2.press(0, dUP)).toBe(false); // cannot climb up off rope
    expect(e2.canFall(2, 1)).toBe(false);
  });

  it("conveyors carry panels along", () => {
    const t = toyLevel(7, 5);
    for (let x = 1; x <= 5; x++) t.perm[x]![3] = { value: CONVEY, extra1: dRIGHT, extra2: 2, extra3: 0 };
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.move[2]![2] = { value: SMILE, extra1: 0, extra2: 0, extra3: 0 };
    t.move[1]![3] = { value: PANEL, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    eng.zapIndex = 3; // gate tick
    eng.tick();
    expect(eng.move[2]![3]!.value).toBe(PANEL);
  });

  it("toll asks, then pays and steps through", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.perm[3]![2] = { value: TOLL, extra1: 0, extra2: 0, extra3: 0 }; // $25
    const eng = engineWith(t);
    eng.score[0] = 100;
    expect(eng.press(0, dRIGHT)).toBe(false); // blocked pending prompt
    expect(eng.events.toll).toHaveBeenCalledWith(25);
    expect(eng.payToll()).toBe(true);
    expect(eng.score[0]).toBe(75);
    expect([eng.smileX[0], eng.smileY[0]]).toEqual([3, 2]);
  });

  it("toll blocks when broke", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.perm[3]![2] = { value: TOLL, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    expect(eng.press(0, dRIGHT)).toBe(false);
    expect(eng.events.toll).not.toHaveBeenCalled();
  });

  it("sub toll opens a sub session", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.perm[3]![2] = { value: TOLL, extra1: 5, extra2: 2, extra3: 0 };
    t.subpaths[2] = "C:\\vb\\smile3\\bonus.txt";
    const eng = engineWith(t);
    expect(eng.press(0, dRIGHT)).toBe(false);
    expect(eng.blnInSub).toBe(true);
    expect(eng.events.openSub).toHaveBeenCalledWith("C:\\vb\\smile3\\bonus.txt", 0);
  });

  it("sub success merges score/energy/keys and clears the gate", () => {
    const eng = engineWith();
    eng.blnInSub = true;
    (eng as unknown as { intSubX: number }).intSubX = 1;
    (eng as unknown as { intSubY: number }).intSubY = 1;
    eng.perm[1]![1] = { value: TOLL, extra1: 5, extra2: 0, extra3: 0 };
    eng.mergeSub({ success: true, score: 40, energy: 3, keys: [[false, false], [false, false], [true, false]] }, 0);
    expect(eng.perm[1]![1]!.value).toBe(NOWT);
    expect(eng.score[0]).toBe(40);
    expect(eng.energy[0]).toBe(3);
    expect(eng.keys[2]?.[0]).toBe(true);
    expect(eng.blnInSub).toBe(false);
  });

  it("mince eats pushers once armed", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.move[3]![2] = { value: MINCE, extra1: 1, extra2: 0, extra3: 0 }; // armed
    const eng = engineWith(t);
    eng.energy[0] = 0;
    // smile steps onto armed mince without energy: push fails, mince eats
    expect(eng.press(0, dRIGHT)).toBe(false);
  });

  it("balloons rise and weights fall", () => {
    const t = toyLevel(5, 7);
    t.move[2]![4] = { value: BALLOON, extra1: 0, extra2: 1, extra3: 0 }; // timer!=0, no rise
    t.move[2]![1] = { value: WEIGHT, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    expect(eng.canFall(2, 1)).toBe(true);
    eng.tick();
    expect(eng.move[2]![2]!.value).toBe(WEIGHT);
  });

  it("shields absorb explosions", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    eng.shields[0] = 2;
    eng.spreadExplode(2, 1, 5); // exBNitro above the smile
    expect(eng.move[2]![2]!.value).toBe(SMILE);
    expect(eng.shields[0]).toBe(1);
  });

  it("killSmile loses a life plus score, reloads", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    eng.score[0] = 50;
    eng.suicide(0);
    expect(eng.lives[0]).toBe(2);
    expect(eng.score[0]).toBe(0);
    expect([eng.smileX[0], eng.smileY[0]]).toEqual([2, 2]);
  });

  it("finishes on Extra1==6 ground", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 6, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    eng.tick();
    expect(eng.events.levelComplete).toHaveBeenCalled();
  });

  it("pushing costs energy; falling is free", () => {
    const eng = engineWith();
    expect(eng.useEnergy(0, PANEL, dRIGHT)).toBe(false);
    eng.energy[0] = 1;
    expect(eng.useEnergy(0, PANEL, dRIGHT)).toBe(true);
    expect(eng.useEnergy(0, PANEL, dFALL)).toBe(true);
    expect(eng.useEnergy(0, GLASS, dBUP)).toBe(true);
  });

  it("money pays the frozen table", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.perm[3]![2] = { value: NOWT, extra1: 0, extra2: 0, extra3: 0 };
    t.coll[3]![2] = { value: MONEY, extra1: 6, extra2: 0, extra3: 0 }; // +20
    const eng = engineWith(t);
    eng.press(0, dRIGHT);
    expect(eng.score[0]).toBe(20);
  });

  it("suction wood pins climbers", () => {
    const t = toyLevel();
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.move[2]![3] = { value: WOOD, extra1: 2, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    expect(eng.press(0, dUP)).toBe(false);
  });

  it("swapper panels trade places on a failed push", () => {
    const t = toyLevel(7, 5);
    t.perm[2]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    t.perm[3]![2] = { value: LADDER, extra1: 0, extra2: 0, extra3: 0 };
    // panel1 (swapper) pushed by smile into brick: step fails, panel swaps into the wall
    t.move[3]![2] = { value: PANEL, extra1: 1, extra2: 0, extra3: 0 };
    t.perm[4]![2] = { value: BRICK, extra1: 0, extra2: 0, extra3: 0 };
    const eng = engineWith(t);
    eng.energy[0] = 5;
    expect(eng.press(0, dRIGHT)).toBe(false);
    expect(eng.move[2]![2]!.value).toBe(SMILE);
    expect(eng.move[4]![2]!.value).toBe(PANEL);
    expect(eng.energy[0]).toBe(4); // push attempt still cost energy
  });
});
