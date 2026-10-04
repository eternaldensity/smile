// Central sprite registry. Paths are relative to the Vite base.
const B = import.meta.env.BASE_URL || "./";

export const SPRITES = {
  brick: `${B}assets/brick.png`,
  ice: `${B}assets/ice.png`,
  smile: `${B}assets/smile.png`,
  panel: `${B}assets/panel.png`,
  dyno: `${B}assets/dyno.png`,
  stair: `${B}assets/stair.png`,
  elevated: `${B}assets/elevated.png`,
  q: `${B}assets/Q.png`,
  wood: [`${B}assets/wood0.png`, `${B}assets/wood1.png`],
  money: Array.from({ length: 11 }, (_, i) => `${B}assets/money/money${i}.png`),
  tnt: Array.from({ length: 7 }, (_, i) => (i === 0 ? "" : `${B}assets/TNT${i}.png`)),
  explode: Array.from({ length: 10 }, (_, i) => `${B}assets/explode/Explode${i}.png`),
  water: Array.from({ length: 4 }, (_, i) => `${B}assets/water${i}.png`),
  warp: Array.from({ length: 4 }, (_, i) => `${B}assets/warp${i}.png`),
  key: Array.from({ length: 7 }, (_, i) => (i === 0 ? "" : `${B}assets/key${i}.png`)),
  door: Array.from({ length: 8 }, (_, i) => (i === 0 ? "" : `${B}assets/door${i}.png`)),
  oneway: Array.from({ length: 5 }, (_, i) => (i === 0 ? "" : `${B}assets/1way${i}.png`)),
  twoway: Array.from({ length: 5 }, (_, i) => `${B}assets/2way${i}.png`),
  energy: Array.from({ length: 8 }, (_, i) => `${B}assets/energy${i}.png`),
  switch: Array.from({ length: 8 }, (_, i) => `${B}assets/switch/switch${i}.png`),
  nitroBase: Array.from({ length: 5 }, (_, i) => `${B}assets/nitro/nitro${i}.png`),
  nitro0dir: Array.from({ length: 4 }, (_, i) => `${B}assets/nitro/nitro0_${i}.png`),
  nitro2dir: Array.from({ length: 4 }, (_, i) => `${B}assets/nitro/nitro2_${i}.png`),
  glass: Array.from({ length: 3 }, (_, i) => `${B}assets/glass${i}.png`),
  magnet: [`${B}assets/magnet0.png`, `${B}assets/magnet1.png`],
} as const;

export function radarSprite(frame: number, dir: number): string {
  const f = frame <= 3 ? `${frame}${dir}` : `${frame}1`;
  return `${B}assets/radar/radar${f}.png`;
}

/** Key colors as the popups name them (key1..key6 sprites). */
export const KEY_NAMES = ["", "blue", "yellow", "red", "green", "black", "silver"];

export type ImageCache = Map<string, HTMLImageElement>;

export async function loadAllImages(): Promise<ImageCache> {
  const urls = new Set<string>();
  const push = (u: string) => {
    if (u) urls.add(u);
  };
  push(SPRITES.brick);
  push(SPRITES.ice);
  push(SPRITES.smile);
  push(SPRITES.panel);
  push(SPRITES.dyno);
  push(SPRITES.stair);
  push(SPRITES.elevated);
  push(SPRITES.q);
  for (const u of [...SPRITES.wood, ...SPRITES.money, ...SPRITES.tnt, ...SPRITES.explode,
    ...SPRITES.water, ...SPRITES.warp, ...SPRITES.key, ...SPRITES.door,
    ...SPRITES.oneway, ...SPRITES.twoway, ...SPRITES.energy, ...SPRITES.switch,
    ...SPRITES.nitroBase, ...SPRITES.nitro0dir, ...SPRITES.nitro2dir,
    ...SPRITES.glass, ...SPRITES.magnet]) push(u);
  for (let f = 0; f <= 5; f++) for (let d = 1; d <= 4; d++) push(radarSprite(f, d));
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
          img.onerror = () => resolve(); // tolerate missing alias frames
          img.src = u;
        }),
    ),
  );
  return cache;
}
