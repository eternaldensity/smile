import { describe, expect, it, vi } from "vitest";
import { dDOWN, dLEFT, dRIGHT, dUP } from "../src/constants";
import { Engine } from "../src/engine";
import { parseLevelText } from "../src/level-format";
import { levelFiles, readLevel } from "./fixtures";

function quietEngine() {
  const eng = new Engine();
  eng.events.sound = vi.fn();
  eng.events.popup = vi.fn();
  eng.events.levelComplete = vi.fn();
  eng.events.levelFailed = vi.fn();
  eng.events.hudChanged = vi.fn();
  eng.events.toll = vi.fn();
  eng.events.openSub = vi.fn();
  eng.events.subComplete = vi.fn();
  return eng;
}

describe("soak: every level ticks without crashing", () => {
  const files = levelFiles();
  expect(files.length).toBeGreaterThan(0);
  for (const { name } of files) {
    it(`soaks ${name}`, () => {
      const eng = quietEngine();
      let parsed;
      try {
        parsed = parseLevelText(readLevel(name));
      } catch {
        return; // in-progress design that doesn't parse yet — skip
      }
      eng.loadParsed(parsed, name, true);
      const dirs = [dUP, dLEFT, dDOWN, dRIGHT] as const;
      let seed = 1234;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed;
      };
      for (let t = 0; t < 300; t++) {
        for (let s = 0; s < eng.numPlayers; s++) {
          if (eng.dead[s]) continue;
          eng.press(s, dirs[rnd() % 4]!);
        }
        eng.tick();
        if ((eng.events.levelComplete as ReturnType<typeof vi.fn>).mock.calls.length > 0) break;
        if (eng.blnInSub) {
          eng.declineToll();
          eng.blnInSub = false; // no UI here: abandon sub gates, keep ticking
        }
      }
      expect(eng.zapIndex).toBeGreaterThanOrEqual(1);
      expect(eng.zapIndex).toBeLessThanOrEqual(24);
    });
  }
});
