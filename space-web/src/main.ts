import { SoundBank } from "./audio";
import { DOWN, LEFT, RIGHT, UP } from "./constants";
import { Engine } from "./engine";
import { fetchLevel } from "./levels";
import { render } from "./renderer";
import { loadAllImages } from "./sprites";

const LEVELS = Array.from({ length: 16 }, (_, i) => i + 1);
const STEP_MS = 25;

const $ = (id: string) => document.getElementById(id)!;

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
  const sprites = await loadAllImages();
  const sounds = new SoundBank();
  const stars = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${import.meta.env.BASE_URL || "./"}assets/stars.png`;
  });

  const eng = new Engine();
  const message = $("message");
  let current = 1;

  eng.events.sound = (n) => sounds.play(n);
  eng.events.message = (t) => {
    message.textContent = t;
  };
  eng.events.finished = () => {
    setTimeout(() => void loadLevel(current % 16 + 1), 900);
  };

  async function loadLevel(n: number): Promise<void> {
    current = n;
    levelSelect.value = String(n);
    try {
      eng.load(await fetchLevel(n), n);
      $("levelLabel").textContent = `Level ${n} of 16`;
      message.textContent = `Opening level ${n}. Get the ship to the door!`;
      sounds.play("start");
    } catch (e) {
      message.textContent = `Load failed: ${e instanceof Error ? e.message : e}`;
    }
  }

  function draw(): void {
    render(ctx, sprites, stars, eng);
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

  // Arrows steer the sliding ship (first press starts the timers, like VB).
  window.addEventListener("keydown", (e) => {
    switch (e.code) {
      case "ArrowLeft":
        eng.steer(LEFT);
        e.preventDefault();
        break;
      case "ArrowUp":
        eng.steer(UP);
        e.preventDefault();
        break;
      case "ArrowRight":
        eng.steer(RIGHT);
        e.preventDefault();
        break;
      case "ArrowDown":
        eng.steer(DOWN);
        e.preventDefault();
        break;
      case "KeyR":
        void loadLevel(current);
        break;
      default:
        break;
    }
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
