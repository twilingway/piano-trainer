import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import type { FrameState } from "./frameState";
import { KEYBOARD_WHITE_STEP } from "./keyboardMetrics";
import { energySources } from "./noteEnergy";
import {
  LOOK_AHEAD_CAP_S,
  NOTE_SPEED_MM,
  boundedLookAhead,
  flatPictureRows,
  noteLookAhead
} from "./noteSpeed";
import { roadTrailMaxGap, ROAD_TRAIL_MAX_GAP_SHARE } from "./three/roadTrailGeometry";
import { roadFrameState } from "./viewEffects";

const frame: FrameState = {
  time: 0,
  lookAhead: 2,
  pressed: new Set(),
  sounding: new Set(),
  due: [],
  hands: new Set(),
  statusOf: () => undefined,
  owns: () => true
};

/** White-key steps a note crosses per second, and a 1 s note's length in steps. */
function stepsPerSecond(length: number, whiteStep: number): number {
  const lookAhead = noteLookAhead(length, whiteStep) ?? NaN;
  return length / lookAhead / whiteStep;
}

describe("one note speed in metres", () => {
  it("matches the 3D «Прямо» reference: about 7.3 white keys a second", () => {
    expect(NOTE_SPEED_MM / KEYBOARD_WHITE_STEP).toBeCloseTo(7.3, 1);
  });

  it("crosses the same white-key steps per second on any field and any scale", () => {
    const reference = NOTE_SPEED_MM / KEYBOARD_WHITE_STEP;
    // Flat lanes in pixels: staff on and off, narrow and wide key ranges.
    for (const hitY of [180, 420, 900])
      for (const whiteWidth of [12, 24, 44])
        expect(stepsPerSecond(hitY, whiteWidth)).toBeCloseTo(reference, 9);
    // The metric road in millimetres: horizon at the keys, near, far and at the world limit.
    for (const span of [40, 380, 3000, 25000])
      expect(stepsPerSecond(span, KEYBOARD_WHITE_STEP)).toBeCloseTo(reference, 9);
    // The flat perspective road in half pixels.
    expect(stepsPerSecond(600, 20 * 0.5)).toBeCloseTo(reference, 9);
  });

  it("lengthens the window, not the speed, when the field grows", () => {
    const near = noteLookAhead(1000, KEYBOARD_WHITE_STEP) ?? 0;
    const far = noteLookAhead(4000, KEYBOARD_WHITE_STEP) ?? 0;
    expect(far).toBeCloseTo(near * 4, 9);
    expect(noteLookAhead(0, 20)).toBeUndefined();
    expect(noteLookAhead(400, 0)).toBeUndefined();
    expect(noteLookAhead(Infinity, 20)).toBeUndefined();
  });

  it("crosses the same on-screen white keys a second at the hit line on any road", () => {
    const keysPerSecond = NOTE_SPEED_MM / KEYBOARD_WHITE_STEP;
    // A road squeezing depth (perspective) or widening keys on screen near the hit line.
    for (const [depth, across] of [
      [1, 1],
      [0.25, 1],
      [0.1, 1.6],
      [0.6, 0.7]
    ] as const) {
      const road = {
        notePlace: (x: number, y: number) => ({ x: x * across, y: 100 + y * depth, scale: 1 })
      };
      const { lookAhead } = roadFrameState(frame, road, 400, 20, 300);
      const screenSpeed = (400 * depth) / lookAhead;
      expect(screenSpeed / (20 * across)).toBeCloseTo(keysPerSecond, 9);
    }
    // Without a road the lane itself is the screen.
    const flat = roadFrameState(frame, undefined, 400, 20);
    expect(400 / flat.lookAhead / 20).toBeCloseTo(keysPerSecond, 9);
    const unready = { notePlace: () => undefined };
    expect(roadFrameState(frame, unready, 400, 20).lookAhead).toBe(frame.lookAhead);
    expect(roadFrameState(frame, undefined, 0, 20).lookAhead).toBe(frame.lookAhead);
  });
});

describe("look-ahead consumers on a long field", () => {
  it("cap at six seconds", () => {
    expect(boundedLookAhead(2.2)).toBe(2.2);
    expect(boundedLookAhead(40)).toBe(LOOK_AHEAD_CAP_S);
  });

  it("glow the same for a near note whatever the window", () => {
    const note: SongNote = {
      id: "n",
      pitch: 60,
      start: 3,
      duration: 1,
      startBeat: 6,
      hand: "right"
    };
    const glow = (lookAhead: number) =>
      energySources([note], { ...frame, lookAhead }, () => 0xffffff);
    expect(glow(40)).toEqual(glow(LOOK_AHEAD_CAP_S));
    expect(glow(40)).toHaveLength(1);
    expect(glow(40)).not.toEqual(glow(2.2));
  });

  it("bridge trail gaps of at most six seconds of road", () => {
    expect(roadTrailMaxGap(1000, 2.2)).toBeCloseTo(1000 * ROAD_TRAIL_MAX_GAP_SHARE, 9);
    // The same seconds of road whether the field holds 12 s or 24 s.
    const speed = 172;
    expect(roadTrailMaxGap(speed * 12, 12)).toBeCloseTo(roadTrailMaxGap(speed * 24, 24), 9);
    expect(roadTrailMaxGap(speed * 12, 12)).toBeCloseTo(
      speed * LOOK_AHEAD_CAP_S * ROAD_TRAIL_MAX_GAP_SHARE,
      9
    );
  });
});

it("sizes the flat picture's depth by the white key and lane rows on screen at the hit line", () => {
  const keys = new Map([
    [61, { black: true, x: 390, width: 24 }],
    [60, { black: false, x: 380, width: 40 }],
    [48, { black: false, x: 0, width: 40 }]
  ]);
  // Rows near the hit line show three times taller than a pixel across the key.
  const place = (x: number, y: number) => ({ x, y: y * 3 });
  expect(flatPictureRows(place, keys, 400, 400)).toBeCloseTo(1 / 3);
  expect(flatPictureRows(place, undefined, 400, 400)).toBe(1);
  expect(flatPictureRows(() => undefined, keys, 400, 400)).toBe(1);
});
