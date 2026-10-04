import { describe, expect, it } from "vitest";
import { WordKeyboardState } from "./wordKeyboardState";

describe("word keyboard aliases", () => {
  it("attacks every new alias while releasing only the last shared voice", () => {
    const state = new WordKeyboardState();
    expect(state.press("KeyA", 60)).toEqual([{ type: "down", pitch: 60 }]);
    expect(state.press("KeyA", 72)).toEqual([]);
    expect(state.press("KeyB", 60)).toEqual([{ type: "down", pitch: 60 }]);
    expect(state.release("KeyA")).toEqual([]);
    expect(state.release("KeyB")).toEqual([{ type: "up", pitch: 60 }]);
  });
  it("keeps the original pitch until release and clears every voice on blur", () => {
    const state = new WordKeyboardState();
    state.press("KeyA", 61);
    state.press("KeyB", 61);
    state.press("KeyC", 62);
    expect(state.clear()).toEqual([
      { type: "up", pitch: 61 },
      { type: "up", pitch: 62 }
    ]);
    expect(state.release("KeyA")).toEqual([]);
    expect(state.has("KeyA")).toBe(false);
  });
});
