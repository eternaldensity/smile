// Tile IDs — must match VB mdl1.bas exactly.
export const NOWT = 0;
export const BRICK = 1;
export const WARP = 2;
export const ICE = 3;
export const ONEWAY = 4;
export const TWOWAY = 5;
export const STAIR = 6;
export const ELEVATED = 7;
export const DOOR = 8;
export const MONEY = 9;
export const KEY = 10;
export const ENERGY = 11;
export const SWITCH = 12;
export const WOOD = 13;
export const WATER = 14;
export const DYNO = 15;
export const TNT = 16;
export const PANEL = 17;
export const NITRO = 18;
export const GLASS = 19;
export const SMILE = 20;
export const RADAR = 21;
export const MAGNET = 22;
export const EXPLODE = 23;

// Directions — must match VB dUP..dRIGHT.
export const dUP = 1;
export const dLEFT = 2;
export const dDOWN = 3;
export const dRIGHT = 4;
export type Direction = 1 | 2 | 3 | 4;

// Explosion causes — must match VB ex*.
export const exNotmuch = 0;
export const exSmile = 1;
export const exTNT = 2;
export const exDyno = 3;
export const exSNitro = 4;
export const exBNitro = 5;
export const exPNitro = 6;

export function oppositeD(d: Direction): Direction {
  let n = d + 2;
  if (n > 4) n -= 4;
  return n as Direction;
}

export function addToDirection(dir: Direction, num: number): Direction {
  let r = dir + num;
  if (r > dRIGHT) r -= dRIGHT;
  if (r < dUP) r += dRIGHT;
  return r as Direction;
}

export function isEven(n: number): boolean {
  return n % 2 === 0;
}

// Money values — Startup.frm.
export const MONEY_VALUES = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50] as const;

// Animation frame counts — Game.frm consts.
export const MONEYFRAMES = 10;
export const TNTFRAMES = 6;
export const EXPLODEFRAMES = 9;
export const WATERFRAMES = 3;
export const WARPFRAMES = 3;
export const KEYFRAMES = 6;
export const DOORFRAMES = 7;
export const ONEWAYFRAMES = 4;
export const TWOWAYFRAMES = 4;
export const ENERGYFRAMES = 7;
export const SWITCHFRAMES = 7;
export const NITROFRAMES = 4;
export const GLASSFRAMES = 2;
export const RADARFRAMES = 5;
export const MAGNETFRAMES = 1;
export const WOODFRAMES = 1;

// Logic tick rate: VB tmrLoop.Interval = 25ms.
export const TICK_MS = 25;
export const VIEW_RADIUS = 6;
export const TILE_PX = 32;
