import { ARROW, TILE_PX } from "./constants";
import type { Dir } from "./constants";

export type SpriteMap = Map<string, HTMLCanvasElement>;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = TILE_PX;
  c.height = TILE_PX;
  return [c, c.getContext("2d")!];
}

function base(draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const [c, g] = canvas();
  draw(g);
  return c;
}

const px = TILE_PX;

/** All sprites are redrawn vector-style originals (the VB .bmps are lost). */
export function paintSprites(): SpriteMap {
  const m: SpriteMap = new Map();
  m.set("ship", base((g) => {
    g.fillStyle = "#39c2ff";
    g.beginPath();
    g.moveTo(px / 2, 2);
    g.lineTo(px - 3, px - 3);
    g.lineTo(px / 2, px - 8);
    g.lineTo(3, px - 3);
    g.closePath();
    g.fill();
    g.fillStyle = "#e8fbff";
    g.fillRect(px / 2 - 2, 8, 4, 8);
  }));
  m.set("shipBang", base((g) => {
    g.fillStyle = "#ffdd33";
    g.beginPath();
    g.arc(px / 2, px / 2, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ff6a00";
    g.beginPath();
    g.arc(px / 2, px / 2, 8, 0, Math.PI * 2);
    g.fill();
  }));
  m.set("enemy", base((g) => {
    g.fillStyle = "#ff4d4d";
    g.beginPath();
    g.moveTo(4, 6);
    g.lineTo(px / 2, 3);
    g.lineTo(px - 4, 6);
    g.lineTo(px - 7, px - 4);
    g.lineTo(7, px - 4);
    g.closePath();
    g.fill();
    g.fillStyle = "#5c0000";
    g.fillRect(px / 2 - 4, 10, 3, 3);
    g.fillRect(px / 2 + 1, 10, 3, 3);
  }));
  m.set("brick", base((g) => {
    g.fillStyle = "#8a5a2b";
    g.fillRect(0, 0, px, px);
    g.fillStyle = "#6e451f";
    for (let r = 0; r < 4; r++) {
      g.fillRect(0, r * 8 + 7, px, 1);
      for (let cix = 0; cix < 4; cix++) g.fillRect(((r % 2) * 4 + cix * 8) % px, r * 8, 1, 8);
    }
  }));
  m.set("wood", base((g) => {
    g.fillStyle = "#c79a4b";
    g.fillRect(0, 0, px, px);
    g.strokeStyle = "#8a6526";
    g.lineWidth = 1;
    for (let r = 6; r < px; r += 8) {
      g.beginPath();
      g.moveTo(0, r);
      g.lineTo(px, r);
      g.stroke();
    }
  }));
  m.set("panel", base((g) => {
    g.fillStyle = "#9aa3ad";
    g.fillRect(0, 0, px, px);
    g.fillStyle = "#7c848e";
    g.fillRect(3, 3, px - 6, px - 6);
    g.fillStyle = "#c7ced6";
    g.fillRect(6, 6, px - 12, px - 12);
  }));
  m.set("bounce", base((g) => {
    g.fillStyle = "#2ee66b";
    g.fillRect(0, 0, px, px);
    g.fillStyle = "#0a7a33";
    for (let i = -px; i < px * 2; i += 8) {
      g.fillRect(i, 0, 3, px);
    }
  }));
  m.set("metal", base((g) => {
    g.fillStyle = "#555c66";
    g.fillRect(0, 0, px, px);
    g.fillStyle = "#ff3b30";
    g.beginPath();
    g.arc(px / 2, px / 2, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.fillRect(px / 2 - 1, 6, 2, 20);
    g.fillRect(6, px / 2 - 1, 20, 2);
  }));
  m.set("door", base((g) => {
    g.fillStyle = "#3a2b1a";
    g.fillRect(0, 0, px, px);
    g.fillStyle = "#ffd75e";
    g.fillRect(4, 4, px - 8, px - 8);
    g.fillStyle = "#3a2b1a";
    g.fillRect(px / 2 - 3, 4, 6, px - 8);
  }));
  m.set("warp", base((g) => {
    g.fillStyle = "#1a0b2e";
    g.fillRect(0, 0, px, px);
    g.strokeStyle = "#c77dff";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(px / 2, px / 2, 10, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#5a189a";
    g.beginPath();
    g.arc(px / 2, px / 2, 5, 0, Math.PI * 2);
    g.stroke();
  }));
  m.set("slock", base((g) => {
    g.fillStyle = "#20242a";
    g.fillRect(0, 0, px, px);
    g.fillStyle = "#39c2ff";
    g.font = "bold 20px system-ui";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("S", px / 2, px / 2 + 1);
  }));
  m.set("elock", base((g) => {
    g.fillStyle = "#20242a";
    g.fillRect(0, 0, px, px);
    g.fillStyle = "#ff4d4d";
    g.font = "bold 20px system-ui";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("E", px / 2, px / 2 + 1);
  }));
  for (const [name, ang] of [["up", -Math.PI / 2], ["right", 0], ["down", Math.PI / 2], ["left", Math.PI]] as const) {
    m.set(`arrow-${name}`, base((g) => {
      g.fillStyle = "#0d2b45";
      g.fillRect(0, 0, px, px);
      g.save();
      g.translate(px / 2, px / 2);
      g.rotate(ang);
      g.fillStyle = "#ffd75e";
      g.beginPath();
      g.moveTo(10, 0);
      g.lineTo(-4, -8);
      g.lineTo(-4, 8);
      g.closePath();
      g.fill();
      g.restore();
    }));
  }
  m.set("roof", base((g) => {
    g.fillStyle = "#7a1f1f";
    g.fillRect(0, 6, px, 12);
    g.fillStyle = "#a83a3a";
    for (let x = 0; x < px; x += 8) g.fillRect(x, 6, 4, 12);
  }));
  m.set("magnet", base((g) => {
    g.fillStyle = "#d8d8d8";
    g.fillRect(6, 4, 8, 24);
    g.fillRect(18, 4, 8, 24);
    g.fillStyle = "#e33";
    g.fillRect(6, 4, 8, 8);
    g.fillRect(18, 4, 8, 8);
    g.fillStyle = "#888";
    g.fillRect(6, 24, 20, 4);
  }));
  return m;
}

export function arrowKey(dir: Dir): string {
  return `arrow-${(["left", "right", "up", "down"] as const)[dir]}`;
}

export function spriteFor(type: number, dir: Dir, bang: boolean): string {
  if (bang) return "shipBang";
  switch (type) {
    case 0: return "ship";
    case 1: return "enemy";
    case 2: return "brick";
    case 3: return "wood";
    case 4: return "panel";
    case 5: return "bounce";
    case 6: return "metal";
    case 7: return "door";
    case 8: return "warp";
    case 9: return "slock";
    case 10: return "elock";
    case ARROW: return arrowKey(dir);
    case 12: return "roof";
    case 13: return "magnet";
    default: return "brick";
  }
}
