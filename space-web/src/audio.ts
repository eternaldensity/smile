import type { SoundName } from "./engine";

/**
 * Synthesized SFX (the VB .wavs lived at an absolute path and are lost).
 * Tiny oscillator/noise cues approximating the original names.
 */
export class SoundBank {
  private ctx: AudioContext | null = null;
  muted = false;

  private ac(): AudioContext | null {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const ctx = this.ac();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (name) {
      case "bang":
        this.noise(ctx, t, 0.35, 900);
        break;
      case "thump":
        this.tone(ctx, t, 90, 0.25, "sine", 0.5);
        this.noise(ctx, t, 0.15, 300);
        break;
      case "warp":
        this.sweep(ctx, t, 300, 1200, 0.3);
        break;
      case "wall":
        this.tone(ctx, t, 180, 0.07, "square", 0.25);
        break;
      case "ecrash":
        this.tone(ctx, t, 520, 0.12, "sawtooth", 0.3);
        this.tone(ctx, t + 0.05, 390, 0.12, "sawtooth", 0.3);
        break;
      case "skid":
        this.noise(ctx, t, 0.2, 2500);
        break;
      case "start":
        this.tone(ctx, t, 440, 0.12, "square", 0.3);
        this.tone(ctx, t + 0.12, 660, 0.15, "square", 0.3);
        break;
      case "finish":
        this.tone(ctx, t, 523, 0.12, "square", 0.3);
        this.tone(ctx, t + 0.12, 659, 0.12, "square", 0.3);
        this.tone(ctx, t + 0.24, 784, 0.2, "square", 0.3);
        break;
      case "magnet":
        this.tone(ctx, t, 140, 0.3, "sine", 0.4);
        break;
      case "beep":
        this.tone(ctx, t, 880, 0.08, "square", 0.25);
        break;
    }
  }

  private tone(
    ctx: AudioContext, t: number, freq: number, dur: number,
    type: OscillatorType, vol: number,
  ): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  private sweep(ctx: AudioContext, t: number, from: number, to: number, dur: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  private noise(ctx: AudioContext, t: number, dur: number, cutoff: number): void {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  }
}
