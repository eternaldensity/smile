import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPRITES } from "../src/sprites";

const assets = join(__dirname, "..", "public", "assets");

function urls(): string[] {
  const out: string[] = [];
  for (const v of Object.values(SPRITES)) {
    if (typeof v === "string") out.push(v);
    else out.push(...(v as readonly string[]));
  }
  return out.map((u) => u.replace(/^\.\//, ""));
}

describe("converted assets", () => {
  it("manifest matches files on disk", () => {
    const manifest = JSON.parse(
      readFileSync(join(assets, "manifest.json"), "utf8"),
    ) as { sprites: Record<string, string>; sounds: Record<string, string> };
    const files = [
      ...Object.values(manifest.sprites),
      ...Object.values(manifest.sounds),
      "assets/stars.png",
    ];
    expect(files.length).toBeGreaterThan(20);
    const pub = join(__dirname, "..", "public");
    for (const f of files) {
      expect(existsSync(join(pub, f)), f).toBe(true);
    }
  });

  it("every sprite URL in code exists on disk", () => {
    const pub = join(__dirname, "..", "public");
    for (const u of urls()) {
      expect(existsSync(join(pub, u)), u).toBe(true);
    }
  });
});
