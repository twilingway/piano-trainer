import { describe, expect, it } from "vitest";
import type { Song, SongNote } from "../song/song";
import { keyColumn } from "../wordTyping/keyboardRows";
import type { GeneratedToken, Modifier } from "../wordTyping/types";
import { ComputerKeys } from "./computerKeys";
import type { FrameState } from "./FallingNotesView";
import { TYPING_FINGER_COLOR } from "./fingerColors";

const notes: SongNote[] = [
  { id: "a", pitch: 67, start: 0, duration: 1, startBeat: 0, hand: "right" },
  { id: "b", pitch: 67, start: 1, duration: 1, startBeat: 1, hand: "right" },
  { id: "c", pitch: 62, start: 2, duration: 1, startBeat: 2, hand: "right" },
  // The accompaniment: no token, no column.
  { id: "x", pitch: 40, start: 0, duration: 3, startBeat: 0, hand: "left" }
];
const song: Song = { title: "t", source: "midi", notes, beats: [], measures: [], duration: 3 };

function token(noteId: string, physicalKey: string, pitch: number, modifier: Modifier = "none") {
  return {
    noteIndex: 0,
    noteId,
    pitch,
    start: 0,
    duration: 0,
    input: { physicalKey, modifier, display: "x" },
    wordIndex: 0,
    isFallback: false
  } satisfies GeneratedToken;
}

function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error("Missing test item");
  return item;
}

const L = keyColumn("KeyL") ?? -1;
const M = keyColumn("KeyM") ?? -1;
const F = keyColumn("KeyF") ?? -1;

function frame(change: Partial<FrameState>): FrameState {
  return {
    time: 0,
    lookAhead: 2,
    statusOf: () => undefined,
    pressed: new Set(),
    sounding: new Set([40]),
    due: [],
    hands: new Set(["right"]),
    ...change
  };
}

describe("ComputerKeys", () => {
  const keys = new ComputerKeys([
    token("a", "KeyL", 67),
    token("b", "KeyM", 67),
    token("c", "KeyF", 62),
    token("d", "KeyF", 64, "shift")
  ]);
  const lane = keys.mapSong(song);

  it("draws the line one column a key and leaves the accompaniment out", () => {
    expect(lane.notes.map((note) => [note.id, note.pitch])).toEqual([
      ["a", L],
      ["b", M],
      ["c", F]
    ]);
    // The card and the name show the note itself, not its key's column.
    expect(lane.notes.map((note) => keys.writtenPitch(note))).toEqual([67, 67, 62]);
    expect([...(keys.byColumn.get(F) ?? [])].map((item) => item.input.modifier)).toEqual([
      "none",
      "shift"
    ]);
  });

  it("tells a frame in columns: the owed note's key for a shared pitch", () => {
    const owedB = at(notes, 1);
    const told = keys.frame(
      frame({
        time: 1,
        due: [owedB],
        pressed: new Set([67]),
        graded: [{ grade: "perfect", pitch: 67 }]
      })
    );
    expect(told.due.map((note) => note.pitch)).toEqual([M]);
    expect([...told.pressed]).toEqual([M]);
    expect(told.graded).toEqual([{ grade: "perfect", pitch: M }]);
    expect(told.sounding.size).toBe(0);
    expect(told.hands.has("left")).toBe(true);
    expect(keys.next()?.id).toBe("c");
  });

  it("without an owed note, a held pitch lights the key of its latest note begun", () => {
    const told = keys.frame(frame({ time: 0.5, pressed: new Set([67]) }));
    expect([...told.pressed]).toEqual([L]);
  });

  it("colours by the touch-typing palette and leaves a missed note to the lane's red", () => {
    const told = keys.frame(frame({ statusOf: (id) => (id === "a" ? "missed" : "pending") }));
    expect(told.colorOf?.(at(lane.notes, 0))).toBeUndefined();
    expect(told.colorOf?.(at(lane.notes, 2))).toBe(TYPING_FINGER_COLOR.left[2]);
  });

  it("plays the owed input of a pressed key, else its plain one, and releases it", () => {
    keys.frame(frame({ due: [at(notes, 2)] }));
    expect(keys.press(F)).toBe(62);
    expect(keys.release()).toBe(62);
    expect(keys.press(L)).toBe(67);
    expect(keys.release()).toBe(67);
    expect(keys.release()).toBeUndefined();
  });
});
