import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureDirectory, readCapture } from "./acquire";
import type { CaptureSource } from "./acquire";
import type * as Acquire from "./acquire.ts";
import { capturePython } from "./environment";
import { infer } from "./inference";
import type { StageReceipt } from "./inference";
import { captureOptions } from "./options";
import { digest, exists, readJson, run, writeJson } from "../runtime";
import type * as Runtime from "../runtime.ts";

vi.mock("./acquire.ts", async (original) => ({
  ...(await original<typeof Acquire>()),
  readCapture: vi.fn()
}));
vi.mock("../runtime.ts", async (original) => ({
  ...(await original<typeof Runtime>()),
  run: vi.fn()
}));

const temporary: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "capture-inference-")));
  temporary.push(root);
  const id = "synthetic",
    directory = captureDirectory(root, id);
  await mkdir(directory, { recursive: true });
  const helpers = resolve(root, "tools/video-capture");
  await mkdir(helpers, { recursive: true });
  for (const file of ["capture.py", "music.py", "hands.py", "tracking.py"])
    await writeFile(resolve(helpers, file), `original ${file}`);
  const python = capturePython(root);
  await mkdir(dirname(python), { recursive: true });
  await writeFile(python, "fake local python executable");
  const model = resolve(root, ".browser-artifacts/video-capture/models/hand_landmarker.task");
  await mkdir(dirname(model));
  await writeFile(model, "original model");
  const source: CaptureSource = {
    schemaVersion: 1,
    createdAt: "2026-10-15T00:00:00Z",
    source: { kind: "local", locator: "synthetic.mp4" },
    video: { file: "input.mp4", sha256: "a".repeat(64), size: 1 },
    audio: {
      file: "audio.wav",
      sha256: "b".repeat(64),
      size: 1,
      format: "pcm_s16le",
      sampleRate: 44100,
      channels: 1,
      sourceOffset: 37.25
    },
    probe: {},
    frames: [{ frameIndex: 0, pts: "37500", timeBase: "1/1000", time: 37.5 }],
    timelineOriginSeconds: 37.5,
    timelineEndSeconds: 38,
    tools: { ffmpeg: "synthetic", ffprobe: "synthetic" }
  };
  vi.mocked(readCapture).mockResolvedValue(source);
  const state: { packageVersion: string; duringRun: (stage: string) => Promise<void> } = {
    packageVersion: "1.0.0",
    duringRun: () => Promise.resolve()
  };
  vi.mocked(run).mockImplementation(async (_command, args) => {
    if (args[0] === "-c")
      return JSON.stringify({
        packages: { synthetic: state.packageVersion },
        weights: "c".repeat(64),
        config: "d".repeat(64)
      });
    const stage = args[1];
    if (stage !== "music" && stage !== "hands") throw new Error("Unexpected subprocess");
    const output = args[args.indexOf("--output") + 1];
    if (!output) throw new Error("Missing output");
    if (stage === "music")
      await writeJson(output, {
        schemaVersion: 1,
        backend: { model: "synthetic" },
        warnings: [],
        notes: [{ id: "n1", pitch: 60, onset: 37.5, offset: 38, velocity: 90 }]
      });
    else {
      await writeFile(
        output,
        JSON.stringify({ ...source.frames[0], hands: [], diagnostics: ["occluded"] })
      );
      const summary = args[args.indexOf("--summary") + 1];
      if (!summary) throw new Error("Missing summary");
      await writeJson(summary, { frames: 1 });
    }
    await state.duringRun(stage);
    return "";
  });
  return {
    root,
    directory,
    helpers,
    model,
    source,
    state,
    options: (stage: "music" | "hands") => captureOptions([stage, "--id", id])
  };
}

describe("immutable inference stages", () => {
  it.each(["helper", "package"] as const)(
    "rejects changed %s fingerprints on repeat without rerunning the adapter",
    async (change) => {
      const f = await fixture();
      await infer(f.root, f.options("music"));
      if (change === "helper") await writeFile(resolve(f.helpers, "music.py"), "modified adapter");
      else f.state.packageVersion = "2.0.0";
      const adapterCalls = () =>
        vi.mocked(run).mock.calls.filter(([, args]) => args[1] === "music").length;
      expect(adapterCalls()).toBe(1);
      await expect(infer(f.root, f.options("music"))).rejects.toThrow("другими параметрами");
      expect(adapterCalls()).toBe(1);
    }
  );

  it("does not issue a hands receipt if the task model changes during inference", async () => {
    const f = await fixture();
    f.state.duringRun = () => writeFile(f.model, "model changed while processing");
    await expect(infer(f.root, f.options("hands"))).rejects.toThrow("Модель рук изменилась");
    expect(await exists(resolve(f.directory, "hands.raw.jsonl"))).toBe(true);
    expect(await exists(resolve(f.directory, "hands.receipt.json"))).toBe(false);
  });

  it("rejects modified raw predictions before reuse", async () => {
    const f = await fixture();
    await infer(f.root, f.options("music"));
    await writeFile(resolve(f.directory, "music.raw.json"), "changed raw");
    await expect(infer(f.root, f.options("music"))).rejects.toThrow("Изменён результат этапа");
    expect(vi.mocked(run).mock.calls.filter(([, args]) => args[1] === "music")).toHaveLength(1);
  });

  it("passes absolute audio offset to the music adapter and binds output and fingerprint in its receipt", async () => {
    const f = await fixture();
    await infer(f.root, f.options("music"));
    const call = vi.mocked(run).mock.calls.find(([, args]) => args[1] === "music");
    const args = call?.[1] ?? [];
    expect(args[args.indexOf("--source-offset") + 1]).toBe("37.25");
    expect(args[args.indexOf("--audio") + 1]).toBe(resolve(f.directory, "audio.wav"));
    const receipt = (await readJson(resolve(f.directory, "music.receipt.json"))) as StageReceipt;
    expect(receipt.parameters).toMatchObject({
      sourceOffset: 37.25,
      audioSha256: f.source.audio.sha256,
      fingerprint: {
        adapters: { "music.py": await digest(resolve(f.helpers, "music.py")) },
        environment: { packages: { synthetic: "1.0.0" }, weights: "c".repeat(64) }
      }
    });
    expect(receipt.files["music.raw.json"]).toBe(
      await digest(resolve(f.directory, "music.raw.json"))
    );
    const calls = vi.mocked(run).mock.calls.filter(([, entry]) => entry[1] === "music").length;
    await infer(f.root, f.options("music"));
    expect(vi.mocked(run).mock.calls.filter(([, entry]) => entry[1] === "music")).toHaveLength(
      calls
    );
  });
});
