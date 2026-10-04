import { SoundBank } from "./audio";
import { TICK_MS, VIEW_RADIUS, TILE_PX, dDOWN, dLEFT, dRIGHT, dUP } from "./constants";
import { Engine } from "./engine";
import { shouldMove } from "./input";
import { parseLevelText } from "./level-format";
import { renderPlayer } from "./renderer";
import { loadAllImages, type ImageCache } from "./sprites";

const LEVELS = [
  "Level-1",
  ...Array.from({ length: 23 }, (_, i) => `Level${i}`),
];

const $ = (id: string) => document.getElementById(id)!;

async function fetchLevel(name: string): Promise<string> {
  const base = import.meta.env.BASE_URL || "./";
  const res = await fetch(`${base}levels/${name}.txt`);
  if (!res.ok) throw new Error(`Could not load ${name}: ${res.status}`);
  return res.text();
}

async function main(): Promise<void> {
  const levelSelect = $("levelSelect") as HTMLSelectElement;
  for (const l of LEVELS) {
    const o = document.createElement("option");
    o.value = l;
    o.textContent = l;
    levelSelect.appendChild(o);
  }
  levelSelect.value = "Level0";

  const cache: ImageCache = await loadAllImages();
  const sounds = new SoundBank();
  const eng = new Engine();
  const message = $("message");
  const whatsthere = $("whatsthere");
  const popups = $("popups");
  const boards = [$("board0") as HTMLCanvasElement, $("board1") as HTMLCanvasElement];
  const size = (VIEW_RADIUS * 2 + 1) * TILE_PX;
  for (const b of boards) {
    b.width = size;
    b.height = size;
  }
  const ctxs = boards.map((b) => b.getContext("2d")!);

  let current = "Level0";

  eng.events.sound = (name, _async) => sounds.play(name);
  eng.events.popup = (text) => {
    const div = document.createElement("div");
    div.textContent = text;
    popups.prepend(div);
    message.textContent = text;
  };
  eng.events.levelComplete = () => {
    message.textContent = "Level Complete!";
    const i = LEVELS.indexOf(current);
    const next = LEVELS[(i + 1) % LEVELS.length]!;
    setTimeout(() => void loadLevel(next), 800);
  };
  eng.events.levelFailed = () => {
    message.textContent = "Level Failed — press R to try again.";
  };
  eng.events.hudChanged = updateHud;

  function updateHud(): void {
    for (let s = 0; s < 2; s++) {
      const vis = s < eng.numPlayers;
      $("boardWrap" + s).classList.toggle("hidden", !vis);
      if (!vis) continue;
      $("score" + s).textContent = `$${eng.score[s] ?? 0}`;
      $("energy" + s).textContent = `${eng.energy[s] ?? 0} Kj${eng.waterSafe[s] ? " 🏊" : ""}`;
      $("lives" + s).textContent = `${eng.lives[s] ?? 0} ❤${eng.dead[s] ? " (out)" : ""}`;
      const got: string[] = [];
      for (let k = 1; k <= 6; k++) if (eng.keys[k]?.[s]) got.push(`K${k}`);
      $("keys" + s).textContent = got.join(" ") || "no keys";
    }
  }

  async function loadLevel(name: string): Promise<void> {
    current = name;
    levelSelect.value = name;
    popups.innerHTML = "";
    try {
      const text = await fetchLevel(name);
      const parsed = parseLevelText(text);
      eng.loadParsed(parsed, name, true);
      message.textContent = `${name}: ${parsed.xsize + 1}×${parsed.ysize + 1}, ${parsed.players}P`;
    } catch (e) {
      message.textContent = `Load failed: ${e instanceof Error ? e.message : e}`;
    }
    updateHud();
  }

  function render(): void {
    for (let s = 0; s < eng.numPlayers; s++) renderPlayer(ctxs[s]!, cache, eng, s);
  }

  // Fixed-timestep logic (VB tmrLoop 25ms) + render each tick.
  setInterval(() => {
    eng.tick();
    render();
  }, TICK_MS);
  setInterval(() => {
    $("fps").textContent = `FPS: ${eng.fpsCount}`;
    eng.fpsCount = 0;
  }, 1000);

  // --- input (PB_KeyDown port) ---
  // P1: WASD + End(starve) + ScrollLock(view). P2: Arrows + Esc(starve) + Space.
  // (The VB original had movement swapped: arrows P1, A/W/S/Z P2 with S=right.)
  // Holding a movement key keeps stepping (throttled); other keys ignore repeat.
  const lastStep: Record<number, number> = {};
  function gatedStep(s: number, dir: 1 | 2 | 3 | 4, isRepeat: boolean): void {
    const now = performance.now();
    if (!shouldMove(lastStep[s] ?? Number.NEGATIVE_INFINITY, now, isRepeat)) return;
    lastStep[s] = now;
    stepOrPan(s, dir);
  }
  window.addEventListener("keydown", (e) => {
    const movement = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyW", "KeyS", "KeyD"].includes(e.code);
    if (e.repeat && !movement) {
      if (e.code === "Space") e.preventDefault();
      return;
    }
    const p1max = eng.numPlayers >= 1;
    const p2max = eng.numPlayers >= 2;
    switch (e.code) {
      case "ArrowLeft":
        if (p2max) gatedStep(1, dLEFT, e.repeat);
        e.preventDefault();
        return;
      case "ArrowUp":
        if (p2max) gatedStep(1, dUP, e.repeat);
        e.preventDefault();
        return;
      case "ArrowRight":
        if (p2max) gatedStep(1, dRIGHT, e.repeat);
        e.preventDefault();
        return;
      case "ArrowDown":
        if (p2max) gatedStep(1, dDOWN, e.repeat);
        e.preventDefault();
        return;
      case "End":
        if (p1max) eng.suicide(0);
        return;
      case "ScrollLock":
        if (p1max) eng.toggleView(0);
        return;
      case "KeyA":
        if (p1max) gatedStep(0, dLEFT, e.repeat);
        return;
      case "KeyW":
        if (p1max) gatedStep(0, dUP, e.repeat);
        return;
      case "KeyS":
        if (p1max) gatedStep(0, dDOWN, e.repeat);
        return;
      case "KeyD":
        if (p1max) gatedStep(0, dRIGHT, e.repeat);
        return;
      case "Space":
        if (p2max) {
          eng.toggleView(1);
          e.preventDefault();
        }
        return;
      case "Escape":
        if (p2max) eng.suicide(1);
        return;
      case "KeyR":
        void loadLevel(current);
        return;
      default:
        break;
    }
  });

  function stepOrPan(s: number, dir: 1 | 2 | 3 | 4): void {
    if (eng.blnView[s]) eng.press(s, dir);
    else eng.panView(s, dir);
    render();
  }

  // --- mouse (PB_MouseDown port) ---
  boards.forEach((board, idx) => {
    board.addEventListener("contextmenu", (e) => e.preventDefault());
    board.addEventListener("mousedown", (e) => {
      if (idx >= eng.numPlayers) return;
      const rect = board.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * size;
      const py = ((e.clientY - rect.top) / rect.height) * size;
      let x = Math.floor(px / TILE_PX) + eng.viewX[idx]! - VIEW_RADIUS;
      let y = Math.floor(py / TILE_PX) + eng.viewY[idx]! - VIEW_RADIUS;
      x = Math.round(x);
      y = Math.round(y);
      if (e.button === 0) {
        const sx = eng.smileX[idx]!;
        const sy = eng.smileY[idx]!;
        if (x === sx && y > sy) stepOrPan(idx, dDOWN);
        else if (x === sx && y < sy) stepOrPan(idx, dUP);
        else if (y === sy && x > sx) stepOrPan(idx, dRIGHT);
        else if (y === sy && x < sx) stepOrPan(idx, dLEFT);
      } else if (e.button === 2) {
        whatsthere.textContent = eng.inspect(x, y);
      }
    });
  });

  $("loadBtn").addEventListener("click", () => void loadLevel(levelSelect.value));
  $("restartBtn").addEventListener("click", () => void loadLevel(current));
  $("starveBtn").addEventListener("click", () => eng.suicide(0));

  await loadLevel("Level0");
}

void main();
