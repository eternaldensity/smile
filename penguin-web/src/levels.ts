import type { Dir } from "./constants";

export interface LevelObject {
  id: number;
  type: number;
  pname: number;
  x: number;
  y: number;
  visible: boolean;
  dir: Dir;
}

export type WarpRule =
  | number
  | { dir: Record<string, number> }
  | { to: number; exit?: string | Record<string, string> }
  | { to: number; exitBy: { seal: string; ball: string } }
  | { fanout: Record<string, number>; exit: string }
  | { random: [number, number] };

export interface LevelFlags {
  sealMs?: number;
  wrapBottom?: boolean;
  sealClimbFallback?: boolean;
  arrowSwap?: { all?: number; pins?: Record<string, number> };
  showShipsExtra?: number[];
  hideOnReset?: number[];
  boltLadderTrigger?: number;
  warpElse?: { random: [number, number] };
  warpExit?: string | Record<string, string>;
}

export interface LevelData {
  level: number;
  sealMs: number;
  objects: LevelObject[];
  warps: Record<string, WarpRule>;
  flags: LevelFlags;
}

export async function fetchLevel(n: number): Promise<LevelData> {
  const base = import.meta.env.BASE_URL || "./";
  const res = await fetch(`${base}levels/level${n}.json`);
  if (!res.ok) throw new Error(`Could not load level ${n}: ${res.status}`);
  return (await res.json()) as LevelData;
}

const HINTS: Record<number, string> = {
  1: "Watch carefully how the seals move.\n\nThe hardest bolt to get is the one in the top left corner. You will need to have flippers to get it. Watch out for the arrow below.\n\nBreak the wood that is 2 squares above water. It it near Midgel.",
  2: "Move Zidgel quickly as he is in danger.\n\nMove Zidgel to collect the bolt that is diagonally below some flippers and diag. above wood.\n\nBreak the wood below and left of 2 bolts and above another to make a place safe from seals.\n\nPush the 4 balls until you break the first wood, then go up through the water and take a ball back with you to fill up the hole. Repeat with the other wood and ball, then push the 4 balls through the warp.",
  3: "Move Fidgel quickly as he is in danger.\n\nBe careful that Zidgel does not get stuck in a hole. Make sure all the top balls go into the water, and do not drop into holes where wood was.\n\nBe careful that you do not get trapped without flippers.\n\nThe area where 4 balls are in a row is safe, as is the area on the right of the screen that is 3 squares long, to the right of a water, and contains a bolt.",
  4: "Move Zidgel as he is not safe.\n\nSome of the warps are tricky.\n\nYour must push the higher ball to the left after you remove the wood. Then push it 2 to the left and dash up the ladder.\n\nDo not push the lower ball to the left. To get the bolt left of it, you must jump down through the water to the left of the ball.",
  5: "You must drop balls on all the seals or the right-most panel will be broken, stopping you from getting the bolt. Watch out for the arrows. Each seal only appears once, instead of being rerelased by the arrow. The balls also disappear.\n\nWatch out for water in the lower section.",
  6: "This level is fairly simple.\n\nWatch our for the seals and water.\n\nRemember that water can make a secret passage if you have flippers.",
  7: "There are no arrows or seals in this level.\n\nPractice to see which warps are connected.\n\nBe carefull with the balls, as you will need to stand on them to get at some items.",
  8: "Watch out for the seals and arrows.\n\nAvoid breaking the wood too early.",
  9: "If you move off the bottom of the screen, you will come back on the top.\n\nBe carefull of the water, and the 2 seals.",
};

export function levelHint(n: number): string {
  return HINTS[n] ?? "";
}
