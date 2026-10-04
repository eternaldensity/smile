// Extracts penguin levels from the VB6 .frm designer blocks into JSON.
// Encodes per-level warp rules + behavior flags (see README).
// Run: node scripts/extract-levels.mjs  (no dependencies)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "..", "Penguin");
const outDir = join(root, "public", "levels");

// Warp rules transcribed from each level's Warp().
// number -> teleport target id (then keep moving in entry direction)
// {dir:{<entry>|"*": id}} -> target by entry direction
// {to, exit} -> fixed target, exit direction override ("entry", "right", "down",
//   or {<entry>: <exit>} map; missing = keep entry direction)
// {to, exitBy:{seal,ball}} -> L11 gates: exit forced by warpee type
// {fanout:{pname:id}, exit} -> L11 ship-gate 32 (non-penguins: no-op, VB crashed)
// {random:[lo,hi]} -> uniform object id in range
const WARPS = {
  1: { 79: 80, 80: 79 },
  2: { 56: 96, 96: 56, 98: 97, 97: 98 },
  3: { 84: 85, 85: 84, 66: { dir: { left: 81, "*": 85 } } },
  4: {
    62: { dir: { right: 62, "*": 63 } },
    63: { dir: { right: 63, "*": 62 } },
    64: 65, 65: 64,
  },
  5: { 66: 26, 26: { dir: { down: 26, "*": 66 } } },
  6: {
    91: 90, 90: 91,
    92: { to: 93, exit: { right: "left" } },
    93: { to: 92, exit: { right: "left" } },
  },
  7: {
    52: 47, 47: 52, 50: 53, 53: 50, 55: 46, 46: 55,
    49: { dir: { down: 54, "*": 56 } }, 56: 49, 48: 51, 51: 48, 54: 49,
  },
  8: {
    52: 47, 47: 52, 50: 53, 53: 50, 55: 46, 46: 55,
    49: { dir: { down: 54, "*": 56 } }, 56: 49, 48: 51, 51: 48, 54: 49,
  },
  9: {
    52: 47, 47: 52, 50: 53, 53: 50, 55: 46, 46: 55,
    49: { dir: { down: 54, "*": 56 } }, 56: 49, 48: 51, 51: 48, 54: 49,
  },
  10: { 74: { to: 75, exit: "entry" }, 75: 75 },
  11: {
    43: { to: 32, exitBy: { seal: "down", ball: "left" } },
    46: { to: 32, exitBy: { seal: "down", ball: "left" } },
    50: { to: 32, exitBy: { seal: "down", ball: "left" } },
    32: { fanout: { 1: 43, 2: 46, 3: 50 }, exit: "right" },
  },
  12: { 79: 80, 80: 79 },
  13: { 101: { random: [73, 78] }, 102: { random: [67, 72] } },
  14: { 101: { random: [73, 78] }, 102: { random: [67, 72] } },
  15: { 43: 78, 78: 43 },
  16: { 43: 78, 78: 43 },
  17: { 43: 78, 78: 43 },
  18: { 117: 70, 118: 65 },
  19: { 62: 26, 78: 71, 113: 15, 42: 111, 120: 119, 123: 76 },
  20: {
    71: 66, 64: 65, 65: 64, 66: 67, 67: 70, 68: 73,
    74: 69, 70: 63, 63: 67, 73: 72, 72: 71, 69: 67,
  },
  21: { 43: 78, 78: 43 },
};

// Per-level behavior flags (quirks found in each level's code).
const FLAGS = {
  4: { showShipsExtra: [121], hideOnReset: [121] },
  5: { arrowSwap: { pins: { 63: 0 } } }, // 63 stays left, others random 0/1
  9: { wrapBottom: true, sealMs: 600 },
  10: { arrowSwap: { all: 0, pins: { 13: 1 } } }, // 13 right, rest left
  11: { boltLadderTrigger: 81 }, // collecting a bolt while 81 hidden reveals ladders
  13: { warpElse: { random: [67, 78] }, warpExit: "down" },
  14: { warpElse: { random: [67, 78] }, warpExit: "down" },
  15: { warpExit: { left: "down" } },
  16: { warpExit: { left: "down" } },
  17: { warpExit: { left: "down" } },
  19: { sealClimbFallback: true }, // failed seal climb re-enables falling
  21: { sealMs: 300 },
};

const TYPE_NAMES = ["penguin", "brick", "seal", "ball", "wood", "panel", "ladder", "water", "ship", "warp", "slock", "elock", "arrow", "flippers", "bolt"];
const FILES = [...Array.from({ length: 16 }, (_, i) => `level${i + 1}`), "Level17", "level18", "level19", "level20", "level21"];
const NUMS = [...Array.from({ length: 16 }, (_, i) => i + 1), 17, 18, 19, 20, 21];

