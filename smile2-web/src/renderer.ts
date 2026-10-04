import {
  BRICK, DOOR, DYNO, ELEVATED, ENERGY, EXPLODE, GLASS, ICE, KEY, MAGNET,
  MONEY, NITRO, NOWT, ONEWAY, PANEL, RADAR, SMILE, STAIR, SWITCH, TNT,
  TWOWAY, WARP, WATER, WOOD,
  TILE_PX, VIEW_RADIUS,
} from "./constants";
import type { Engine } from "./engine";
import { SPRITES, radarSprite, type ImageCache } from "./sprites";

function drawTile(
  ctx: CanvasRenderingContext2D,
  cache: ImageCache,
  url: string,
  dx: number,
  dy: number,
): void {
  const img = cache.get(url);
  if (!img) {
    ctx.fillStyle = "#f0f";
    ctx.fillRect(dx, dy, TILE_PX, TILE_PX);
    return;
  }
  // Normalize mixed-size originals to the 32px grid.
  ctx.drawImage(img, dx, dy, TILE_PX, TILE_PX);
}

/** Canvas renderer — draw order mirrors Game.frm MainLoop. */
export function renderPlayer(
  ctx: CanvasRenderingContext2D,
  cache: ImageCache,
  eng: Engine,
  s: number,
): void {
  const vx = eng.viewX[s]!;
  const vy = eng.viewY[s]!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, (VIEW_RADIUS * 2 + 1) * TILE_PX, (VIEW_RADIUS * 2 + 1) * TILE_PX);

  for (let x = vx - VIEW_RADIUS; x <= vx + VIEW_RADIUS; x++) {
    for (let y = vy - VIEW_RADIUS; y <= vy + VIEW_RADIUS; y++) {
      if (x < 0 || y < 0 || x > eng.xsize || y > eng.ysize) continue;
      const dx = (x - vx + VIEW_RADIUS) * TILE_PX;
      const dy = (y - vy + VIEW_RADIUS) * TILE_PX;
      const p = eng.perm[x]![y]!;
      const c = eng.coll[x]![y]!;
      const m = eng.move[x]![y]!;

      switch (p.value) {
        case BRICK:
        case ICE:
        case WARP:
        case STAIR:
        case ELEVATED:
          drawTile(ctx, cache, permSprite(p.value), dx, dy);
          break;
        case ONEWAY:
          if (p.extra1 >= 1 && p.extra1 <= 4) drawTile(ctx, cache, SPRITES.oneway[p.extra1]!, dx, dy);
          break;
        case TWOWAY:
          if (p.extra1 >= 0 && p.extra1 <= 4) drawTile(ctx, cache, SPRITES.twoway[p.extra1]!, dx, dy);
          break;
        case DOOR:
          drawTile(ctx, cache, SPRITES.door[p.extra2 === 0 ? p.extra1 : 7] ?? SPRITES.door[7]!, dx, dy);
          break;
        default:
          break;
      }

      switch (c.value) {
        case KEY:
          if (c.extra1 >= 1 && c.extra1 <= 6) drawTile(ctx, cache, SPRITES.key[c.extra1]!, dx, dy);
          break;
        case MONEY:
          if (c.extra1 >= 0 && c.extra1 <= 10) drawTile(ctx, cache, SPRITES.money[c.extra1]!, dx, dy);
          break;
        case ENERGY:
          if (c.extra1 >= 0 && c.extra1 <= 7) drawTile(ctx, cache, SPRITES.energy[c.extra1]!, dx, dy);
          break;
        case SWITCH:
          if (c.extra1 >= 0 && c.extra1 <= 7) drawTile(ctx, cache, SPRITES.switch[c.extra1]!, dx, dy);
          break;
        default:
          break;
      }

      switch (m.value) {
        case SMILE:
        case WATER:
        case PANEL:
          drawTile(ctx, cache, moveSprite(m.value), dx, dy);
          break;
        case WOOD:
          drawTile(ctx, cache, SPRITES.wood[m.extra1] ?? SPRITES.wood[0]!, dx, dy);
          break;
        case DYNO:
          drawTile(ctx, cache, SPRITES.dyno, dx, dy);
          break;
        case TNT:
          drawTile(ctx, cache, SPRITES.tnt[m.extra1 + 1] ?? SPRITES.tnt[1]!, dx, dy);
          break;
        case EXPLODE:
          if (m.extra1 >= 0 && m.extra1 <= 9) drawTile(ctx, cache, SPRITES.explode[m.extra1]!, dx, dy);
          break;
        case NITRO: {
          let url = SPRITES.nitroBase[m.extra1] ?? SPRITES.nitroBase[0]!;
          if (m.extra1 === 0) url = SPRITES.nitro0dir[eng.nIndex] ?? url;
          else if (m.extra1 === 2) url = SPRITES.nitro2dir[eng.nIndex] ?? url;
          drawTile(ctx, cache, url, dx, dy);
          break;
        }
        case GLASS:
          drawTile(ctx, cache, SPRITES.glass[m.extra1] ?? SPRITES.glass[0]!, dx, dy);
          break;
        case RADAR:
          drawTile(ctx, cache, radarSprite(m.extra1, m.extra2), dx, dy);
          break;
        case MAGNET:
          drawTile(ctx, cache, SPRITES.magnet[m.extra1] ?? SPRITES.magnet[0]!, dx, dy);
          break;
        default:
          break;
      }

      if (p.value === BRICK) drawTile(ctx, cache, SPRITES.brick, dx, dy);
      // Animated water/warp overlay (VB swaps the base picture).
      if (p.value === WARP) drawTile(ctx, cache, SPRITES.warp[eng.waterFrame]!, dx, dy);
      if (m.value === WATER) drawTile(ctx, cache, SPRITES.water[eng.waterFrame]!, dx, dy);
    }
  }

  // Popup markers (VB: QPic vbSrcInvert).
  for (const pp of eng.popups) {
    if (!pp.s) continue;
    if (pp.x > vx - 7 && pp.x < vx + 8 && pp.y > vy - 7 && pp.y < vy + 8) {
      const dx = (pp.x - vx + VIEW_RADIUS) * TILE_PX;
      const dy = (pp.y - vy + VIEW_RADIUS) * TILE_PX;
      ctx.save();
      ctx.globalAlpha = 0.85;
      drawTile(ctx, cache, SPRITES.q, dx, dy);
      ctx.restore();
    }
  }
}

function permSprite(v: number): string {
  switch (v) {
    case BRICK:
      return SPRITES.brick;
    case ICE:
      return SPRITES.ice;
    case WARP:
      return SPRITES.warp[0]!;
    case STAIR:
      return SPRITES.stair;
    case ELEVATED:
      return SPRITES.elevated;
    default:
      return SPRITES.brick;
  }
}

function moveSprite(v: number): string {
  switch (v) {
    case SMILE:
      return SPRITES.smile;
    case WATER:
      return SPRITES.water[0]!;
    case PANEL:
      return SPRITES.panel;
    default:
      return SPRITES.brick;
  }
}

export { DOOR, DYNO, ELEVATED, ENERGY, EXPLODE, GLASS, ICE, KEY, MAGNET, MONEY, NITRO, NOWT, ONEWAY, PANEL, RADAR, SMILE, STAIR, SWITCH, TNT, TWOWAY, WARP, WATER, WOOD };
