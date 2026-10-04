import { describe, expect, it } from "vitest";
import { parseLevelText, subpathToName } from "../src/level-format";
import { levelFiles, readLevel } from "./fixtures";

describe("level-format", () => {
  it("parses Level0 (15,5 1P)", () => {
    const p = parseLevelText(readLevel("Level0.txt"));
    expect(p.xsize).toBe(15);
    expect(p.ysize).toBe(5);
    expect(p.players).toBe(1);
    expect(p.perm).toHaveLength(16);
    expect(p.popups).toHaveLength(51);
    expect(p.switches).toHaveLength(51);
    expect(p.subpaths).toHaveLength(10);
  });

  it("parses Level4 (16,16)", () => {
    const p = parseLevelText(readLevel("Level4.txt"));
    expect(p.xsize).toBe(16);
    expect(p.ysize).toBe(16);
  });

  it("parses Level-1 (5,5 tiny)", () => {
    const p = parseLevelText(readLevel("Level-1.txt"));
    expect(p.xsize).toBe(5);
    expect(p.ysize).toBe(5);
  });

  it("maps legacy move value 1 -> 0", () => {
    for (const { name } of levelFiles()) {
      const p = parseLevelText(readLevel(name));
      for (const col of p.move) for (const c of col) expect(c.value).not.toBe(1);
    }
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
    expect(() => parseLevelText('10,10\n"smilegame2 1player"\n')).toThrow();
  });

  it("resolves windows subpaths by basename", () => {
    expect(subpathToName("C:\\a\\Vb\\Smile3\\bonus.txt")).toBe("bonus.txt");
    expect(subpathToName("levels/balloon3.txt")).toBe("balloon3.txt");
    expect(subpathToName("")).toBe("");
  });
});
