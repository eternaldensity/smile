import type { SoundName } from "./types";

const B = import.meta.env.BASE_URL || "./";

// Original WAV names (case preserved from conversion) mapped to OGG.
const FILES: Record<SoundName, string> = {
  allnitro: `${B}assets/sounds/allnitro.ogg`,
  bang: `${B}assets/sounds/bang.ogg`,
  cash: `${B}assets/sounds/Cash.ogg`,
  check: `${B}assets/sounds/check.ogg`,
  glass: `${B}assets/sounds/GLASS.ogg`,
  nitro: `${B}assets/sounds/nitro.ogg`,
  pop: `${B}assets/sounds/pop.ogg`,
  powerdown: `${B}assets/sounds/powerdown.ogg`,
  powerup: `${B}assets/sounds/powerup.ogg`,
  shieldPlus: `${B}assets/sounds/shield+.ogg`,
  shieldMinus: `${B}assets/sounds/shield-.ogg`,
  splash: `${B}assets/sounds/splash.ogg`,
  tnt: `${B}assets/sounds/tnt.ogg`,
  warp: `${B}assets/sounds/warp.ogg`,
  welcome: `${B}assets/sounds/welcome.ogg`,
  zap: `${B}assets/sounds/zap.ogg`,
};

export class SoundBank {
  private els = new Map<SoundName, HTMLAudioElement>();

  constructor() {
    for (const [k, src] of Object.entries(FILES) as [SoundName, string][]) {
      const el = new Audio(src);
      el.preload = "auto";
      this.els.set(k, el);
    }
  }

  play(name: SoundName): void {
    try {
      const el = this.els.get(name);
      if (!el) return;
      const c = el.cloneNode() as HTMLAudioElement;
      void c.play().catch(() => {});
    } catch {
      // audio not available (e.g. tests) — ignore
    }
  }
}
