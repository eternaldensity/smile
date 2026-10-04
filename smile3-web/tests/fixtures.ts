import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Level fixtures: committed copies under public/levels always exist (CI).
// A local VB source checkout (gitignored, absent in CI) adds breadth when present.
const gameRoot = join(__dirname, "..");
const candidateDirs = [
  join(gameRoot, "public", "levels"),
  join(gameRoot, "..", "smile3", "Levels"),
  join(gameRoot, "..", "smile3"),
];

export function levelFiles(): { dir: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".txt") && !seen.has(f)) seen.set(f, dir);
    }
  }
  return [...seen.entries()].map(([name, dir]) => ({ dir, name }));
}

export function readLevel(name: string): string {
  for (const dir of candidateDirs) {
    const p = join(dir, name);
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  throw new Error(`Level fixture missing everywhere: ${name}`);
}
