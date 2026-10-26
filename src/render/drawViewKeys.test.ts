import { describe, expect, it, vi } from "vitest";
import type { KeysLayer } from "./ComputerKeyboardLayer";
import type { KeysFrame } from "./KeyboardLayer";
import { drawViewKeys } from "./drawViewKeys";
import type { FrameState } from "./frameState";
import type { HandsLayer } from "./HandsLayer";
import { viewGeometry } from "./viewGeometry";

describe("native pianist song time", () => {
  it("follows playback, pause and backwards seeks with sprite hands hidden", () => {
    const hands = { container: { visible: false }, time: 0, draw: vi.fn() };
    const geometry = viewGeometry(800, 20, { notes: true, keys: true, hands: false }, false);
    for (const time of [90, 91, 145, 145, 45]) {
      const frame: FrameState = {
        time,
        lookAhead: 3,
        statusOf: () => undefined,
        pressed: new Set(),
        sounding: new Set(),
        due: [],
        hands: new Set(),
        owns: () => false
      };
      drawViewKeys(
        undefined,
        hands as unknown as HandsLayer,
        new Map(),
        geometry,
        false,
        frame,
        new Map(),
        undefined,
        0,
        1 / 60
      );
      expect(hands.time).toBe(time);
    }
    expect(hands.draw).not.toHaveBeenCalled();
  });
});

it("shares physical repeat gaps between flat and native keys without changing sound or manual holds", () => {
  const hands = {
    container: { visible: false },
    time: 0,
    draw: vi.fn(),
    songNotes: {
      left: [],
      right: [
        { pitch: 60, start: 1, duration: 4 },
        { pitch: 60, start: 2, duration: 1 },
        { pitch: 61, start: 1, duration: 4 }
      ]
    }
  };
  const draw = vi.fn();
  const sounding = new Set([60, 61]);
  const pressed = new Set<number>();
  const frame: FrameState = {
    time: 1.9,
    lookAhead: 3,
    statusOf: () => undefined,
    pressed,
    sounding,
    due: [],
    hands: new Set(),
    owns: () => false
  };
  const fingerCues = [
    { noteId: "n", pitch: 60, hand: "right" as const, recommendedFinger: 3 as const }
  ];
  const geometry = viewGeometry(800, 20, { notes: true, keys: true, hands: false }, false);
  const run = () => {
    drawViewKeys(
      { draw } as unknown as KeysLayer,
      hands as unknown as HandsLayer,
      new Map(),
      geometry,
      false,
      { ...frame, fingerCues },
      new Map(),
      undefined,
      0,
      1 / 60
    );
    return draw.mock.lastCall?.[0] as KeysFrame;
  };
  expect(run().physicalDown).toEqual(new Set([61]));
  expect(run().sounding).toBe(sounding);
  expect(run().pressed).toBe(pressed);
  expect(run().fingerCues).toBe(fingerCues);
  pressed.add(60);
  expect(run().physicalDown).toEqual(new Set([60, 61]));
  pressed.clear();
  for (const time of [2, 1.8, 2, 1.9]) {
    const state = { ...frame, time };
    drawViewKeys(
      { draw } as unknown as KeysLayer,
      hands as unknown as HandsLayer,
      new Map(),
      geometry,
      false,
      state,
      new Map(),
      undefined,
      0,
      1 / 60
    );
    expect((draw.mock.lastCall?.[0] as KeysFrame).physicalDown?.has(60)).toBe(time !== 1.9);
  }
  expect(hands.draw).not.toHaveBeenCalled();
  expect(sounding).toEqual(new Set([60, 61]));
});
