import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LevelData } from "../src/levels";

const dir = join(__dirname, "..", "public", "levels");

function load(n: number): LevelData {
  return JSON.parse(readFileSync(join(dir, `level${n}.json`), "utf8")) as LevelData;
}

function ruleTargets(rule: unknown, out: number[]): void {
  if (typeof rule === "number") out.push(rule);
  else if (typeof rule === "object" && rule !== null) {
    const r = rule as Record<string, unknown>;
    if (r.dir) out.push(...(Object.values(r.dir) as number[]));
    else if (typeof r.to === "number") out.push(r.to);
    else if (r.fanout) out.push(...(Object.values(r.fanout) as number[]));
    else if (!r.random) throw new Error("unknown rule " + JSON.stringify(rule));
  } else throw new Error("unknown rule " + JSON.stringify(rule));
}

describe("extracted levels", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  expect(files.length).toBe(21);

  for (let n = 1; n <= 21; n++) {
    it(`validates level${n}`, () => {
      const lv = load(n);
      const byId = new Map(lv.objects.map((o) => [o.id, o]));
      // Three named penguins on slots 0-2, exactly one ship, bolts to collect.
      for (let i = 0; i < 3; i++) {
        expect(byId.get(i)?.type).toBe(0);
        expect(byId.get(i)?.pname).toBe(i + 1);
      }
      expect(lv.objects.filter((o) => o.type === 8)).toHaveLength(1);
      expect(lv.objects.filter((o) => o.type === 14 && o.visible).length).toBeGreaterThan(0);
      for (const o of lv.objects) {
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.x).toBeLessThanOrEqual(11);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeLessThanOrEqual(11);
      }
      // Every live warp rule resolves to real objects.
      for (const [from, rule] of Object.entries(lv.warps)) {
        expect(byId.get(Number(from))?.type).toBe(9);
        const targets: number[] = [];
        ruleTargets(rule, targets);
        for (const t of targets) expect(byId.has(t)).toBe(true);
      }
      for (const o of lv.objects) {
        if (o.type === 9) expect(lv.warps[String(o.id)] ?? lv.flags.warpElse).toBeDefined();
      }
    });
  }
});
