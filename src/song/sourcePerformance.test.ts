import { describe, expect, it } from "vitest";
import { resolveSourceFingering } from "./sourceFingering";
import { bindSourcePerformance, readSourcePerformance } from "./sourcePerformance";
import type { SourcePerformancePackage } from "./sourcePerformance";
import { withFingering } from "./song";
import type { Song } from "./song";

const SHA = "a".repeat(64);
const song: Song = {
  title: "Synthetic bass",
  source: "midi",
  beats: [],
  measures: [],
  duration: 5,
  notes: [
    {
      id: "t1n0",
      hand: "right",
      pitch: 40,
      start: 2.75,
      startBeat: 5.5,
      duration: 0.5,
      velocity: 75,
      finger: 1
    },
    { id: "t1n1", hand: "right", pitch: 43, start: 4, startBeat: 8, duration: 0.5, finger: 2 }
  ]
};
const saved: SourcePerformancePackage = {
  schemaVersion: 1,
  id: "synthetic",
  midiSha256: SHA,
  sourceSha256: "b".repeat(64),
  noteCount: 2,
  timeOriginSeconds: 0,
  notes: [
    {
      midiId: "t1n0",
      sourceId: "first",
      pitch: 40,
      hand: "right",
      onset: 2.75,
      finger: 3,
      origin: "teacher",
      selectedFrom: "decision",
      candidateFinger: 1,
      evidence: { by: "user", frame: 165, time: 2.75 },
      estimatedContactEnd: 3
    },
    {
      midiId: "t1n1",
      sourceId: "hidden",
      pitch: 43,
      hand: "right",
      onset: 4,
      finger: null,
      origin: "unknown",
      selectedFrom: "unknown",
      candidateFinger: null
    }
  ]
};

describe("saved source fingering", () => {
  it("resolves decisions above video candidates and preserves unknowns and evidence", () => {
    const result = resolveSourceFingering(
      [
        { id: "a", pitch: 40, onset: 2.75, hand: "right" },
        { id: "b", pitch: 43, onset: 4, hand: "right" },
        { id: "c", pitch: 45, onset: 5, hand: "right" },
        { id: "d", pitch: 47, onset: 6, hand: "right" }
      ],
      [
        { note: "a", pick: 1 },
        { note: "b", pick: 4 }
      ],
      {
        a: { finger: 3, origin: "teacher", evidence: { by: "user", frame: 165 } },
        d: { finger: 2, origin: "teacher", evidence: { by: "auto" } }
      }
    );
    expect(result.map((n) => [n.finger, n.origin, n.selectedFrom])).toEqual([
      [3, "teacher", "decision"],
      [4, "video-auto", "candidate"],
      [null, "unknown", "unknown"],
      [2, "video-auto", "decision"]
    ]);
    expect(result[0]?.candidateFinger).toBe(1);
    expect(result[0]?.evidence).toEqual({ by: "user", frame: 165 });
  });
  it("keeps the first bass finger 3 and never computes an unknown finger", () => {
    const bound = bindSourcePerformance(song, readSourcePerformance(saved), SHA);
    const ready = withFingering(bound);
    expect(ready.notes.map((n) => n.finger)).toEqual([3, undefined]);
    expect(ready.notes.map((n) => n.transition)).toEqual([undefined, undefined]);
    expect(ready.notes[0]?.sourceFinger?.origin).toBe("teacher");
    expect(ready.notes[1]?.sourceFinger?.finger).toBeNull();
    expect(ready.notes[0]?.start).toBe(song.notes[0]?.start);
    expect(ready.notes[0]?.duration).toBe(0.5);
    expect(ready.notes[0]?.velocity).toBe(75);
    expect(ready.notes[0]?.sourceFinger?.estimatedContactEnd).toBe(3);
  });
  it("keeps explicit player corrections separate from the saved evidence", () => {
    const bound = bindSourcePerformance(song, saved, SHA);
    const ready = withFingering(
      bound,
      new Map([
        ["t1n0", 4],
        ["t1n1", 2]
      ])
    );
    expect(ready.notes.map((n) => n.finger)).toEqual([4, 2]);
    expect(ready.notes[0]?.sourceFinger?.finger).toBe(3);
    expect(ready.notes[1]?.sourceFinger?.finger).toBeNull();
  });
  it("rejects a different SHA even when the song title and notes are identical", () => {
    expect(bindSourcePerformance(song, saved, "c".repeat(64))).toBe(song);
  });
  it("requires the complete MIDI-to-source event mapping", () => {
    expect(() =>
      bindSourcePerformance({ ...song, notes: song.notes.slice(1) }, saved, SHA)
    ).toThrow();
    expect(() =>
      bindSourcePerformance(
        { ...song, notes: song.notes.map((n) => ({ ...n, pitch: 60 })) },
        saved,
        SHA
      )
    ).toThrow();
  });
  it("does not apply the exact-source claim to a transposed or written arrangement", () => {
    const bound = bindSourcePerformance(song, saved, SHA);
    const shifted = withFingering({
      ...bound,
      notes: bound.notes.map((n) => ({ ...n, pitch: n.pitch + 12 }))
    });
    expect(shifted.sourcePerformance).toBeUndefined();
    expect(shifted.notes.every((n) => n.sourceFinger === undefined && n.finger !== undefined)).toBe(
      true
    );
    expect(withFingering({ ...bound, asWritten: true }).sourcePerformance).toBeUndefined();
  });
  it("leaves ordinary MIDI on the existing computed-fingering path", () => {
    const ordinary = withFingering(song);
    expect(ordinary.sourcePerformance).toBeUndefined();
    expect(ordinary.notes.every((n) => n.finger !== undefined)).toBe(true);
  });
  it("rejects malformed provenance, duplicate bindings and non-finite times", () => {
    expect(() =>
      readSourcePerformance({ ...saved, notes: [saved.notes[0], saved.notes[0]] })
    ).toThrow();
    expect(() =>
      readSourcePerformance({
        ...saved,
        notes: saved.notes.map((n) => ({ ...n, onset: Infinity }))
      })
    ).toThrow();
    expect(() =>
      readSourcePerformance({ ...saved, notes: saved.notes.map((n) => ({ ...n, finger: null })) })
    ).toThrow();
  });
});

