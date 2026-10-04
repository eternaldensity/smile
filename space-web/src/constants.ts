// Object types — must match barrelobject.ctl ObjectType enum order.
export const SHIP = 0;
export const ENEMY = 1;
export const BRICK = 2;
export const WOOD = 3;
export const PANEL = 4;
export const BOUNCE = 5;
export const METAL = 6;
export const DOOR = 7;
export const WARP = 8;
export const SLOCK = 9;
export const ELOCK = 10;
export const ARROW = 11;
export const ROOF = 12;
export const MAGNET = 13;

// Directions — VB DirLeft=0, DirRight=1, DirUp=2, DirDown=3.
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

// Timer rates from the level forms (ms).
export const SHIP_MS = 100;
export const ENEMY_MS = 200;
export const MAGNET_MS = 1000;
export const DEATH_PAUSE_MS = 250;

export const GRID = 12;
export const TILE_PX = 32;
export const BOARD_PX = GRID * TILE_PX;
