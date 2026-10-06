import { describe, expect, it } from "vitest";

import { songParts, trackRoles } from "./midiParts";
import type { TrackStats } from "./midiParts";

const track = (onsets: number, chordOnsets: number, meanPitch: number): TrackStats => ({
  onsets,
  chordOnsets,
  meanPitch
});

describe("trackRoles", () => {
  it("finds a single-voiced melody below the chords of an arrangement in one register", () => {
    // Pirates of the Caribbean (MIDIfind): melody in sixteenths, chords, a sparse bass.
    const tracks = [track(383, 1, 55.6), track(106, 33, 58.4), track(8, 4, 51.3)];
    expect(trackRoles(tracks)).toEqual(["melody", "accompaniment", "bass"]);
  });

  it("keeps a piano file's separated hands: the top track is the melody", () => {
    expect(trackRoles([track(200, 60, 70), track(120, 100, 50)])).toEqual([
      "melody",
      "accompaniment"
    ]);
    expect(trackRoles([track(50, 1, 50), track(200, 60, 70)])).toEqual(["bass", "melody"]);
  });

  it("calls a single-voiced track near the melody a second voice", () => {
    const tracks = [track(100, 0, 66), track(90, 2, 63), track(40, 0, 45)];
    expect(trackRoles(tracks)).toEqual(["melody", "second", "bass"]);
  });

  it("does not take a sparse track for the melody, however single-voiced", () => {
    const tracks = [track(10, 0, 60), track(200, 40, 62), track(100, 70, 58)];
    expect(trackRoles(tracks)[1]).toBe("melody");
  });

  it("prefers the higher of two equally single-voiced tracks", () => {
    expect(trackRoles([track(100, 0, 60), track(100, 0, 63)])).toEqual(["bass", "melody"]);
  });
});

describe("songParts", () => {
  it("orders parts by role, numbers a repeated role and gives each its hand", () => {
    const tracks = [track(80, 40, 59), track(300, 0, 60), track(30, 2, 45), track(80, 50, 62)];
    const roles = trackRoles(tracks);
    expect(songParts(tracks, roles)).toEqual([
      { id: "p1", role: "melody", title: "Мелодия", hand: "right" },
      { id: "p3", role: "accompaniment", title: "Аккомпанемент", hand: "left" },
      { id: "p0", role: "accompaniment", title: "Аккомпанемент 2", hand: "left" },
      { id: "p2", role: "bass", title: "Бас", hand: "left" }
    ]);
  });
});
