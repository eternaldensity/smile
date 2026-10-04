// Central sprite registry. Paths are relative to the Vite base.
const B = import.meta.env.BASE_URL || "./";

export const SPRITES = {
  brick: `${B}assets/brick.png`,
  rope: `${B}assets/rope.png`,
  smile: `${B}assets/smile.png`,
  panel: `${B}assets/panel.png`,
  dyno: `${B}assets/dyno.png`,
  weight: `${B}assets/weight.png`,
  q: `${B}assets/Q.png`,
  wood: [`${B}assets/wood0.png`, `${B}assets/wood1.png`, `${B}assets/wood2.png`],
  money: Array.from({ length: 11 }, (_, i) => `${B}assets/money/money${i}.png`),
  tnt: Array.from({ length: 7 }, (_, i) => (i === 0 ? "" : `${B}assets/TNT${i}.png`)),
  explode: Array.from({ length: 10 }, (_, i) => `${B}assets/explode/Explode${i}.png`),
  water: Array.from({ length: 4 }, (_, i) => `${B}assets/water${i}.png`),
  warp: Array.from({ length: 4 }, (_, i) => `${B}assets/warp${i}.png`),
  balloon: Array.from({ length: 4 }, (_, i) => `${B}assets/balloon${i}.png`),
  toll: Array.from({ length: 7 }, (_, i) => `${B}assets/toll${i}.png`),
  key: Array.from({ length: 7 }, (_, i) => (i === 0 ? "" : `${B}assets/key${i}.png`)),
  door: Array.from({ length: 8 }, (_, i) => (i === 0 ? "" : `${B}assets/door${i}.png`)),
  ladder: [`${B}assets/ladder0.png`, `${B}assets/ladder1.png`],
  energy: Array.from({ length: 10 }, (_, i) => `${B}assets/energy${i}.png`),
  switch: Array.from({ length: 8 }, (_, i) => `${B}assets/switch/switch${i}.png`),
  nitroBase: Array.from({ length: 5 }, (_, i) => `${B}assets/nitro/nitro${i}.png`),
  nitro0dir: Array.from({ length: 4 }, (_, i) => `${B}assets/nitro/nitro0_${i}.png`),
  nitro2dir: Array.from({ length: 4 }, (_, i) => `${B}assets/nitro/nitro2_${i}.png`),
  glass: [`${B}assets/glass0.png`, `${B}assets/glass1.png`],
  mince: [
    [`${B}assets/mince00.png`, `${B}assets/mince01.png`, `${B}assets/mince02.png`],
    [`${B}assets/mince10.png`, `${B}assets/mince11.png`, `${B}assets/mince12.png`],
  ],
} as const;

export function radarSprite(frame: number, dir: number): string {
  const f = frame <= 3 ? `${frame}${dir}` : `${frame}1`;
  return `${B}assets/radar/radar${f}.png`;
}

/** Key colors as the popups name them (key1..key6 sprites). */
export const KEY_NAMES = ["", "blue", "yellow", "red", "green", "black", "silver"];

export function conveySprite(dir: number, frame: number): string {
  return `${B}assets/convey/convey${dir}${frame}.png`;
}

export type ImageCache = Map<string, HTMLImageElement>;

export async function loadAllImages(): Promise<ImageCache> {
  const urls = new Set<string>();
  const push = (u: string) => {
    if (u) urls.add(u);
  };
  push(SPRITES.brick);
  push(SPRITES.rope);
  push(SPRITES.smile);
  push(SPRITES.panel);
  push(SPRITES.dyno);
  push(SPRITES.weight);
  push(SPRITES.q);
  for (const u of [...SPRITES.wood, ...SPRITES.money, ...SPRITES.tnt, ...SPRITES.explode,
    ...SPRITES.water, ...SPRITES.warp, ...SPRITES.balloon, ...SPRITES.toll,
    ...SPRITES.key, ...SPRITES.door, ...SPRITES.ladder, ...SPRITES.energy,
    ...SPRITES.switch, ...SPRITES.nitroBase, ...SPRITES.nitro0dir, ...SPRITES.nitro2dir,
    ...SPRITES.glass, ...SPRITES.mince[0]!, ...SPRITES.mince[1]!]) push(u);
  for (let f = 0; f <= 5; f++) for (let d = 1; d <= 4; d++) push(radarSprite(f, d));
  for (let d = 1; d <= 4; d++) for (let f = 0; f <= 3; f++) push(conveySprite(d, f));
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
