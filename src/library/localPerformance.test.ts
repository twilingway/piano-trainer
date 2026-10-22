import { expect, it, vi } from "vitest";
import { createLocalPerformanceLoader } from "./localPerformance";
import type { Song } from "../song/song";
import { withFingering } from "../song/song";

const SHA = "a".repeat(64);
const song: Song = {
  title: "ordinary",
  source: "midi",
  duration: 1,
  beats: [],
  measures: [],
  notes: [{ id: "t0n0", pitch: 60, hand: "right", start: 0, startBeat: 0, duration: 1 }]
};
const pack = {
  schemaVersion: 1,
  id: "local",
  midiSha256: SHA,
  sourceSha256: "b".repeat(64),
  noteCount: 1,
  timeOriginSeconds: 0,
  notes: [
    {
      midiId: "t0n0",
      sourceId: "source",
      pitch: 60,
      hand: "right",
      onset: 0,
      finger: 3,
      origin: "teacher",
      selectedFrom: "decision",
      candidateFinger: 1
    }
  ]
};
it("loads an optional package once and uses an exact byte digest", async () => {
  const load = vi.fn(() => Promise.resolve(pack)),
    digest = vi.fn(() => Promise.resolve(SHA));
  const attach = createLocalPerformanceLoader(load, digest);
  const data = new ArrayBuffer(3);
  expect(withFingering(await attach(song, data)).notes[0]?.finger).toBe(3);
  await attach(song, data);
  expect(load).toHaveBeenCalledTimes(1);
  expect(digest).toHaveBeenCalledWith(data);
});
it("keeps foreign MIDI and files without a local package unchanged", async () => {
  expect(await createLocalPerformanceLoader(undefined)(song, new ArrayBuffer(0))).toBe(song);
  expect(
    await createLocalPerformanceLoader(
      () => Promise.resolve(pack),
      () => Promise.resolve("c".repeat(64))
    )(song, new ArrayBuffer(0))
  ).toBe(song);
});
it("ignores malformed optional data without preventing the song from opening", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  expect(
    await createLocalPerformanceLoader(() => Promise.resolve({ schemaVersion: 8 }))(
      song,
      new ArrayBuffer(0)
    )
  ).toBe(song);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