it("binds only complete motion from the same MIDI and source identity", () => {
  const empty = { done: true, keys: [], poses: [], frames: [] };
  const joint = { mcp: 0, pip: 0, dip: 0, abd: 0 };
  const angles = {
    1: { cmc_radial: 0, cmc_palmar: 0, t_mcp: 0, t_ip: 0 },
    2: joint,
    3: joint,
    4: joint,
    5: joint
  };
  const root = [0, 0, 0, 0, 0, 0];
  const right = {
    done: true,
    keys: [{ t: 0, phase: "strike", strike: 0 }],
    poses: [{ rootVec: root, angles, press: {}, hover: {}, pitches: { 3: 40 } }],
    frames: Array.from({ length: 11 }, (_, i) => ({ time: i / 2, root, angles }))
  };
  const motion = {
    schemaVersion: 1,
    units: "solver-mm-degrees-v1",
    profile: "synthetic",
    midiSha256: SHA,
    sourceSha256: saved.sourceSha256,
    modelSha256: "c".repeat(64),
    anatomySha256: "d".repeat(64),
    solverSha256: "e".repeat(64),
    whiteKeyWidthMm: 23.5,
    duration: 5,
    sampleRate: 2,
    tracks: { left: empty, right }
  };
  expect(() =>
    readSourcePerformance({
      ...saved,
      motion: { ...motion, tracks: { left: empty, right: empty } }
    })
  ).toThrow();
  const decoded = readSourcePerformance({ ...saved, motion });
  expect(bindSourcePerformance(song, decoded, SHA).sourcePerformance?.motion).toEqual(motion);
  expect(() => bindSourcePerformance({ ...song, duration: 6 }, decoded, SHA)).toThrow();
  expect(() =>
    readSourcePerformance({ ...saved, motion: { ...motion, midiSha256: "f".repeat(64) } })
  ).toThrow();
  expect(() =>
    readSourcePerformance({ ...saved, motion: { ...motion, sourceSha256: "f".repeat(64) } })
  ).toThrow();
  expect(() =>
    readSourcePerformance({
      ...saved,
      motion: { ...motion, tracks: { ...motion.tracks, right: { ...empty, done: false } } }
    })
  ).toThrow();
});
it("retains unresolved source-group conflict flags without inventing a replacement finger", () => {
  const notes = saved.notes.map((n) => ({ ...n, conflict: "duplicate-finger-group" }));
  const decoded = readSourcePerformance({ ...saved, notes });
  expect(
    withFingering(bindSourcePerformance(song, decoded, SHA)).notes[0]?.sourceFinger?.conflict
  ).toBe("duplicate-finger-group");
  expect(decoded.notes.map((n) => n.finger)).toEqual([3, null]);
  expect(() =>
    readSourcePerformance({ ...saved, notes: notes.map((n) => ({ ...n, conflict: "guessed" })) })
  ).toThrow();
});

it("binds trusted song duration while keeping legacy packages without duration compatible", () => {
  const legacy = readSourcePerformance(saved);
  expect(legacy.durationSeconds).toBeUndefined();
  expect(bindSourcePerformance(song, legacy, SHA).sourcePerformance?.durationSeconds).toBe(
    song.duration
  );
  expect(
    bindSourcePerformance(song, { ...saved, durationSeconds: 8 }, SHA).sourcePerformance
      ?.durationSeconds
  ).toBe(song.duration);
});
