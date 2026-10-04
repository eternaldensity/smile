import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LevelData } from "../src/levels";

const dir = join(__dirname, "..", "public", "levels");

function load(name: string): LevelData {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as LevelData;
}

function ruleTargets(rule: unknown, out: number[]): void {
  if (typeof rule === "number") out.push(rule);
  else if (typeof rule === "object" && rule !== null) {
    const r = rule as Record<string, unknown>;
    if (r.dir) out.push(...(Object.values(r.dir) as number[]));
    else if (r.warpee) out.push(...(Object.values(r.warpee) as number[]));
    else if (typeof r.enemiesOnly === "number") out.push(r.enemiesOnly);
    else if (r.bounce) out.push((r.bounce as { other: number }).other);
    else throw new Error("unknown rule " + JSON.stringify(rule));
  } else throw new Error("unknown rule " + JSON.stringify(rule));
}

describe("extracted levels", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  expect(files.length).toBe(16);

  for (const f of files) {
    it(`validates ${f}`, () => {
      const lv = load(f);
      const byId = new Map(lv.objects.map((o) => [o.id, o]));
      const ship = byId.get(0);
      expect(ship?.type).toBe(0);
      expect(lv.objects.filter((o) => o.type === 7)).toHaveLength(1);
      for (const o of lv.objects) {
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.x).toBeLessThanOrEqual(11);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeLessThanOrEqual(11);
        expect(o.dir).toBeGreaterThanOrEqual(0);
        expect(o.dir).toBeLessThanOrEqual(3);
      }
      // Every live warp rule resolves to real objects.
      for (const [from, rule] of Object.entries(lv.warps)) {
        expect(byId.get(Number(from))?.type).toBe(8);
        const targets: number[] = [];
        ruleTargets(rule, targets);
        for (const t of targets) expect(byId.has(t)).toBe(true);
      }
      // Every warp object has a live rule.
      for (const o of lv.objects) {
        if (o.type === 8) expect(lv.warps[String(o.id)]).toBeDefined();
      }
    });
  }
});
