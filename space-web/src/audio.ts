import type { SoundName } from "./engine";

// Real sounds, converted from data/sound (see scripts/convert-assets.mjs).
// "beep" is VB's system Beep (enemy spawn) — kept as a tiny synth blip.
const B = import.meta.env.BASE_URL || "./";
const S = `${B}assets/sounds/`;

const FILES: Record<Exclude<SoundName, "beep">, string> = {
  bang: `${S}bang.ogg`,
  thump: `${S}thump.ogg`,
  warp: `${S}warp.ogg`,
  wall: `${S}wall.ogg`,
  ecrash: `${S}ecrash.ogg`,
  skid: `${S}skid.ogg`,
  start: `${S}start.ogg`,
  finish: `${S}finish.ogg`,
  magnet: `${S}magnet.ogg`,
};

export class SoundBank {
  muted = false;
  private els = new Map<string, HTMLAudioElement>();
  private actx: AudioContext | null = null;

  play(name: SoundName): void {
    if (this.muted) return;
    try {
      if (name === "beep") {
        this.blip();
        return;
      }
      if (typeof Audio === "undefined") return;
      let el = this.els.get(name);
      if (!el) {
        el = new Audio(FILES[name]);
        el.preload = "auto";
        this.els.set(name, el);
      }
      const c = el.cloneNode() as HTMLAudioElement;
      void c.play().catch(() => {});
    } catch {
      // audio not available (e.g. tests) — ignore
    }
  }

  private blip(): void {
    try {
      if (!this.actx) this.actx = new AudioContext();
      const ctx = this.actx;
      if (ctx.state === "suspended") void ctx.resume();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.08);
    } catch {
      // ignore
    }
  }
}
