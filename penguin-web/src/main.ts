import { SoundBank } from "./audio";
import { DOWN, LEFT, PENGUIN_NAMES, RIGHT, UP, type Dir } from "./constants";
import { Engine } from "./engine";
import { fetchLevel, levelHint } from "./levels";
import { render } from "./renderer";
import { SPRITES, loadAllImages, type ImageCache } from "./sprites";

const LEVELS = [...Array.from({ length: 16 }, (_, i) => i + 1), 17, 18, 19, 20, 21];
const STEP_MS = 25;

const $ = (id: string) => document.getElementById(id)!;

// Three control sets, one per penguin: WASD -> Zidgel, IJKL -> Midgel,
// Arrows -> Fidgel (the VB original used arrows/WASD-legacy/PL;.’).
const SETS: Record<string, { p: number; dir: Dir }[]> = {
  KeyW: [{ p: 0, dir: UP }],
  KeyA: [{ p: 0, dir: LEFT }],
  KeyS: [{ p: 0, dir: DOWN }],
  KeyD: [{ p: 0, dir: RIGHT }],
  KeyI: [{ p: 1, dir: UP }],
  KeyJ: [{ p: 1, dir: LEFT }],
  KeyK: [{ p: 1, dir: DOWN }],
  KeyL: [{ p: 1, dir: RIGHT }],
  ArrowUp: [{ p: 2, dir: UP }],
  ArrowLeft: [{ p: 2, dir: LEFT }],
  ArrowDown: [{ p: 2, dir: DOWN }],
  ArrowRight: [{ p: 2, dir: RIGHT }],
};

async function main(): Promise<void> {
  const levelSelect = $("levelSelect") as HTMLSelectElement;
  for (const l of LEVELS) {
    const o = document.createElement("option");
    o.value = String(l);
    o.textContent = `Level ${l}`;
    levelSelect.appendChild(o);
  }

  const canvas = $("board") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const sprites: ImageCache = await loadAllImages();
  const sounds = new SoundBank();

  const eng = new Engine();
  const message = $("message");
  let current = 1;

  // Penguin roster chips (flippers per penguin).
  const chips: HTMLElement[] = [];
  {
    const bar = $("penguins");
    for (let p = 0; p < 3; p++) {
      const span = document.createElement("span");
      span.className = "penguin";
      const img = document.createElement("img");
      img.src = [SPRITES.penguin[0]![0], SPRITES.penguin[1]![0], SPRITES.penguin[2]![0]]![p]!;
      img.alt = PENGUIN_NAMES[p]!;
      span.append(img, document.createTextNode(""));
      bar.appendChild(span);
      chips.push(span);
    }
  }

  eng.events.sound = (n) => sounds.play(n);
  eng.events.message = (t) => {
    message.textContent = t;
  };
  eng.events.finished = () => {
    message.textContent = `Level ${current} complete!`;
    setTimeout(() => void loadLevel(current % 21 + 1), 900);
  };
  eng.events.hudChanged = updateHud;

  function updateHud(): void {
    for (let p = 0; p < 3; p++) {
      const o = eng.objs.find((ob) => ob.id === p);
      const chip = chips[p]!;
      chip.classList.toggle("out", !o?.visible);
      const fl = o?.flippers ?? 0;
      chip.lastChild!.textContent = `${PENGUIN_NAMES[p]}${fl > 0 ? ` 🏊${fl}` : ""}`;
    }
    $("bolts").textContent = `Bolts: ${eng.boltsLeft}`;
    $("home").textContent = `Home: ${eng.homeCount}/${eng.players}`;
  }

  async function loadLevel(n: number): Promise<void> {
    current = n;
    levelSelect.value = String(n);
    try {
      eng.load(await fetchLevel(n), n);
      $("hint").textContent = levelHint(n);
      message.textContent = `Level ${n}: collect every bolt, then bring the penguins home!`;
    } catch (e) {
      message.textContent = `Load failed: ${e instanceof Error ? e.message : e}`;
    }
    updateHud();
  }

  function draw(): void {
    render(ctx, sprites, eng);
  }

  let frames = 0;
  setInterval(() => {
    eng.tick(STEP_MS);
    draw();
    frames++;
  }, STEP_MS);
  setInterval(() => {
    $("fps").textContent = `FPS: ${frames}`;
    frames = 0;
  }, 1000);

  window.addEventListener("keydown", (e) => {
    if (e.repeat && !(e.code in SETS)) return;
    const moves = SETS[e.code];
    if (!moves) {
      if (e.code === "KeyR" && !e.repeat) void loadLevel(current);
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    for (const m of moves) eng.key(m.p, m.dir);
    draw();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 12);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 12);
    message.textContent = eng.inspect(x, y);
  });

  $("loadBtn").addEventListener("click", () => void loadLevel(Number(levelSelect.value)));
  $("muteBtn").addEventListener("click", () => {
    sounds.muted = !sounds.muted;
    $("muteBtn").textContent = sounds.muted ? "Unmute" : "Mute";
  });

  await loadLevel(1);
}

void main();
