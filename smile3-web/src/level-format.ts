import type { PopupData, SwitchData, ThingData } from "./types";

export interface ParsedLevel {
  xsize: number;
  ysize: number;
  levelId: string;
  players: 1 | 2;
  perm: ThingData[][];
  coll: ThingData[][];
  move: ThingData[][];
  smileStarts: { x: number; y: number }[];
  popups: PopupData[];
  switches: SwitchData[];
  subpaths: string[];
  checkpointKeys?: boolean[][] | undefined; // [1..6][0..1]
  checkpointEnergy?: number[] | undefined;
}

type Field = string | number | boolean;

function parseVbRecord(line: string): Field[] {
  const out: Field[] = [];
  let i = 0;
  const n = line.length;
  const skipSpaces = () => {
    while (i < n && (line[i] === " " || line[i] === "\t")) i++;
  };
  while (i < n) {
    skipSpaces();
    if (i >= n) break;
    const c = line[i];
    if (c === '"') {
      i++;
      let s = "";
      while (i < n) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            s += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          s += line[i];
          i++;
        }
      }
      out.push(s);
    } else if (c === "#") {
      const end = line.indexOf("#", i + 1);
      const inner = (end === -1 ? line.slice(i + 1) : line.slice(i + 1, end)).trim().toUpperCase();
      i = end === -1 ? n : end + 1;
      if (inner === "TRUE") out.push(true);
      else if (inner === "FALSE") out.push(false);
      else out.push(inner);
    } else if (c === ",") {
      i++;
      continue;
    } else {
      let j = i;
      while (j < n && line[j] !== ",") j++;
      const tok = line.slice(i, j).trim();
      i = j;
      if (tok === "") continue;
      const up = tok.toUpperCase();
      if (up === "TRUE" || up === "#TRUE#") out.push(true);
      else if (up === "FALSE" || up === "#FALSE#") out.push(false);
      else {
        const num = Number(tok);
        out.push(Number.isNaN(num) ? tok : num);
      }
    }
    skipSpaces();
    if (line[i] === ",") i++;
  }
  return out;
}

function num(f: Field | undefined, what: string): number {
  if (typeof f === "number") return f;
  if (typeof f === "boolean") return f ? 1 : 0;
  throw new Error(`Expected number for ${what}, got ${JSON.stringify(f)}`);
}

function str(f: Field | undefined): string {
  if (typeof f === "string") return f;
  throw new Error(`Expected string, got ${JSON.stringify(f)}`);
}

function bool(f: Field | undefined): boolean {
  if (typeof f === "boolean") return f;
  if (typeof f === "number") return f !== 0;
  if (typeof f === "string") {
    const u = f.toUpperCase();
    if (u === "TRUE" || u === "#TRUE#") return true;
    if (u === "FALSE" || u === "#FALSE#" || u === "") return false;
  }
  throw new Error(`Expected boolean, got ${JSON.stringify(f)}`);
}

const blank = (): ThingData => ({ value: 0, extra1: 0, extra2: 0, extra3: 0 });

/**
 * Parse an original VB6 `Write #` level file. Tolerates truncated tails
 * (many files end right after the switches with a lone #FALSE#).
 */
