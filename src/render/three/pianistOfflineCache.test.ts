import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackPose } from "./handSolver/track";
import {
  PianistOfflineCache,
  offlineFitSources,
  offlinePoseFingerprint,
  pianistTestRange
} from "./pianistOfflineCache.testSupport";

const io = vi.hoisted(() => ({
  files: new Map<string, string>(),
  read: vi.fn(),
  write: vi.fn(),
  mkdir: vi.fn()
}));
vi.mock("node:fs", () => ({ readFileSync: io.read, writeFileSync: io.write, mkdirSync: io.mkdir }));
const pose: TrackPose = {
  rootVec: [0, 10, -10, 100, -80, 70],
  angles: {
    1: { cmc_radial: 35, cmc_palmar: 15, t_mcp: 30, t_ip: 25 },
    2: { mcp: 20, pip: 30, dip: 20, abd: 0 },
    3: { mcp: 20, pip: 30, dip: 20, abd: 0 },
    4: { mcp: 20, pip: 30, dip: 20, abd: 0 },
    5: { mcp: 20, pip: 30, dip: 20, abd: 0 }
  },
  press: {},
  hover: {},
  pitches: { 2: 60 }
};
beforeEach(() => {
  vi.clearAllMocks();
  io.files.clear();
  io.read.mockImplementation((file: string) => {
    const text = io.files.get(file);
    if (text === undefined) throw new Error("missing");
    return text;
  });
  io.write.mockImplementation((file: string, text: string) => {
    io.files.set(file, text);
  });
});

describe("private offline pose acceleration", () => {
  it("does no disk IO when no cache path is enabled", () => {
    const cache = new PianistOfflineCache("test");
    expect(cache.fit("right", pose, () => pose)).toBe(pose);
    cache.flush();
    expect(io.read).not.toHaveBeenCalled();
    expect(io.write).not.toHaveBeenCalled();
  });
  it("reuses exact hand/input poses across prefixes and recomputes new inputs", () => {
    const solve = vi.fn(() => pose),
      first = new PianistOfflineCache("identity", "cache.json");
    first.fit("right", pose, solve);
    first.flush();
    const second = new PianistOfflineCache("identity", "cache.json");
    expect(second.fit("right", pose, solve)).toEqual(pose);
    expect(second.hits).toBe(1);
    second.fit("left", pose, solve);
    second.fit("right", { ...pose, pitches: { 2: 61 } }, solve);
    expect(solve).toHaveBeenCalledTimes(3);
  });
  it("rejects stale, truncated, nonfinite and checksum-corrupted persisted poses", () => {
    const first = new PianistOfflineCache("old", "cache.json");
    first.fit("right", pose, () => pose);
    first.flush();
    const original = io.files.get("cache.json");
    if (!original) throw new Error("No persisted cache");
    for (const text of [
      original,
      "{broken",
      original.replace('"rootVec":[0,', '"rootVec":[null,'),
      original.replace('"pitches":{"2":60}', '"pitches":{"2":61}')
    ]) {
      io.files.set("cache.json", text);
      const cache = new PianistOfflineCache(text === original ? "new" : "old", "cache.json"),
        solve = vi.fn(() => pose);
      cache.fit("right", pose, solve);
      expect(solve).toHaveBeenCalledOnce();
      expect(cache.hits).toBe(0);
    }
  });
  it("fingerprints the actual model, MIDI, measured anatomy and offline implementation", () => {
    const bytes = new Uint8Array([1]),
      changed = new Uint8Array([2]);
    const fingerprint = offlinePoseFingerprint(bytes, bytes, { rest: 1, skin: 1 }, ["fit"]);
    for (const other of [
      offlinePoseFingerprint(changed, bytes, { rest: 1, skin: 1 }, ["fit"]),
      offlinePoseFingerprint(bytes, changed, { rest: 1, skin: 1 }, ["fit"]),
      offlinePoseFingerprint(bytes, bytes, { rest: 2, skin: 1 }, ["fit"]),
      offlinePoseFingerprint(bytes, bytes, { rest: 1, skin: 2 }, ["fit"]),
      offlinePoseFingerprint(bytes, bytes, { rest: 1, skin: 1 }, ["new fit"])
    ])
      expect(other).not.toBe(fingerprint);
    const read = (runtime: string) => (file: string) =>
      file.endsWith("handScenePose.ts")
        ? `offline; export function sampleSceneTrack(${runtime}`
        : file;
    expect(offlineFitSources(read("one"))).toEqual(offlineFitSources(read("two")));
    expect(offlineFitSources(read("one"))).toContain("src/render/three/handContact.ts");
  });
  it("keeps the default full run and rejects empty or invalid focused intervals", () => {
    expect(pianistTestRange(undefined, 100)).toBeUndefined();
    expect(pianistTestRange("47:61", 100)).toEqual([47, 61]);
    expect(pianistTestRange("47:61", 50)).toEqual([47, 50]);
    for (const range of ["", "47", ":48", "47:", "48:47", "-1:5", "100:101", "a:5"])
      expect(() => pianistTestRange(range, 100)).toThrow();
  });
});
