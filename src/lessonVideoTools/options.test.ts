import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analysisDirectory,
  frameTimes,
  parseOptions,
  reusableAudio,
  sameSource,
  seconds,
  withinDirectory,
  type AudioMetadata
} from "./options";

describe("video lesson CLI inputs", () => {
  it.each([
    ["90", 90],
    ["01:30.25", 90.25],
    ["1:02:03", 3723],
    ["0", 0]
  ])("reads original video time %s", (input, expected) => {
    expect(seconds(input)).toBe(expected);
  });
  it.each(["-1", "NaN", "Infinity", "1:60", "1:99:01", "1.5:10", "", "1::2", "1:2:3:4"])(
    "rejects ambiguous or invalid time %s",
    (input) => {
      expect(() => seconds(input)).toThrow();
    }
  );
  it("selects an explicit source, stable artifact ID and interval without shell evaluation", () => {
    const options = parseOptions([
      "prepare",
      "--video",
      "G:\\Video [piano]\\lesson.mp4",
      "--id",
      "lesson-01",
      "--start",
      "01:30",
      "--end",
      "02:00"
    ]);
    expect(options).toMatchObject({
      video: "G:\\Video [piano]\\lesson.mp4",
      id: "lesson-01",
      start: 90,
      end: 120,
      model: "turbo"
    });
    expect(parseOptions(["setup", "--no-download"]).noDownload).toBe(true);
    expect(parseOptions(["frames", "--help"]).help).toBe(true);
  });
  it.each([
    ["prepare", "--video", "x", "--id", "lesson", "--start", "10", "--end", "10"],
    ["prepare", "--video", "x", "--id", "lesson", "--model", "unknown"],
    ["prepare", "--video", "x", "--id", "lesson", "--start", "0", "--start", "1"],
    ["prepare", "--video", "--id", "lesson"],
    ["prepare", "--unknown", "value"],
    ["frames", "--video", "x", "--id", "lesson"],
    ["frames", "--video", "x", "--id", "lesson", "--at", "10", "--every", "10"],
    ["frames", "--video", "x", "--id", "lesson", "--every", "0"],
    ["frames", "--video", "x", "--id", "lesson", "--at", "10", "--max-frames", "201"]
  ])("rejects conflicting options %s", (...args) => {
    expect(() => parseOptions(args)).toThrow();
  });
  it.each(["../other", "..", "a/b", "a\\b", "C:\\temp", "/tmp", ""])(
    "confines artifact ID %s to the analysis namespace",
    (id) => {
      expect(() => analysisDirectory(".", id)).toThrow();
    }
  );
  it("keeps artifacts within the expected root and rejects sibling-prefix paths", () => {
    const root = resolve("repository");
    expect(analysisDirectory(root, "lesson-01")).toBe(
      resolve(root, "local-lessons/.analysis/lesson-01")
    );
    expect(withinDirectory(root, resolve(root, "nested"))).toBe(true);
    expect(withinDirectory(root, `${root}-other`)).toBe(false);
    expect(withinDirectory(root, resolve(root, "../other"))).toBe(false);
  });
});

describe("audio reuse safety", () => {
  const metadata: AudioMetadata = {
    source: { path: "G:\\lesson.mp4", size: 12345, mtimeMs: 45678 },
    start: 60,
    end: 120,
    videoDuration: 900,
    format: "mono-pcm16-16000"
  };
  it("reuses only an identical source identity, interval and extraction format", () => {
    expect(reusableAudio(JSON.parse(JSON.stringify(metadata)) as unknown, metadata)).toBe(true);
    expect(sameSource({ ...metadata.source }, metadata.source)).toBe(true);
  });
  it("rejects different source files, replacements, ranges, or malformed metadata", () => {
    for (const changed of [
      null,
      {},
      [],
      { ...metadata, source: { ...metadata.source, path: "G:\\other.mp4" } },
      { ...metadata, source: { ...metadata.source, size: 99999 } },
      { ...metadata, source: { ...metadata.source, mtimeMs: 99999 } },
      { ...metadata, start: 0 },
      { ...metadata, end: 121 },
      { ...metadata, videoDuration: 901 },
      { ...metadata, format: "stereo" }
    ])
      expect(reusableAudio(changed, metadata)).toBe(false);
  });
});

describe("bounded frame selection", () => {
  const base = ["frames", "--video", "video.mp4", "--id", "lesson"];
  it("uses exact absolute timestamps, sorted and deduplicated at millisecond resolution", () => {
    const options = parseOptions([...base, "--at", "01:30,5.1234,5.1233,60"]);
    expect(frameTimes(options, 120)).toEqual([5.123, 60, 90]);
  });
  it("makes a bounded storyboard inside the requested interval", () => {
    const options = parseOptions([...base, "--every", "10", "--start", "60", "--end", "91"]);
    expect(frameTimes(options, 120)).toEqual([60, 70, 80, 90]);
    expect(() => frameTimes(parseOptions([...base, "--every", "0.01"]), 120)).toThrow();
  });
  it("rejects timestamps outside the video or requested range", () => {
    expect(() => frameTimes(parseOptions([...base, "--at", "120"]), 120)).toThrow();
    expect(() => frameTimes(parseOptions([...base, "--at", "60", "--start", "70"]), 120)).toThrow();
    expect(() => frameTimes(parseOptions([...base, "--at", "60", "--end", "130"]), 120)).toThrow();
  });
});
