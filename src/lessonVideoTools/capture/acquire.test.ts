import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalYoutubeUrl,
  captureDirectory,
  download,
  parseFrameTimeline,
  readCapture
} from "./acquire";
import { run } from "../runtime";
import type * as Runtime from "../runtime.ts";

vi.mock("../runtime.ts", async (original) => ({
  ...(await original<typeof Runtime>()),
  run: vi.fn()
}));

const temporary: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

async function fixture() {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "video-capture-")));
  temporary.push(root);
  const video = resolve(root, "performance.mp4");
  await writeFile(video, "original video");
  vi.mocked(run).mockImplementation(async (command, args) => {
    if (args.includes("-version")) return `${command} version tested\n`;
    if (command === "ffmpeg") {
      await writeFile(args.at(-1) ?? "", "pcm audio");
      return "";
    }
    if (args.includes("-show_frames"))
      return "pts=300|best_effort_timestamp=300|duration_time=0.040\npts=340|best_effort_timestamp=340|duration_time=0.080\n";
    if ((args.at(-1) ?? "").endsWith("audio.wav"))
      return JSON.stringify({
        streams: [
          { codec_type: "audio", codec_name: "pcm_s16le", sample_rate: "48000", channels: 2 }
        ],
        format: { duration: "0.42" }
      });
    return JSON.stringify({
      streams: [
        { codec_type: "video", time_base: "1/1000" },
        { codec_type: "audio", start_time: "0.280" }
      ],
      format: { duration: "0.42" }
    });
  });
  return { root, video };
}

describe("source acquisition", () => {
  it("canonicalizes a single YouTube video and drops tracking/private query parameters", () => {
    expect(canonicalYoutubeUrl("https://youtu.be/iSu-MrCm-lA?si=private&list=abc")).toBe(
      "https://www.youtube.com/watch?v=iSu-MrCm-lA"
    );
    for (const url of [
      "https://evil.test/watch?v=iSu-MrCm-lA",
      "https://youtube.com/playlist?list=abc",
      "http://youtube.com/watch?v=iSu-MrCm-lA",
      "https://me:secret@youtube.com/watch?v=iSu-MrCm-lA"
    ])
      expect(() => canonicalYoutubeUrl(url)).toThrow();
  });

  it("retains variable frame timestamps, nonzero origins and exact integer PTS strings", () => {
    expect(
      parseFrameTimeline(
        "best_effort_timestamp=300|duration_time=0.04\nbest_effort_timestamp=340|duration_time=0.08",
        "1/1000"
      )
    ).toEqual([
      { frameIndex: 0, pts: "300", timeBase: "1/1000", time: 0.3, duration: 0.04 },
      { frameIndex: 1, pts: "340", timeBase: "1/1000", time: 0.34, duration: 0.08 }
    ]);
    expect(parseFrameTimeline("best_effort_timestamp=9007199254740993", "1/90000000")[0]?.pts).toBe(
      "9007199254740993"
    );
    expect(() =>
      parseFrameTimeline("best_effort_timestamp=2\nbest_effort_timestamp=1", "1/1000")
    ).toThrow();
    expect(() => parseFrameTimeline("best_effort_timestamp=N/A", "1/1000")).toThrow();
  });

  it("copies a local source exclusively and preserves PCM format and source offset", async () => {
    const { root, video } = await fixture();
    const source = await download(root, { id: "performance", source: video });
    expect(source.audio).toMatchObject({ sampleRate: 48000, channels: 2, sourceOffset: 0.28 });
    expect(source.timelineOriginSeconds).toBe(0.3);
    expect(source.timelineEndSeconds).toBeCloseTo(0.42);
    expect(
      await readFile(resolve(captureDirectory(root, "performance"), "input.mp4"), "utf8")
    ).toBe("original video");
    const calls = vi.mocked(run).mock.calls.length;
    expect(await download(root, { id: "performance", source: video })).toEqual(source);
    expect(vi.mocked(run).mock.calls.length).toBe(calls);
  });

  it("rejects a changed source and corrupted immutable artifacts", async () => {
    const { root, video } = await fixture();
    await download(root, { id: "performance", source: video });
    await writeFile(video, "changed original");
    await expect(download(root, { id: "performance", source: video })).rejects.toThrow(
      "другим или изменённым"
    );
    await writeFile(resolve(captureDirectory(root, "performance"), "audio.wav"), "corrupt audio");
    await expect(readCapture(root, "performance")).rejects.toThrow("изменён");
  });

  it("does not overwrite an interrupted audio extraction without a completed receipt", async () => {
    const { root, video } = await fixture();
    const original = vi.mocked(run).getMockImplementation();
    vi.mocked(run).mockImplementation(async (command, args, capture) => {
      if (command === "ffmpeg" && !args.includes("-version")) {
        await writeFile(args.at(-1) ?? "", "partial pcm");
        throw new Error("interrupted");
      }
      return original?.(command, args, capture) ?? "";
    });
    await expect(download(root, { id: "performance", source: video })).rejects.toThrow(
      "interrupted"
    );
    await expect(download(root, { id: "performance", source: video })).rejects.toThrow(
      "Незавершённое аудио"
    );
    expect(
      await readFile(resolve(captureDirectory(root, "performance"), "audio.wav"), "utf8")
    ).toBe("partial pcm");
  });
});
