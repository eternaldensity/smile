// Extracts space levels from the VB6 .frm designer blocks + hand-verified
// warp tables into JSON the web remake loads at runtime.
// Run: node scripts/extract-levels.mjs  (no dependencies)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "..", "space");
const outDir = join(root, "public", "levels");

// Directions: VB DirLeft=0, DirRight=1, DirUp=2, DirDown=3.
const D = { left: 0, right: 1, up: 2, down: 3 };

// Warp tables transcribed from each level's warp() (see README for semantics).
// number -> teleport target id
// {dir:{<entrydir>|"*": id}} -> by entry direction
// {warpee:{enemy:id, "*":id}} -> by warpee type
// {enemiesOnly:id} -> non-ships teleport, ships pass through (exit, like VB Exit Sub)
// {bounce:{pass:<dir>, other:id}} -> L15 one-way gates: correct entry teleports on,
//   otherwise warpee reverses and stays put.
const WARPS = {
  1: { 70: 71, 71: { dir: { down: 75, "*": 70 } }, 75: 70 },
  2: { 70: 71, 71: 70, 72: 73, 73: 72, 60: 77, 77: 60 },
  3: { 1: 40, 3: 1, 39: 40, 40: 39 },
  4: {
    72: 76, 73: 77, 74: 73, 77: 75,
    75: { dir: { right: 72, "*": 76 } },
    76: { dir: { up: 73, "*": 72 } },
  },
  5: { 18: 58, 58: { warpee: { enemy: 18, "*": 22 } } },
  6: Object.fromEntries([
    ...[28, 29, 30, 34, 35, 36].map((i) => [i, i + 3]),
    ...[31, 32, 33, 37, 38, 39].map((i) => [i, i - 3]),
    ...[40, 41, 42].map((i) => [i, i - 15]),
    ...[25, 26, 27].map((i) => [i, i + 15]),
  ]),
  7: { 1: 39, 3: 1, 39: 40, 40: 39 },
  8: { 1: 39, 3: 1, 39: 40, 40: 39 },
  9: {
    2: 15, 16: 2, 17: 2, 12: 9, 9: 17, 6: 12,
    15: { dir: { left: 17, "*": 16 } },
  },
  10: { 85: 90, 90: 85 },
  11: { 79: { enemiesOnly: 80 }, 80: { enemiesOnly: 79 } },
  12: { 79: { enemiesOnly: 80 }, 80: { enemiesOnly: 79 } },
  13: { 79: { enemiesOnly: 80 }, 80: { enemiesOnly: 79 } },
  14: { 79: { enemiesOnly: 80 }, 80: { enemiesOnly: 79 } },
  15: {
    64: 2, 2: 64, 59: 59, 60: 60, 61: 61, 62: 64,
    63: { dir: { down: 64, "*": 62 } },
    45: { bounce: { pass: "left", other: 52 } },
    52: { bounce: { pass: "right", other: 45 } },
  },
  16: { 79: { enemiesOnly: 80 }, 80: { enemiesOnly: 79 } },
};

const TYPE_NAMES = ["ship", "enemy", "brick", "wood", "panel", "bounce", "metal", "door", "warp", "slock", "elock", "arrow", "roof", "magnet"];

function parseObjects(text) {
  const objs = [];
  const blocks = text.match(/Begin SpaceGame\.SpaceObject[\s\S]*?^ {6}End\r?$/gm);
  if (!blocks) throw new Error("no SpaceObject blocks found");
  for (const b of blocks) {
    const get = (name, def) => {
      const m = b.match(new RegExp(`^\\s*${name}\\s*=\\s*(\\d+)`, "m"));
      return m ? parseInt(m[1], 10) : def;
    };
    const visible = /Visible\s*=\s*0/.test(b) ? false : true;
    objs.push({
      id: get("Index", -1),
      type: get("ObjectType", 0),
      x: Math.round(get("Left", 0) / 480),
      y: Math.round(get("Top", 0) / 480),
      visible,
      dir: get("NextMove", 0),
    });
  }
  return objs;
}

function collectRuleTargets(rule, out) {
  if (typeof rule === "number") out.push(rule);
  else if (rule.dir) out.push(...Object.values(rule.dir));
  else if (rule.warpee) out.push(...Object.values(rule.warpee));
  else if (rule.enemiesOnly) out.push(rule.enemiesOnly);
  else if (rule.bounce) out.push(rule.bounce.other);
  else throw new Error("unknown warp rule " + JSON.stringify(rule));
}

mkdirSync(outDir, { recursive: true });
for (let level = 1; level <= 16; level++) {
  const text = readFileSync(join(srcDir, `level${level}.frm`), "latin1");
  const objects = parseObjects(text);
  const byId = new Map(objects.map((o) => [o.id, o]));

  // --- verification (strict: fail loudly on extraction bugs) ---
  const ship = byId.get(0);
  if (!ship || ship.type !== 0) throw new Error(`level${level}: id 0 must be the ship`);
  const doors = objects.filter((o) => o.type === 7);
  if (doors.length !== 1) throw new Error(`level${level}: expected 1 door, got ${doors.length}`);
  for (const o of objects) {
    if (o.x < 0 || o.x > 11 || o.y < 0 || o.y > 11) throw new Error(`level${level}: obj ${o.id} off-grid`);
    if (o.dir < 0 || o.dir > 3) throw new Error(`level${level}: obj ${o.id} bad dir`);
  }
  const warps = WARPS[level];
  const warpIds = objects.filter((o) => o.type === 8).map((o) => o.id);
  const ruled = Object.keys(warps).map(Number);
  const unruled = warpIds.filter((id) => !ruled.includes(id));
  // Dead copy-pasted warp code may reference non-warps (e.g. levels 7-8
  // have no warps at all); rules that can never fire are kept but skipped.
  const live = {};
  for (const [from, rule] of Object.entries(warps)) {
    if (byId.get(Number(from))?.type === 8) live[from] = rule;
    else console.log(`  note: rule for ${from} can never fire (not a warp)`);
  }
  if (unruled.length) console.log(`  warning: warps without rules (no-op in remake): ${unruled}`);
  const targets = [];
  for (const [from, rule] of Object.entries(live)) {
    collectRuleTargets(rule, targets);
  }
  for (const t of targets) {
    if (typeof t === "string") continue; // "*" default handled with its rule
    if (!byId.has(t)) throw new Error(`level${level}: warp target ${t} missing`);
  }

  const counts = {};
  for (const o of objects) {
    const n = TYPE_NAMES[o.type] ?? `t${o.type}`;
    counts[n] = (counts[n] ?? 0) + 1;
  }
  writeFileSync(join(outDir, `level${level}.json`), JSON.stringify({ level, objects, warps: live }, null, 1) + "\n");
  console.log(`level${level}: ${objects.length} objects`, JSON.stringify(counts));
}
console.log("levels: 16 extracted");
void D;
