import type { Dir } from "./constants";

// Real sprites, converted from data/Pictures (see scripts/convert-assets.mjs).
const B = import.meta.env.BASE_URL || "./";
const S = `${B}assets/sprites/`;

export const SPRITES = {
  ship: `${S}ship.png`,
  shipBang: `${S}bang.png`,
  enemy: `${S}enemy.png`,
  brick: `${S}brick.png`,
  wood: `${S}wood.png`,
  panel: `${S}panel.png`,
  bounce: `${S}bounce.png`,
  metal: `${S}metal.png`,
  door: `${S}door.png`,
  warp: `${S}warp.png`,
  slock: `${S}lock.png`,
  elock: `${S}2lock.png`,
  arrow: [`${S}0sign.png`, `${S}1sign.png`, `${S}2sign.png`, `${S}3sign.png`],
  roof: `${S}roof.png`,
  magnet: `${S}magnet.png`,
} as const;

export type ImageCache = Map<string, HTMLImageElement>;

export async function loadAllImages(): Promise<ImageCache> {
  const urls = new Set<string>([
    SPRITES.ship, SPRITES.shipBang, SPRITES.enemy, SPRITES.brick,
    SPRITES.wood, SPRITES.panel, SPRITES.bounce, SPRITES.metal,
    SPRITES.door, SPRITES.warp, SPRITES.slock, SPRITES.elock,
    ...SPRITES.arrow, SPRITES.roof, SPRITES.magnet,
  ]);
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

export function spriteFor(type: number, dir: Dir, bang: boolean): string {
  if (bang) return SPRITES.shipBang;
  switch (type) {
    case 0: return SPRITES.ship;
    case 1: return SPRITES.enemy;
    case 2: return SPRITES.brick;
    case 3: return SPRITES.wood;
    case 4: return SPRITES.panel;
    case 5: return SPRITES.bounce;
    case 6: return SPRITES.metal;
    case 7: return SPRITES.door;
    case 8: return SPRITES.warp;
    case 9: return SPRITES.slock;
    case 10: return SPRITES.elock;
    case 11: return SPRITES.arrow[dir] ?? SPRITES.arrow[0]!;
    case 12: return SPRITES.roof;
    case 13: return SPRITES.magnet;
    default: return SPRITES.brick;
  }
}
