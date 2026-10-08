import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analysisDirectory,
  courseLayout,
  frameTimes,
  parseOptions,
  reusableAudio,
  sameSource,
  sameAnalysisSource,
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
    expect(options.courseRoot).toBeNull();
    for (const command of ["prepare", "frames"])
      expect(
        parseOptions([
          command,
          "--video",
          "video.mp4",
          "--course-root",
          "G:\\Курс [фортепиано]\\1 ступень",
          "--id",
          "full",
          ...(command === "frames" ? ["--at", "10"] : [])
        ]).courseRoot
      ).toBe("G:\\Курс [фортепиано]\\1 ступень");
  });
  it.each([
    ["prepare", "--video", "x", "--id", "lesson", "--start", "10", "--end", "10"],
    ["prepare", "--video", "x", "--id", "lesson", "--model", "unknown"],
    ["prepare", "--video", "x", "--id", "lesson", "--start", "0", "--start", "1"],
    ["prepare", "--video", "--id", "lesson"],
    ["prepare", "--unknown", "value"],
    ["setup", "--course-root", "course"],
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

describe("course video analysis layout", () => {
  const root = resolve("repository");
  const courseRoot = resolve("source", "Фортепиано [2023]", "1 ступень");
  const video = resolve(courseRoot, "Урок 1. Вводный", "Урок 1. Вводный.mp4");
  it("retains course, lesson folder and filename with Unicode names", () => {
    const layout = courseLayout(courseRoot, video);
    expect(layout).toEqual({
      courseRoot,
      courseTitle: "1 ступень",
      lessonTitle: "Урок 1. Вводный",
      relativeVideo: "Урок 1. Вводный/Урок 1. Вводный.mp4"
    });
    expect(analysisDirectory(root, "full", layout)).toBe(
      resolve(
        root,
        "local-lessons/.analysis/1 ступень/Урок 1. Вводный/Урок 1. Вводный.mp4/runs/full"
      )
    );
  });
  it("separates files, nested folders and runs instead of merging an entire lesson folder", () => {
    const first = analysisDirectory(root, "full", courseLayout(courseRoot, video));
    const second = analysisDirectory(
      root,
      "full",
      courseLayout(courseRoot, resolve(courseRoot, "Урок 1. Вводный", "Демонстрация.mp4"))
    );
    const nested = analysisDirectory(
      root,
      "full",
      courseLayout(
        courseRoot,
        resolve(courseRoot, "extra", "Урок 1. Вводный", "Урок 1. Вводный.mp4")
      )
    );
    expect(new Set([first, second, nested]).size).toBe(3);
    expect(analysisDirectory(root, "review", courseLayout(courseRoot, video))).not.toBe(first);
  });
  it("rejects outside sources, sibling prefixes and forged relative paths", () => {
    for (const outside of [
      resolve(courseRoot, "../other/video.mp4"),
      resolve(`${courseRoot}-other`, "video.mp4"),
      courseRoot
    ])
      expect(() => courseLayout(courseRoot, outside)).toThrow();
    expect(() => courseLayout("relative-course", video)).toThrow();
    expect(() => courseLayout(courseRoot, "relative-video.mp4")).toThrow();
    const layout = courseLayout(courseRoot, video);
    for (const relativeVideo of ["../outside.mp4", video, "./Урок 1. Вводный/Урок 1. Вводный.mp4"])
      expect(() => analysisDirectory(root, "full", { ...layout, relativeVideo })).toThrow();
    expect(() =>
      analysisDirectory(root, "full", { ...layout, courseTitle: "../outside" })
    ).toThrow();
    expect(() => analysisDirectory(root, "../outside", layout)).toThrow();
  });
  it("binds all layout fields and rejects identical basename courses from another physical root", () => {
    const source = { path: video, size: 100, mtimeMs: 123, ...courseLayout(courseRoot, video) };
    expect(sameAnalysisSource({ ...source }, source)).toBe(true);
    expect(sameAnalysisSource({ path: video, size: 100, mtimeMs: 123 }, source)).toBe(false);
    for (const key of ["courseRoot", "courseTitle", "lessonTitle", "relativeVideo"])
      expect(sameAnalysisSource({ ...source, [key]: "other" }, source)).toBe(false);
    const otherRoot = resolve("other-source", "1 ступень");
    const otherVideo = resolve(otherRoot, "Урок 1. Вводный", "Урок 1. Вводный.mp4");
    expect(analysisDirectory(root, "full", courseLayout(otherRoot, otherVideo))).toBe(
      analysisDirectory(root, "full", courseLayout(courseRoot, video))
    );
    expect(sameAnalysisSource({ ...source, courseRoot: otherRoot }, source)).toBe(false);
    const flat = { path: video, size: 100, mtimeMs: 123 };
    expect(sameAnalysisSource({ ...flat }, flat)).toBe(true);
    expect(sameAnalysisSource(source, flat)).toBe(false);
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
