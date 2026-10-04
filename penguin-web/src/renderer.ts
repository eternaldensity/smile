import { BOARD_PX, TILE_PX } from "./constants";
import type { Engine } from "./engine";
import { spriteFor, type ImageCache } from "./sprites";

/** Renders the 12x12 board in control-id order (VB z-order). */
export function render(
  ctx: CanvasRenderingContext2D,
  sprites: ImageCache,
  eng: Engine,
): void {
  ctx.fillStyle = "#0a0a18";
  ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
  const sorted = [...eng.objs].sort((a, b) => a.id - b.id);
  for (const o of sorted) {
    if (!o.visible) continue;
    const img = sprites.get(spriteFor(o.type, o.pname, o.dir));
    if (!img) {
      ctx.fillStyle = "#f0f";
      ctx.fillRect(o.x * TILE_PX, o.y * TILE_PX, TILE_PX, TILE_PX);
      continue;
    }
    ctx.drawImage(img, o.x * TILE_PX, o.y * TILE_PX, TILE_PX, TILE_PX);
  }
}
