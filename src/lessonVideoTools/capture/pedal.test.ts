import { describe, expect, it } from "vitest";
import { captureNotes } from "./model";
import type { CapturedNote, PedalCandidate } from "./model";
import { playbackNotes } from "./pedal";
import { predictionFrom } from "./validate";

const pedal = (time: number, value: number): PedalCandidate => ({
  time,
  value,
  source: "transkun",
  estimated: true
});
const note = (id: string, pitch: number, onset: number, end: number): CapturedNote => {
  const [captured] = captureNotes([{ id, pitch, onset, offset: end, velocity: 90 }], [], {
    schemaVersion: 1,
    sourceSha256: "a".repeat(64),
    mirrored: false,
    keys: []
  });
  if (!captured) throw new Error("Synthetic note missing");
  return captured;
};

describe("pedal prediction compatibility", () => {
  const legacy = { schemaVersion: 1, backend: {}, notes: [], warnings: [] };

  it("distinguishes a legacy missing field from an explicit empty prediction", () => {
    expect(predictionFrom(legacy).pedalCandidates).toBeUndefined();
    expect(predictionFrom({ ...legacy, pedalCandidates: [] }).pedalCandidates).toEqual([]);
    expect(playbackNotes([], undefined, 3).warnings).toHaveLength(1);
    expect(playbackNotes([], [], 3).warnings).toEqual([]);
  });

  it("accepts ordered simultaneous control events", () => {
    const pedalCandidates = [pedal(0, 0), pedal(1, 64), pedal(1, 127), pedal(2, 63)];
    expect(predictionFrom({ ...legacy, pedalCandidates }).pedalCandidates).toEqual(pedalCandidates);
  });

  it.each([
    null,
    {},
    [pedal(-1, 64)],
    [pedal(NaN, 64)],
    [pedal(Infinity, 64)],
    [pedal(1, -1)],
    [pedal(1, 128)],
    [pedal(1, 63.5)],
    [pedal(2, 64), pedal(1, 0)],
    [{ ...pedal(1, 64), source: "observed" }],
    [{ ...pedal(1, 64), estimated: false }]
  ])("rejects malformed pedal candidates %j", (pedalCandidates) => {
    expect(() => predictionFrom({ ...legacy, pedalCandidates })).toThrow();
  });
});

describe("derived sustain playback", () => {
  it("uses the 63/64 threshold, half-open boundaries and ignores repeated states", () => {
    const notes = [0.99, 1, 1.5, 2, 2.01].map((end, index) =>
      note(String(index), 48 + index, 0, end)
    );
    const result = playbackNotes(
      notes,
      [pedal(0, 63), pedal(1, 64), pedal(1.25, 127), pedal(2, 63), pedal(2.5, 0)],
      3
    );
    expect(result.intervals).toEqual([{ down: 1, up: 2, clippedAtSourceEnd: false }]);
    expect(result.notes.map((entry) => entry.exportedEnd)).toEqual([0.99, 2, 2, 2, 2.01]);
    expect(result.notes[0]?.provenance.sustain).toBeNull();
    expect(result.notes[3]?.provenance.sustain).toBeNull();
  });

  it("caps only added sustain at the next same-pitch attack across both hands", () => {
    const notes = [
      { ...note("repeat", 48, 1, 1.25), hand: "right" as const },
      { ...note("first", 48, 0, 0.5), hand: "left" as const },
      note("other", 60, 0.25, 0.75)
    ];
    const result = playbackNotes(notes, [pedal(0, 127), pedal(2, 0)], 3);
    expect(result.notes.map((entry) => [entry.eventId, entry.exportedEnd])).toEqual([
      ["repeat", 2],
      ["first", 1],
      ["other", 2]
    ]);
    expect(result.notes[1]?.provenance.nextSamePitchOnset).toBe(1);
  });

  it("preserves existing overlap and reviewed release without mutating raw notes", () => {
    const notes = [
      Object.freeze({ ...note("overlap", 48, 0, 0.5), keyRelease: 1.5 }),
      Object.freeze(note("repeat", 48, 1, 1.25))
    ];
    const before = JSON.stringify(notes);
    const result = playbackNotes(Object.freeze(notes), [pedal(0, 127), pedal(2, 0)], 3);
    expect(result.notes[0]).toMatchObject({
      baseEnd: 1.5,
      exportedEnd: 1.5,
      provenance: { baseEnd: "keyRelease" }
    });
    expect(JSON.stringify(notes)).toBe(before);
    expect(notes[0]).toMatchObject({
      offset: 0.5,
      estimatedOffset: 0.5,
      keyRelease: 1.5,
      acousticEnd: null
    });
  });

  it("clips an unclosed interval at the source end with a warning", () => {
    const result = playbackNotes([note("sustained", 48, 0, 1)], [pedal(0.5, 64)], 2);
    expect(result.notes[0]?.exportedEnd).toBe(2);
    expect(result.notes[0]?.provenance.sustain).toMatchObject({
      source: "transkun",
      estimated: true,
      clippedAtSourceEnd: true
    });
    expect(result.warnings).toHaveLength(1);
    expect(playbackNotes([note("past", 48, 0, 3)], [pedal(0.5, 64)], 2).notes[0]?.exportedEnd).toBe(
      3
    );
  });
});
