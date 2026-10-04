import { describe, expect, it } from "vitest";
import { parseLevelText } from "../src/level-format";
import { levelFiles, readLevel } from "./fixtures";

describe("level-format", () => {
  it("parses Level0 (10,10 1P)", () => {
    const p = parseLevelText(readLevel("Level0.txt"));
    expect(p.xsize).toBe(10);
    expect(p.ysize).toBe(10);
    expect(p.players).toBe(1);
    expect(p.perm).toHaveLength(11);
    expect(p.popups).toHaveLength(51);
    expect(p.switches).toHaveLength(51);
    expect(p.popups[0]!.s).toMatch(/red key/);
    expect(p.smileStarts[0]).toEqual({ x: 5, y: 5 });
  });

  it("parses Level1 (15,15 1P)", () => {
    const p = parseLevelText(readLevel("Level1.txt"));
    expect(p.xsize).toBe(15);
    expect(p.ysize).toBe(15);
    expect(p.players).toBe(1);
    expect(p.popups).toHaveLength(51);
    expect(p.switches).toHaveLength(51);
  });

  it("parses Level-1 (3,3 tiny)", () => {
    const p = parseLevelText(readLevel("Level-1.txt"));
    expect(p.xsize).toBe(3);
    expect(p.ysize).toBe(3);
  });

  it("maps legacy move value 1 -> 0", () => {
    const p = parseLevelText(readLevel("Level0.txt"));
    for (const col of p.move) for (const c of col) expect(c.value).not.toBe(1);
  });

  it("parses every available level file", () => {
    const files = levelFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const { name } of files) {
      const p = parseLevelText(readLevel(name));
      expect(p.perm.length).toBe(p.xsize + 1);
      expect(p.popups).toHaveLength(51);
      expect(p.switches).toHaveLength(51);
    }
  });

  it("rejects bad magic", () => {
    expect(() => parseLevelText('10,10\n"nope"\n')).toThrow();
  });
});
