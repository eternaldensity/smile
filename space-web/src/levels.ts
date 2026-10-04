import type { Dir } from "./constants";

export interface LevelObject {
  id: number;
  type: number;
  x: number;
  y: number;
  visible: boolean;
  /** NextMove: arrow/spawn direction, or the ship's initial slide direction. */
  dir: Dir;
}

export type WarpRule =
  | number
  | { dir: Record<string, number> }
  | { warpee: { enemy: number; "*": number } }
  | { enemiesOnly: number }
  | { bounce: { pass: string; other: number } };

export interface LevelData {
  level: number;
  objects: LevelObject[];
  warps: Record<string, WarpRule>;
}

export async function fetchLevel(n: number): Promise<LevelData> {
  const base = import.meta.env.BASE_URL || "./";
  const res = await fetch(`${base}levels/level${n}.json`);
  if (!res.ok) throw new Error(`Could not load level ${n}: ${res.status}`);
  return (await res.json()) as LevelData;
}
