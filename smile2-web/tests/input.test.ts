import { describe, expect, it } from "vitest";
import { MOVE_REPEAT_MS, shouldMove } from "../src/input";

describe("input repeat gating", () => {
  it("first press always steps", () => {
    expect(shouldMove(Number.NEGATIVE_INFINITY, 1000, false)).toBe(true);
    expect(shouldMove(900, 1000, false)).toBe(true);
  });

  it("throttles held-key repeats", () => {
    expect(shouldMove(1000, 1000, true)).toBe(false);
    expect(shouldMove(1000, 1000 + MOVE_REPEAT_MS - 1, true)).toBe(false);
    expect(shouldMove(1000, 1000 + MOVE_REPEAT_MS, true)).toBe(true);
  });
});
