// Tile IDs — must match smile3 mdl1.bas exactly.
export const NOWT = 0;
export const BRICK = 1;
export const WARP = 2;
export const LADDER = 3;
export const ROPE = 4;
export const CONVEY = 5;
export const TOLL = 6;
export const PRODUCER = 7;
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
export const MINCE = 22;
export const BALLOON = 23;
export const WEIGHT = 24;
// 25 unused
export const EXPLODE = 26;

// Directions — dFAll = gravity (down), dBUP = rise (up).
export const dUP = 1;
export const dLEFT = 2;
export const dDOWN = 3;
export const dRIGHT = 4;
export const dFALL = 5;
export const dBUP = 6;
export type Direction = 1 | 2 | 3 | 4 | 5 | 6;

// Explosion causes.
export const exNotmuch = 0;
export const exSmile = 1;
export const exTNT = 2;
export const exDyno = 3;
export const exSNitro = 4;
export const exBNitro = 5;
export const exPNitro = 6;
export const exBalloon = 7;
export const exBalloonx = 8;

export function oppositeD(d: number): number {
  let n = d + 2;
  if (n > 4) n -= 4;
  return n;
}

export function isEven(n: number): boolean {
  return n % 2 === 0;
}

// Money values — Startup.frm.
export const MONEY_VALUES = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50] as const;

// Animation frame counts — mdl1.bas.
export const MONEYFRAMES = 10;
export const TNTFRAMES = 6;
export const EXPLODEFRAMES = 9;
export const WATERFRAMES = 3;
export const WARPFRAMES = 3;
export const KEYFRAMES = 6;
export const DOORFRAMES = 7;
export const ENERGYFRAMES = 9;
export const SWITCHFRAMES = 7;
export const NITROFRAMES = 4;
export const GLASSFRAMES = 1;
export const BALLOONFRAMES = 3;
export const RADARFRAMES = 5;
export const LADDERFRAMES = 1;
export const CONVEYFRAMES = 3;
export const WOODFRAMES = 2;
export const MINCEFRAMES = 2;
export const TOLLFRAMES = 6;

// Logic tick rate: VB tmrRef.Interval = 35ms.
export const TICK_MS = 35;
export const VIEW_RADIUS = 6;
export const TILE_PX = 32;

/** Toll price for Extra1 0..4. (VB: (E1+1)*25, except 125 -> 500.) */
export function tollPrice(extra1: number): number {
  const pay = (extra1 + 1) * 25;
  return pay === 125 ? 500 : pay;
}
