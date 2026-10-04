import { SoundBank } from "./audio";
import { TICK_MS, VIEW_RADIUS, TILE_PX, dDOWN, dLEFT, dRIGHT, dUP, type Direction } from "./constants";
import { Engine, type SubResult } from "./engine";
import { shouldMove } from "./input";
import { parseLevelText, subpathToName } from "./level-format";
import { renderPlayer } from "./renderer";
import { KEY_NAMES, SPRITES, loadAllImages, type ImageCache } from "./sprites";

const LEVELS = ["Level-1", "Level0", "Level1", "Level2", "Level3", "Level4"];

const $ = (id: string) => document.getElementById(id)!;

async function fetchLevelText(name: string): Promise<string> {
  const base = import.meta.env.BASE_URL || "./";
  const res = await fetch(`${base}levels/${name}`);
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
  const subCanvas = $("boardSub") as HTMLCanvasElement;
  subCanvas.width = size;
  subCanvas.height = size;
  const subCtx = subCanvas.getContext("2d")!;

  let current = "Level0";
  let tollOpen = false;
  let sub: { eng: Engine; smileNum: number; name: string } | null = null;

  const active = (): Engine => (sub ? sub.eng : eng);

  eng.events.sound = (name) => sounds.play(name);
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
  eng.events.toll = (amount) => {
    tollOpen = true;
    $("tollText").textContent = `Pay toll of $${amount}?`;
    $("tollModal").classList.remove("hidden");
  };
  eng.events.openSub = (subpath, smileNum) => {
    void openSub(subpath, smileNum);
  };
  eng.events.subComplete = () => {};

  // Key inventory: one slot per key color, lit when held (like VB's picKeys
  // strip, but all six slots stay visible so the set is always clear).
  function buildKeyStrip(el: HTMLElement): HTMLImageElement[] {
    el.classList.add("keys");
    el.textContent = "";
    const imgs: HTMLImageElement[] = [];
    for (let k = 1; k <= 6; k++) {
      const img = document.createElement("img");
      img.src = SPRITES.key[k]!;
      img.alt = `${KEY_NAMES[k]} key`;
      img.title = `${KEY_NAMES[k]} key`;
      img.classList.add("missing");
      el.appendChild(img);
      imgs.push(img);
    }
    return imgs;
  }
  const keyImgs = [$("keys0"), $("keys1")].map((el) => buildKeyStrip(el));
  const keyImgsSub = buildKeyStrip($("keysSub"));

  function paintKeys(imgs: HTMLImageElement[], get: (k: number) => boolean): void {
    for (let k = 1; k <= 6; k++) imgs[k - 1]!.classList.toggle("missing", !get(k));
  }

  function updateHud(): void {
    for (let s = 0; s < 2; s++) {
      const vis = s < eng.numPlayers;
      $("boardWrap" + s).classList.toggle("hidden", !vis);
      if (!vis) continue;
      $("score" + s).textContent = `$${eng.score[s] ?? 0}`;
      $("energy" + s).textContent = `${eng.energy[s] ?? 0} Kj${eng.waterSafe[s] ? " 🏊" : ""}`;
      $("lives" + s).textContent = `${eng.lives[s] ?? 0} ❤${eng.dead[s] ? " (out)" : ""}`;
      $("shield" + s).textContent = `${eng.shields[s] ?? 0}S 🛡`;
      paintKeys(keyImgs[s]!, (k) => !!eng.keys[k]?.[s]);
    }
  }

  function updateSubHud(seng: Engine): void {
    const s = seng.subSmileNum;
    $("scoreSub").textContent = `$${seng.score[s] ?? 0}`;
    $("energySub").textContent = `${seng.energy[s] ?? 0} Kj`;
    $("livesSub").textContent = `${seng.lives[s] ?? 0} ❤`;
    $("shieldSub").textContent = `${seng.shields[s] ?? 0}S 🛡`;
    paintKeys(keyImgsSub, (k) => !!seng.keys[k]?.[s]);
  }

  async function loadLevel(name: string): Promise<void> {
    current = name;
    levelSelect.value = name;
    popups.innerHTML = "";
    closeSub(false);
    try {
      const text = await fetchLevelText(`${name}.txt`);
      const parsed = parseLevelText(text);
      eng.blnSub = false;
      eng.loadParsed(parsed, name, true);
      message.textContent = `${name}: ${parsed.xsize + 1}×${parsed.ysize + 1}, ${parsed.players}P`;
    } catch (e) {
      message.textContent = `Load failed: ${e instanceof Error ? e.message : e}`;
    }
    updateHud();
  }

  async function openSub(subpath: string, smileNum: number): Promise<void> {
    const name = subpathToName(subpath);
    if (!name) {
      message.textContent = "Sublevel has no path — gate stays shut.";
      eng.blnInSub = false;
      return;
    }
    try {
      const text = await fetchLevelText(name);
      const parsed = parseLevelText(text);
      const seng = new Engine();
      seng.events.sound = (n) => sounds.play(n);
      seng.events.popup = (t) => {
        $("subMessage").textContent = t;
      };
      seng.events.hudChanged = () => updateSubHud(seng);
      seng.events.levelComplete = () => {};
      seng.events.levelFailed = () => {};
      seng.events.toll = () => {
        $("subMessage").textContent = "Tolls don't take payment in sublevels.";
      };
      seng.events.openSub = () => {
        $("subMessage").textContent = "No nested sublevels.";
      };
      seng.events.subComplete = (r: SubResult) => closeSub(r.success, r);
      seng.blnSub = true;
      seng.subSmileNum = smileNum;
      seng.loadParsed(parsed, `sub:${name}`, true);
      sub = { eng: seng, smileNum, name };
      $("subTitle").textContent = `Sublevel: ${name}`;
      $("subMessage").textContent = "Clear it for a bonus — 1 life!";
      $("subWrap").classList.remove("hidden");
      updateSubHud(seng);
    } catch (e) {
      message.textContent = `Sublevel ${name} missing — gate stays shut.`;
      eng.blnInSub = false;
    }
  }

  function closeSub(success: boolean, result?: SubResult): void {
    if (!sub) return;
    if (result) eng.mergeSub(result, sub.smileNum);
    else eng.blnInSub = false;
    if (success) message.textContent = "Sublevel cleared — bonus merged!";
    sub = null;
    $("subWrap").classList.add("hidden");
    updateHud();
  }

  function render(): void {
    if (sub) {
      for (let s = 0; s < sub.eng.numPlayers; s++) {
        if (s === 0) renderPlayer(subCtx, cache, sub.eng, s);
      }
    } else {
      for (let s = 0; s < eng.numPlayers; s++) renderPlayer(ctxs[s]!, cache, eng, s);
    }
  }

  setInterval(() => {
    if (sub) {
      sub.eng.tick();
      renderPlayer(subCtx, cache, sub.eng, 0);
    } else if (!tollOpen) {
      eng.tick();
      render();
    }
  }, TICK_MS);
  setInterval(() => {
    $("fps").textContent = `FPS: ${eng.fpsCount + (sub ? sub.eng.fpsCount : 0)}`;
    eng.fpsCount = 0;
    if (sub) sub.eng.fpsCount = 0;
  }, 1000);

  function closeToll(pay: boolean): void {
    $("tollModal").classList.add("hidden");
    tollOpen = false;
    if (pay) {
      if (!eng.payToll()) message.textContent = "Toll not paid.";
    } else {
      eng.declineToll();
    }
    render();
  }
  $("tollPay").addEventListener("click", () => closeToll(true));
  $("tollDecline").addEventListener("click", () => closeToll(false));

  window.addEventListener("keydown", (e) => {
    if (tollOpen) {
      if (e.code === "Enter") closeToll(true);
      else if (e.code === "Escape") closeToll(false);
      e.preventDefault();
      return;
    }
    const movement = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyW", "KeyS", "KeyD"].includes(e.code);
    if (e.repeat && !movement) {
      if (e.code === "Space") e.preventDefault();
      return;
    }
    const g = active();
    const p1max = !sub && g.numPlayers >= 1;
    const p2max = !sub && g.numPlayers >= 2;
    const anyP = sub ? g.numPlayers >= 1 : p1max;
    switch (e.code) {
      case "ArrowLeft":
        if (p2max) gatedStep(g, 1, dLEFT, e.repeat);
        else if (sub) gatedStep(g, 0, dLEFT, e.repeat);
        e.preventDefault();
        return;
      case "ArrowUp":
        if (p2max) gatedStep(g, 1, dUP, e.repeat);
        else if (sub) gatedStep(g, 0, dUP, e.repeat);
        e.preventDefault();
        return;
      case "ArrowRight":
        if (p2max) gatedStep(g, 1, dRIGHT, e.repeat);
        else if (sub) gatedStep(g, 0, dRIGHT, e.repeat);
        e.preventDefault();
        return;
      case "ArrowDown":
        if (p2max) gatedStep(g, 1, dDOWN, e.repeat);
        else if (sub) gatedStep(g, 0, dDOWN, e.repeat);
        e.preventDefault();
        return;
      case "End":
        if (anyP) g.suicide(0);
        return;
      case "ScrollLock":
        if (anyP) g.toggleView(0);
        return;
      case "KeyA":
        if (p1max) gatedStep(g, 0, dLEFT, e.repeat);
        else if (sub) gatedStep(g, 0, dLEFT, e.repeat);
        return;
      case "KeyW":
        if (p1max) gatedStep(g, 0, dUP, e.repeat);
        else if (sub) gatedStep(g, 0, dUP, e.repeat);
        return;
      case "KeyS":
        if (p1max) gatedStep(g, 0, dDOWN, e.repeat);
        else if (sub) gatedStep(g, 0, dDOWN, e.repeat);
        return;
      case "KeyD":
        if (p1max) gatedStep(g, 0, dRIGHT, e.repeat);
        else if (sub) gatedStep(g, 0, dRIGHT, e.repeat);
        return;
      case "Space":
        if (p2max) {
          g.toggleView(1);
          e.preventDefault();
        }
        return;
      case "Escape":
        if (p2max) g.suicide(1);
        return;
      case "KeyR":
        if (sub) {
          // Restart the sub level fresh (abandons the attempt, no merge).
          const sm = sub.smileNum;
          const nm = sub.name;
          sub = null;
          eng.blnInSub = false;
          $("subWrap").classList.add("hidden");
          void openSub(nm, sm);
        } else void loadLevel(current);
        return;
      default:
        break;
    }
  });

  // Input: P1 moves with WASD, P2 with Arrows (VB original had these swapped).
  // End/Esc starve, ScrollLock/Space toggle follow-cam, R restarts.
  // Holding a movement key keeps stepping (throttled); other keys ignore repeat.
  const lastStep: Record<number, number> = {};
  function gatedStep(g: Engine, s: number, dir: Direction, isRepeat: boolean): void {
    const now = performance.now();
    if (!shouldMove(lastStep[s] ?? Number.NEGATIVE_INFINITY, now, isRepeat)) return;
    lastStep[s] = now;
    stepOrPan(g, s, dir);
  }

  function stepOrPan(g: Engine, s: number, dir: Direction): void {
    if (g.blnView[s]) g.press(s, dir);
    else g.panView(s, dir);
    render();
  }

  function wireBoard(board: HTMLCanvasElement, g: () => Engine, idx: number): void {
    board.addEventListener("contextmenu", (e) => e.preventDefault());
    board.addEventListener("mousedown", (e) => {
      const gg = g();
      if (idx >= gg.numPlayers) return;
      const rect = board.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * size;
      const py = ((e.clientY - rect.top) / rect.height) * size;
      const x = Math.round(Math.floor(px / TILE_PX) + gg.viewX[idx]! - VIEW_RADIUS);
      const y = Math.round(Math.floor(py / TILE_PX) + gg.viewY[idx]! - VIEW_RADIUS);
      if (e.button === 0) {
        const sx = gg.smileX[idx]!;
        const sy = gg.smileY[idx]!;
        if (x === sx && y > sy) stepOrPan(gg, idx, dDOWN);
        else if (x === sx && y < sy) stepOrPan(gg, idx, dUP);
        else if (y === sy && x > sx) stepOrPan(gg, idx, dRIGHT);
        else if (y === sy && x < sx) stepOrPan(gg, idx, dLEFT);
      } else if (e.button === 2) {
        whatsthere.textContent = gg.inspect(x, y);
      }
    });
  }
  boards.forEach((board, idx) => wireBoard(board, () => eng, idx));
  wireBoard(subCanvas, () => (sub ? sub.eng : eng), 0);

  $("loadBtn").addEventListener("click", () => void loadLevel(levelSelect.value));
  $("restartBtn").addEventListener("click", () => void loadLevel(current));
  $("starveBtn").addEventListener("click", () => active().suicide(0));

  // Startup jingle (VB played welcome.wav on the launch form). Browsers gate
  // audio behind user interaction, so try immediately and again on first input.
  let welcomed = false;
  const welcome = () => {
    if (welcomed) return;
    welcomed = true;
    sounds.play("welcome");
  };
  window.addEventListener("pointerdown", welcome);
  window.addEventListener("keydown", welcome);
  welcome();

  await loadLevel("Level0");
}

void main();
