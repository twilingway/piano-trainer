import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { songFromMidi } from "./midi";
import { bindSourcePerformance, readSourcePerformance } from "./sourcePerformance";
import { selectSong } from "../app/songSelectors";
import { songReducer } from "../app/songSlice";
import { preferencesReducer } from "../app/preferencesSlice";

const file = process.env.SOURCE_PERFORMANCE_MIDI;
const sidecar = process.env.SOURCE_PERFORMANCE_PACKAGE;
it.skipIf(!file || !sidecar)(
  "preserves the real local source assignments without publishing its music",
  () => {
    if (!file || !sidecar) throw new Error("Missing local source acceptance inputs");
    const bytes = readFileSync(file),
      data = Uint8Array.from(bytes).buffer;
    const pack = readSourcePerformance(JSON.parse(readFileSync(sidecar, "utf8")) as unknown);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const raw = songFromMidi(data, "local source acceptance");
    const state = {
      song: {
        ...songReducer(undefined, { type: "test/init" }),
        sourceSong: bindSourcePerformance(raw, pack, hash)
      },
      preferences: preferencesReducer(undefined, { type: "test/init" })
    };
    expect(state.song.simplified).toBe(true);
    expect(state.preferences.player.notesAsWritten).toBe(true);
    const song = selectSong(state);
    expect(song.sourcePerformance?.midiSha256).toBe(hash);
    expect(song.notes).toHaveLength(1243);
    expect(song.notes.some((n) => n.sourceFinger?.conflict === "duplicate-finger-group")).toBe(
      true
    );
    expect(song.notes.filter((n) => n.finger !== undefined)).toHaveLength(1210);
    expect(song.notes.filter((n) => n.finger === undefined)).toHaveLength(33);
    expect(song.notes[0]?.pitch).toBe(40);
    expect(song.notes[0]?.finger).toBe(3);
    expect(song.notes[0]?.hand).toBe("right");
    expect(song.notes.map((n) => [n.start, n.duration, n.pitch, n.velocity])).toEqual(
      raw.notes.map((n) => [n.start, n.duration, n.pitch, n.velocity])
    );
    expect(song.notes.every((n) => n.sourceFinger?.finger === (n.finger ?? null))).toBe(true);
  }
);
