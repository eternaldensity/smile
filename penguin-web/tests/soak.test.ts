import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Engine } from "../src/engine";
import type { LevelData } from "../src/levels";

const dir = join(__dirname, "..", "public", "levels");

function quietEngine() {
  const eng = new Engine();
  eng.events.sound = vi.fn();
  eng.events.message = vi.fn();
  eng.events.finished = vi.fn();
  eng.events.hudChanged = vi.fn();
  return eng;
}

describe("soak: all 21 levels run without crashing", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  expect(files.length).toBe(21);
  for (const f of files) {
    it(`soaks ${f}`, () => {
      const eng = quietEngine();
      const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as LevelData;
      eng.load(data, 1);
      let seed = 99;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed;
      };
      // Random penguin steps + 8s of seal sim each.
      for (let t = 0; t < 320; t++) {
        if (rnd() % 2 === 0) eng.key(rnd() % 3, (rnd() % 4) as 0 | 1 | 2 | 3);
        eng.tick(25);
        if (eng.finished) break;
      }
      for (const o of eng.objs) {
        expect(o.x).toBeGreaterThanOrEqual(-1); // L9 wrap parks movers at -1 mid-step
        expect(o.x).toBeLessThanOrEqual(11);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeLessThanOrEqual(11);
      }
    });
  }
});
