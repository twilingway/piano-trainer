// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { simplifiedSong } from "../song/arrangement";
import { writtenNotes } from "../song/midiScore";
import { withFingering, type Song } from "../song/song";
import { bindSourcePerformance, type SourcePerformancePackage } from "../song/sourcePerformance";
import { preferencesReducer } from "./preferencesSlice";
import { selectSong, type SongRoot } from "./songSelectors";
import { songReducer } from "./songSlice";

const SHA = "a".repeat(64);
const raw: Song = {
  title: "Synthetic source",
  source: "midi",
  duration: 2,
  beats: [],
  measures: [],
  notes: [40, 43, 47, 52, 55].map((pitch, i) => ({
    id: `n${String(i)}`,
    hand: "right",
    pitch,
    start: 0.137,
    startBeat: 0.274,
    duration: 0.31
  }))
};
function defaults(sourceSong: Song): SongRoot {
  return {
    song: { ...songReducer(undefined, { type: "test/init" }), sourceSong },
    preferences: preferencesReducer(undefined, { type: "test/init" })
  };
}
describe("source performance through the player selectors", () => {
  it("preserves original notes and unknown fingers under the stored general defaults", () => {
    const pack: SourcePerformancePackage = {
      schemaVersion: 1,
      id: "synthetic",
      midiSha256: SHA,
      sourceSha256: "b".repeat(64),
      noteCount: raw.notes.length,
      timeOriginSeconds: 0,
      notes: raw.notes.map((n, i) => ({
        midiId: n.id,
        sourceId: n.id,
        pitch: n.pitch,
        hand: n.hand,
        onset: n.start,
        finger: i === 0 ? 3 : null,
        candidateFinger: null,
        origin: i === 0 ? "teacher" : "unknown",
        selectedFrom: i === 0 ? "decision" : "unknown"
      }))
    };
    const bound = bindSourcePerformance(raw, pack, SHA),
      state = defaults(bound);
    expect(state.song.simplified).toBe(true);
    expect(state.preferences.player.notesAsWritten).toBe(true);
    const selected = selectSong(state);
    expect(selected.sourcePerformance).toEqual(bound.sourcePerformance);
    expect(selected.notes.map((n) => n.finger)).toEqual([
      3,
      undefined,
      undefined,
      undefined,
      undefined
    ]);
    expect(selected.notes.map((n) => [n.id, n.pitch, n.start, n.duration])).toEqual(
      raw.notes.map((n) => [n.id, n.pitch, n.start, n.duration])
    );
    expect(state.song.simplified).toBe(true);
    expect(state.preferences.player.notesAsWritten).toBe(true);
  });
  it("keeps ordinary MIDI on the existing simplified written and computed path", () => {
    const state = defaults(raw),
      selected = selectSong(state);
    expect(selected).toEqual(withFingering(writtenNotes(simplifiedSong(raw))));
    expect(selected.simplified).toBe(true);
    expect(selected.asWritten).toBe(true);
    expect(selected.notes.length).toBeLessThan(raw.notes.length);
    expect(selected.notes.every((n) => n.finger !== undefined)).toBe(true);
    expect(selected.sourcePerformance).toBeUndefined();
  });
});
