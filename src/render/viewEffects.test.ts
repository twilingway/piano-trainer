import { describe, expect, it, vi } from "vitest";
import type { SongNote } from "../song/song";
import type { FrameState } from "./frameState";
import type { KeyRect } from "./keyboardLayout";
import type { FxLayer } from "./FxLayer";
import { drawViewEffects } from "./viewEffects";

const first: SongNote = {
  id: "one",
  pitch: 60,
  start: 0,
  startBeat: 0,
  duration: 1,
  hand: "right",
  finger: 1
};
const keys = new Map<number, KeyRect>([[60, { pitch: 60, x: 100, width: 40, black: false }]]);
function frame(playing = true): FrameState {
  return {
    time: 0,
    lookAhead: 2,
    playing,
    statusOf: () => undefined,
    pressed: new Set(),
    sounding: new Set([60]),
    due: [],
    hands: new Set(),
    owns: () => false
  };
}

describe("strike identity", () => {
  it("flashes successive notes at one pitch once each without a silent frame", () => {
    const fx = { draw: vi.fn<FxLayer["draw"]>() };
    const seen = new Set<string>();
    const notes = new Map([[60, first]]);
    const draw = () => {
      drawViewEffects(fx, frame(), notes, keys, undefined, undefined, 0, 400, seen, 0.016);
    };
    draw();
    expect(fx.draw.mock.lastCall?.[0]).toHaveLength(1);
    draw();
    expect(fx.draw.mock.lastCall?.[0]).toHaveLength(0);
    notes.set(60, { ...first, id: "two", start: 1 });
    draw();
    expect(fx.draw.mock.lastCall?.[0]).toHaveLength(1);
    draw();
    expect(fx.draw.mock.lastCall?.[0]).toHaveLength(0);
  });
  it("does not consume a new program attack while paused or age the current flash", () => {
    const fx = { draw: vi.fn<FxLayer["draw"]>() };
    const seen = new Set<string>();
    const notes = new Map([[60, first]]);
    drawViewEffects(fx, frame(false), notes, keys, undefined, undefined, 0, 400, seen, 0.016);
    expect(fx.draw.mock.lastCall?.[0]).toHaveLength(0);
    expect(fx.draw.mock.lastCall?.[3]).toBe(0);
    drawViewEffects(fx, frame(), notes, keys, undefined, undefined, 0, 400, seen, 0.016);
    expect(fx.draw.mock.lastCall?.[0]).toHaveLength(1);
  });
});
