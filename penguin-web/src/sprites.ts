import type { Dir } from "./constants";

// Real sprites, converted from data/Pictures (see scripts/convert-assets.mjs).
const B = import.meta.env.BASE_URL || "./";
const S = `${B}assets/sprites/`;

export const SPRITES = {
  brick: `${S}brick.png`,
  seal: [`${S}seall.png`, `${S}sealr.png`],
  ball: `${S}ball.png`,
  wood: `${S}wood.png`,
  panel: `${S}panel.png`,
  ladder: `${S}ladder.png`,
  water: `${S}water.png`,
  ship: `${S}ship2.png`,
  warp: `${S}warp.png`,
  slock: `${S}lock.png`,
  elock: `${S}2lock.png`,
  arrow: [`${S}0sign.png`, `${S}1sign.png`, `${S}2sign.png`, `${S}3sign.png`],
  flippers: `${S}flippers.png`,
  bolt: `${S}bolt.png`,
  penguin: [
    [`${S}zidgell.png`, `${S}zidgelr.png`],
    [`${S}midgell.png`, `${S}midgelr.png`],
    [`${S}fidgel.png`, `${S}fidgel.png`],
  ],
} as const;

export type ImageCache = Map<string, HTMLImageElement>;

export async function loadAllImages(): Promise<ImageCache> {
  const urls = new Set<string>();
  const push = (u: string) => {
    if (u) urls.add(u);
  };
  push(SPRITES.brick);
  push(SPRITES.ball);
  push(SPRITES.wood);
  push(SPRITES.panel);
  push(SPRITES.ladder);
  push(SPRITES.water);
  push(SPRITES.ship);
  push(SPRITES.warp);
  push(SPRITES.slock);
  push(SPRITES.elock);
  push(SPRITES.flippers);
  push(SPRITES.bolt);
  for (const u of [...SPRITES.seal, ...SPRITES.arrow]) push(u);
  for (const p of SPRITES.penguin) for (const u of p) push(u);
  const cache: ImageCache = new Map();
  await Promise.all(
    [...urls].map(
      (u) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            cache.set(u, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = u;
        }),
    ),
  );
  return cache;
}

/** Facing sprite: left/right by direction, like the VB NextMove pictures. */
function facing(dir: Dir): number {
  return dir <= 1 ? dir : 0;
}

export function spriteFor(type: number, pname: number, dir: Dir): string {
  switch (type) {
    case 0:
      return SPRITES.penguin[pname - 1]?.[facing(dir)] ?? SPRITES.penguin[0]![0]!;
    case 1:
      return SPRITES.brick;
    case 2:
      return SPRITES.seal[facing(dir)]!;
    case 3:
      return SPRITES.ball;
    case 4:
      return SPRITES.wood;
    case 5:
      return SPRITES.panel;
    case 6:
      return SPRITES.ladder;
    case 7:
      return SPRITES.water;
    case 8:
      return SPRITES.ship;
    case 9:
      return SPRITES.warp;
    case 10:
      return SPRITES.slock;
    case 11:
      return SPRITES.elock;
    case 12:
      return SPRITES.arrow[dir] ?? SPRITES.arrow[0]!;
    case 13:
      return SPRITES.flippers;
    case 14:
      return SPRITES.bolt;
    default:
      return SPRITES.brick;
  }
}
