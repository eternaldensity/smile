import { BOARD_PX, TILE_PX } from "./constants";
import type { Engine } from "./engine";
import { spriteFor, type SpriteMap } from "./sprites";

/** Renders the 12x12 board over the starfield backdrop. */
export function render(
  ctx: CanvasRenderingContext2D,
  sprites: SpriteMap,
  stars: HTMLImageElement | null,
  eng: Engine,
): void {
  if (stars) ctx.drawImage(stars, 0, 0, BOARD_PX, BOARD_PX);
  else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
  }
  // Draw in id order (VB z-order); ship (id 0) first, rest over it.
  const sorted = [...eng.objs].sort((a, b) => a.id - b.id);
  for (const o of sorted) {
    if (!o.visible) continue;
    const img = sprites.get(spriteFor(o.type, o.dir, o.bang));
    if (!img) continue;
    // Roof sits high in its cell like the VB 300px-high image.
    const dy = o.type === 12 ? -6 : 0;
    ctx.drawImage(img, o.x * TILE_PX, o.y * TILE_PX + dy, TILE_PX, TILE_PX);
  }
}
