import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const assets = join(__dirname, "..", "public", "assets");

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
});
