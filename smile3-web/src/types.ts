export interface ThingData {
  value: number;
  extra1: number;
  extra2: number;
  extra3: number;
}

export interface PopupData {
  x: number;
  y: number;
  s: string;
  d: boolean;
}

export interface SwitchData {
  x: number;
  y: number;
  value: number;
  extra1: number;
  extra2: number;
  extra3: number;
  next: number;
}

export type SoundName =
  | "allnitro"
  | "bang"
  | "cash"
  | "check"
  | "glass"
  | "nitro"
  | "pop"
  | "powerdown"
  | "powerup"
  | "shieldPlus"
  | "shieldMinus"
  | "splash"
  | "tnt"
  | "warp"
  | "welcome"
  | "zap";

export type SoundSink = (name: SoundName, async: boolean) => void;

export const blankThing = (): ThingData => ({
  value: 0,
  extra1: 0,
  extra2: 0,
  extra3: 0,
});