function parseObjects(text) {
  const objs = [];
  const blocks = text.match(/Begin PenguinGame\.PenguinObject[\s\S]*?^ {6}End\r?$/gm);
  if (!blocks) throw new Error("no PenguinObject blocks found");
  for (const b of blocks) {
    const get = (name, def) => {
      const m = b.match(new RegExp(`^\\s*${name}\\s*=\\s*(\\d+)`, "m"));
      return m ? parseInt(m[1], 10) : def;
    };
    objs.push({
      id: get("Index", -1),
      type: get("ObjectType", 0),
      pname: get("PName", 0),
      x: Math.round(get("Left", 0) / 480),
      y: Math.round(get("Top", 0) / 480),
      visible: !/Visible\s*=\s*0/.test(b),
      dir: get("NextMove", 0),
    });
  }
  return objs;
}

function ruleTargets(rule, out) {
  if (typeof rule === "number") out.push(rule);
  else if (rule.dir) out.push(...Object.values(rule.dir).filter((v) => typeof v === "number"));
  else if (typeof rule.to === "number") out.push(rule.to);
  else if (rule.fanout) out.push(...Object.values(rule.fanout));
  else if (rule.random) { /* range checked separately */ }
  else throw new Error("unknown warp rule " + JSON.stringify(rule));
}

mkdirSync(outDir, { recursive: true });
FILES.forEach((file, fi) => {
  const level = NUMS[fi];
  const text = readFileSync(join(srcDir, `${file}.frm`), "latin1");
  const objects = parseObjects(text).filter((o) => {
    if (o.x < 0 || o.x > 11 || o.y < 0 || o.y > 11) {
      console.log(`  level${level} note: dropping off-grid obj ${o.id} (designer junk)`);
      return false;
    }
    if (o.dir < 0 || o.dir > 3) throw new Error(`level${level}: obj ${o.id} bad dir`);
    return true;
  });
  const byId = new Map(objects.map((o) => [o.id, o]));

  const penguins = objects.filter((o) => o.type === 0 && o.visible);
  if (penguins.length !== 3) throw new Error(`level${level}: expected 3 penguins, got ${penguins.length}`);
  for (let i = 0; i < 3; i++) {
    const p = byId.get(i);
    if (!p || p.type !== 0 || p.pname !== i + 1) {
      throw new Error(`level${level}: PO(${i}) must be penguin PName ${i + 1}`);
    }
  }
  const ships = objects.filter((o) => o.type === 8);
  if (!ships.length) throw new Error(`level${level}: no ship`);
  if (!objects.some((o) => o.type === 14 && o.visible)) throw new Error(`level${level}: no visible bolts`);
  for (const o of objects) {
    if (o.dir < 0 || o.dir > 3) throw new Error(`level${level}: obj ${o.id} bad dir`);
  }
  const tm = text.match(/Begin VB\.Timer tmrMove[\s\S]*?Interval\s*=\s*(\d+)/);
  const sealMs = tm ? parseInt(tm[1], 10) : 200;

  // Warp verification: every warp object needs a live rule (or the level's Else).
  const warps = WARPS[level];
  const flags = FLAGS[level] ?? {};
  const warpIds = objects.filter((o) => o.type === 9).map((o) => o.id);
  const live = {};
  for (const [from, rule] of Object.entries(warps)) {
    if (byId.get(Number(from))?.type === 9) live[from] = rule;
    else console.log(`  level${level} note: rule for ${from} can never fire`);
  }
  const ruled = new Set(Object.keys(live).map(Number));
  for (const id of warpIds) {
    if (!ruled.has(id) && !flags.warpElse) throw new Error(`level${level}: warp ${id} has no rule`);
  }
  const targets = [];
  for (const rule of Object.values(live)) ruleTargets(rule, targets);
  for (const t of targets) {
    if (!byId.has(t)) throw new Error(`level${level}: warp target ${t} missing`);
  }
  if (flags.warpElse?.random) {
    const [lo, hi] = flags.warpElse.random;
    for (let i = lo; i <= hi; i++) {
      if (!byId.has(i)) throw new Error(`level${level}: random warp target ${i} missing`);
    }
  }
  if (typeof flags.boltLadderTrigger === "number" && !byId.has(flags.boltLadderTrigger)) {
    throw new Error(`level${level}: ladder trigger missing`);
  }
  for (const id of [...(flags.showShipsExtra ?? []), ...(flags.hideOnReset ?? [])]) {
    if (!byId.has(id)) throw new Error(`level${level}: flag object ${id} missing`);
  }

  const counts = {};
  for (const o of objects) {
    const n = TYPE_NAMES[o.type] ?? `t${o.type}`;
    counts[n] = (counts[n] ?? 0) + 1;
  }
  writeFileSync(
    join(outDir, `level${level}.json`),
    JSON.stringify({ level, sealMs, objects, warps: live, flags }, null, 1) + "\n",
  );
  console.log(`level${level}: ${objects.length} objects`, JSON.stringify(counts));
});
console.log("levels: 21 extracted");
