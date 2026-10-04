// Keyboard auto-repeat gating for held movement keys.
//
// Browsers fire repeated keydown events while a key is held (~30/sec).
// Letting every one through would be far too fast; the first press always
// steps immediately, repeats are throttled to one step per MOVE_REPEAT_MS.
export const MOVE_REPEAT_MS = 150;

export function shouldMove(lastStepAt: number, now: number, isRepeat: boolean): boolean {
  if (!isRepeat) return true;
  return now - lastStepAt >= MOVE_REPEAT_MS;
}
