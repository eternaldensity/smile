import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { dDOWN, dLEFT, dRIGHT, dUP } from "../src/constants";
import { Engine } from "../src/engine";
import { parseLevelText } from "../src/level-format";

function quietEngine() {
  const eng = new Engine();
  eng.events.sound = vi.fn();
  eng.events.popup = vi.fn();
  eng.events.levelComplete = vi.fn();
  eng.events.levelFailed = vi.fn();
  eng.events.hudChanged = vi.fn();
  return eng;
}

describe("soak: all shipped levels tick without crashing", () => {
  const dir = join(__dirname, "..", "..", "smile2", "Levels");
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt"));
  expect(files.length).toBe(24);
  for (const f of files) {
    it(`soaks ${f}`, () => {
      const eng = quietEngine();
      const parsed = parseLevelText(readFileSync(join(dir, f), "utf8"));
      eng.loadParsed(parsed, f, true);
      const dirs = [dUP, dLEFT, dDOWN, dRIGHT] as const;
      let seed = 42;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed;
      };
      for (let t = 0; t < 400; t++) {
        for (let s = 0; s < eng.numPlayers; s++) {
          if (eng.dead[s]) continue;
          eng.press(s, dirs[rnd() % 4]!);
        }
        eng.tick();
        if ((eng.events.levelComplete as ReturnType<typeof vi.fn>).mock.calls.length > 0) break;
      }
      // Must still be coherent.
      expect(eng.smileX[0]).toBeGreaterThanOrEqual(0);
      expect(eng.zapIndex).toBeGreaterThanOrEqual(1);
      expect(eng.zapIndex).toBeLessThanOrEqual(24);
    });
  }
});