export function parseLevelText(text: string): ParsedLevel {
  const lines = text.split(/\r?\n/);
  let cur = 0;
  const nextRecord = (): Field[] => {
    while (cur < lines.length && lines[cur]!.trim() === "") cur++;
    if (cur >= lines.length) throw new Error("Unexpected end of level file");
    const rec = parseVbRecord(lines[cur]!);
    cur++;
    return rec;
  };

  const dim = nextRecord();
  const xsize = num(dim[0], "xsize");
  const ysize = num(dim[1], "ysize");
  if (!Number.isInteger(xsize) || !Number.isInteger(ysize) || xsize < 0 || ysize < 0 || xsize > 40 || ysize > 40) {
    throw new Error(`Bad dimensions ${xsize},${ysize}`);
  }
  const levelId = str(nextRecord()[0]);
  if (!levelId.startsWith("smilegame3")) throw new Error(`Bad LevelID ${levelId}`);
  const players: 1 | 2 = levelId[11] === "2" ? 2 : 1;

  const W = xsize + 1;
  const H = ysize + 1;
  const perm: ThingData[][] = Array.from({ length: W }, () =>
    Array.from({ length: H }, blank),
  );
  const coll: ThingData[][] = Array.from({ length: W }, () =>
    Array.from({ length: H }, blank),
  );
  const move: ThingData[][] = Array.from({ length: W }, () =>
    Array.from({ length: H }, blank),
  );
  for (let x = 0; x <= xsize; x++) {
    for (let y = 0; y <= ysize; y++) {
      const r = nextRecord();
      if (r.length < 12) throw new Error(`Cell (${x},${y}) needs 12 fields, got ${r.length}`);
      perm[x]![y] = {
        value: num(r[0], "perm.value"),
        extra1: num(r[1], "perm.e1"),
        extra2: num(r[2], "perm.e2"),
        extra3: num(r[3], "perm.e3"),
      };
      coll[x]![y] = {
        value: num(r[4], "coll.value"),
        extra1: num(r[5], "coll.e1"),
        extra2: num(r[6], "coll.e2"),
        extra3: num(r[7], "coll.e3"),
      };
      let mv = num(r[8], "move.value");
      if (mv === 1) mv = 0; // legacy: LoadLevel maps move 1 -> 0
      move[x]![y] = {
        value: mv,
        extra1: num(r[9], "move.e1"),
        extra2: num(r[10], "move.e2"),
        extra3: num(r[11], "move.e3"),
      };
    }
  }

  const smileStarts: { x: number; y: number }[] = [];
  const s0 = nextRecord();
  smileStarts.push({ x: num(s0[0], "smile0.x"), y: num(s0[1], "smile0.y") });
  if (players === 2) {
    const s1 = nextRecord();
    smileStarts.push({ x: num(s1[0], "smile1.x"), y: num(s1[1], "smile1.y") });
  }

  const popups: PopupData[] = [];
  for (let k = 0; k < 51; k++) {
    try {
      const r = nextRecord();
      popups.push({ s: r.length > 0 ? String(str(r[0])) : "", x: num(r[1] ?? 0, "popup.x"), y: num(r[2] ?? 0, "popup.y"), d: r[3] === undefined ? false : bool(r[3]) });
    } catch {
      popups.push({ s: "", x: 0, y: 0, d: false });
    }
  }

  const switches: SwitchData[] = [];
  for (let k = 0; k < 51; k++) {
    try {
      const r = nextRecord();
      switches.push({
        x: num(r[0] ?? 0, "sw.x"),
        y: num(r[1] ?? 0, "sw.y"),
        value: num(r[2] ?? 0, "sw.v"),
        extra1: num(r[3] ?? 0, "sw.e1"),
        extra2: num(r[4] ?? 0, "sw.e2"),
        extra3: num(r[5] ?? 0, "sw.e3"),
        next: num(r[6] ?? 0, "sw.next"),
      });
    } catch {
      switches.push({ x: 0, y: 0, value: 0, extra1: 0, extra2: 0, extra3: 0, next: 0 });
    }
  }

  // 10 sublevel paths (often truncated away — lenient).
  const subpaths: string[] = [];
  for (let k = 0; k < 10; k++) {
    try {
      const r = nextRecord();
      const v = r[0];
      subpaths.push(typeof v === "string" ? v : "");
    } catch {
      subpaths.push("");
    }
  }

  // Optional checkpoint tail: 12 single-boolean key lines + 2 energy lines.
  let checkpointKeys: boolean[][] | undefined;
  let checkpointEnergy: number[] | undefined;
  try {
    const peek: Field[][] = [];
    const saved = cur;
    for (let k = 0; k < 14 && cur < lines.length; k++) {
      if (lines[cur]!.trim() === "" || lines[cur]!.trim() === "#FALSE#") {
        cur++;
        k--;
        continue;
      }
      peek.push(parseVbRecord(lines[cur]!));
      cur++;
    }
    if (peek.length >= 14) {
      checkpointKeys = Array.from({ length: 7 }, () => [false, false]);
      let p = 0;
      for (let kk = 1; kk <= 6; kk++) {
        for (let s = 0; s <= 1; s++) {
          checkpointKeys[kk]![s] = bool(peek[p++]![0]);
        }
      }
      checkpointEnergy = [num(peek[p++]![0], "e0"), num(peek[p++]![0], "e1")];
    } else {
      cur = saved;
    }
  } catch {
    checkpointKeys = undefined;
    checkpointEnergy = undefined;
  }

  return { xsize, ysize, levelId, players, perm, coll, move, smileStarts, popups, switches, subpaths, checkpointKeys, checkpointEnergy };
}

/** Resolve a VB subpath (often an absolute Windows path) to a fetchable level name. */
export function subpathToName(subpath: string): string {
  const base = subpath.split(/[\\/]/).pop() ?? subpath;
  return base;
}
