// Object types — must match penguinobject.ctl ObjectType enum order.
export const PENGUIN = 0;
export const BRICK = 1;
export const SEAL = 2;
export const BALL = 3;
export const WOOD = 4;
export const PANEL = 5;
export const LADDER = 6;
export const WATER = 7;
export const SHIP = 8;
export const WARP = 9;
export const SLOCK = 10;
export const ELOCK = 11;
export const ARROW = 12;
export const FLIPPERS = 13;
export const BOLT = 14;

// Directions — VB dirLeft=0, dirRight=1, dirUp=2, dirDown=3.
export const LEFT = 0;
export const RIGHT = 1;
export const UP = 2;
export const DOWN = 3;
export type Dir = 0 | 1 | 2 | 3;
export type DirName = "left" | "right" | "up" | "down";

export const DIR_NAME: DirName[] = ["left", "right", "up", "down"];

export function oppositeDir(d: Dir): Dir {
  return ([RIGHT, LEFT, DOWN, UP] as const)[d]!;
}

// Penguin names by control index (PO 0..2 are Zidgel/Midgel/Fidgel).
export const PENGUIN_NAMES = ["Zidgel", "Midgel", "Fidgel"] as const;
export const PENGUIN_LETTERS = ["Z", "M", "F"] as const;

// Death pause: VB Pause() busy-waited 0.25s.
export const DEATH_PAUSE_MS = 250;

export const GRID = 12;
export const TILE_PX = 32;
export const BOARD_PX = GRID * TILE_PX;
