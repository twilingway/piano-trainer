// @vitest-environment happy-dom
import MidiPackage from "@tonejs/midi";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureDirectory, readCapture } from "./acquire";
import type { CaptureSource } from "./acquire";
import type * as Acquire from "./acquire.ts";
import { evidence } from "./evidence";
import { exportCapture, notesMidi } from "./export";
import type { StageReceipt } from "./inference";
import { captureNotes } from "./model";
import type { CapturedNote, HandFrame, MusicPrediction, PedalCandidate, Review } from "./model";
import type { PlaybackNote } from "./pedal";
import { captureOptions } from "./options";
import { digest, exists, readJson, writeJson } from "../runtime";
import { songFromMidi } from "../../song/midi";

vi.mock("./acquire.ts", async (original) => ({
  ...(await original<typeof Acquire>()),
  readCapture: vi.fn()
}));
vi.mock("./evidence.ts", () => ({ evidence: vi.fn() }));
const { Midi } = MidiPackage;
const temporary: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  for (const root of temporary.splice(0)) await rm(root, { recursive: true, force: true });
});

interface Manifest {
  status: { notes: string; fingers: string; hands: string; pedal: string };
  files: Record<string, string>;
  coverage: { observedFrames: number; framesWithHands: number };
}

async function fixture() {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "capture-export-")));
  temporary.push(root);
  const id = "synthetic",
    directory = captureDirectory(root, id);
  await mkdir(directory, { recursive: true });
  const frames = [0, 0.25, 0.5, 1, 1.25, 1.5].map((time, frameIndex) => ({
    frameIndex,
    time,
    pts: String(time * 1000),
    timeBase: "1/1000",
    duration: 0.25
  }));
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
      sourceOffset: 0
    },
    probe: {},
    frames,
    timelineOriginSeconds: 0,
    timelineEndSeconds: 1.75,
    tools: { ffmpeg: "synthetic", ffprobe: "synthetic" }
  };
  vi.mocked(readCapture).mockResolvedValue(source);
  vi.mocked(evidence).mockImplementation(async (_root, bundle, input) => {
    await mkdir(resolve(bundle, "evidence"));
    const controls = input.frames.map((frame) => ({
      id: `frame-${String(frame.frameIndex)}`,
      ...frame,
      file: `evidence/${String(frame.frameIndex)}.jpg`
    }));
    for (const control of controls)
      await writeFile(resolve(bundle, control.file), "synthetic JPEG");
    await writeJson(resolve(bundle, "evidence/index.json"), controls);
    return controls;
  });
  const options = captureOptions(["export", "--id", id]);
  const bundle = resolve(directory, options.bundle);
  const reviewPath = resolve(directory, "review-input.json");
  async function stage(stage: "music" | "hands") {
    const names =
      stage === "music" ? ["music.raw.json"] : ["hands.raw.jsonl", "hands.summary.json"];
    const files: Record<string, string> = {};
    for (const file of names) files[file] = await digest(resolve(directory, file));
    const receipt: StageReceipt = {
      schemaVersion: 1,
      stage,
      sourceSha256: source.video.sha256,
      parameters: {},
      files
    };
    await writeJson(resolve(directory, `${stage}.receipt.json`), receipt);
    return receipt;
  }
  async function music(pedalCandidates?: readonly PedalCandidate[]) {
    const prediction: MusicPrediction = {
      schemaVersion: 1,
      backend: { model: "synthetic" },
      warnings: [],
      ...(pedalCandidates === undefined ? {} : { pedalCandidates }),
      notes: [
        { id: "first", pitch: 60, onset: 0.5, offset: 0.75, velocity: 90 },
        { id: "chord", pitch: 64, onset: 0.5, offset: 1, velocity: 80 },
        { id: "repeat", pitch: 60, onset: 1.25, offset: 1.5, velocity: 70 }
      ]
    };
    await writeJson(resolve(directory, "music.raw.json"), prediction);
    return stage("music");
  }
  async function hands() {
    const observations: HandFrame[] = source.frames.slice(0, 3).map((frame) => ({
      ...frame,
      hands: [],
      diagnostics: ["occluded"]
    }));
    await writeFile(
      resolve(directory, "hands.raw.jsonl"),
      observations.map((frame) => JSON.stringify(frame)).join("\n")
    );
    await writeJson(resolve(directory, "hands.summary.json"), { frames: observations.length });
    return stage("hands");
  }
  async function review(inputs: Review["inputs"], changes: Partial<Review> = {}) {
    const value: Review = {
      schemaVersion: 1,
      sourceSha256: source.video.sha256,
      inputs,
      notes: [],
      hands: { reviewedRanges: [], issues: [] },
      ...changes
    };
    await writeJson(reviewPath, value);
    return { ...options, review: reviewPath };
  }
  return { root, directory, source, options, bundle, music, hands, review };
}

describe("Claude export bundle", () => {
  it("rejects ambiguous same-pitch overlap before creating a bundle and preserves raw JSON", async () => {
    const f = await fixture();
    const receipt = await f.music();
    const options = await f.review(
      { music: receipt.files["music.raw.json"] ?? null, hands: null },
      {
        notes: [
          {
            eventId: "first",
            keyRelease: 1.75,
            hand: "right",
            evidence: ["frame-2"],
            reason: "Synthetic overlapping physical release"
          }
        ]
      }
    );
    await expect(exportCapture(f.root, options)).rejects.toThrow("Перекрываются ноты высоты 60");
    expect(await exists(f.bundle)).toBe(false);
    expect(await digest(resolve(f.directory, "music.raw.json"))).toBe(
      receipt.files["music.raw.json"]
    );
  });

  it("round-trips base CC64 MIDI and separate baked playback without changing reviewed notes", async () => {
    const f = await fixture();
    const pedalCandidates: PedalCandidate[] = [
      { time: 0.625, value: 64, source: "transkun", estimated: true },
      { time: 1.625, value: 0, source: "transkun", estimated: true }
    ];
    const receipt = await f.music(pedalCandidates);
    const options = await f.review(
      { music: receipt.files["music.raw.json"] ?? null, hands: null },
      {
        notes: ["first", "chord", "repeat"].map((eventId) => ({
          eventId,
          hand: eventId === "chord" ? ("right" as const) : ("left" as const),
          reviewNotes: true,
          evidence: ["frame-2"],
          reason: "Synthetic notes checked independently of pedal"
        }))
      }
    );
    await exportCapture(f.root, options);
    const json = (await readJson(resolve(f.bundle, "notes.json"))) as {
      notes: CapturedNote[];
      pedalCandidates: PedalCandidate[];
      midiHandPolicy: string;
    };
    const playback = (await readJson(resolve(f.bundle, "playback.json"))) as {
      notes: PlaybackNote[];
      warnings: string[];
    };
    expect(json.midiHandPolicy).toBe("complete-hands");
    expect(json.pedalCandidates).toEqual(pedalCandidates);
    expect(
      json.notes.map((note) => [
        note.offset,
        note.estimatedOffset,
        note.keyRelease,
        note.acousticEnd
      ])
    ).toEqual([
      [0.75, 0.75, null, null],
      [1, 1, null, null],
      [1.5, 1.5, null, null]
    ]);
    expect(playback.notes.map((note) => [note.eventId, note.baseEnd, note.exportedEnd])).toEqual([
      ["first", 0.75, 1.25],
      ["chord", 1, 1.625],
      ["repeat", 1.5, 1.625]
    ]);
    expect(playback.warnings).toEqual([]);
    for (const [file, ends, hasPedal] of [
      ["notes.mid", [0.75, 1, 1.5], true],
      ["playback.mid", [1.25, 1.625, 1.625], false]
    ] as const) {
      const midi = new Midi(new Uint8Array(await readFile(resolve(f.bundle, file))));
      expect(midi.tracks.map((track) => track.channel)).toEqual([0, 1]);
      for (const track of midi.tracks) {
        const controls = track.controlChanges[64] ?? [];
        expect(controls).toHaveLength(hasPedal ? 2 : 0);
        if (hasPedal) {
          expect(controls.map((control) => control.time)).toEqual([0.625, 1.625]);
          expect(controls.map((control) => Math.round(control.value * 127))).toEqual([64, 0]);
        }
      }
      const midiNotes = midi.tracks.flatMap((track) => track.notes);
      expect(midiNotes).toHaveLength(3);
      json.notes.forEach((note, index) => {
        const actual = midiNotes.find(
          (entry) => entry.midi === note.pitch && Math.abs(entry.time - note.onset) < 0.001
        );
        expect(actual).toBeDefined();
        expect((actual?.time ?? 0) + (actual?.duration ?? 0)).toBeCloseTo(ends[index] ?? 0, 3);
      });
    }
    const manifest = (await readJson(resolve(f.bundle, "manifest.json"))) as Manifest;
    expect(manifest.status.notes).toBe("reviewed");
    expect(manifest.status.pedal).toBe("draft");
    for (const [file, expected] of Object.entries(manifest.files))
      expect(await digest(resolve(f.bundle, file))).toBe(expected);
    expect(await digest(resolve(f.bundle, "music.raw.json"))).toBe(receipt.files["music.raw.json"]);
  });

  it("exports an explicit empty pedal prediction as draft rather than missing", async () => {
    const f = await fixture();
    await f.music([]);
    await exportCapture(f.root, f.options);
    const manifest = (await readJson(resolve(f.bundle, "manifest.json"))) as Manifest;
    expect(manifest.status.pedal).toBe("draft");
    expect((await readJson(resolve(f.bundle, "notes.json"))) as object).toMatchObject({
      pedalCandidates: []
    });
  });

  it("keeps chords, repeated notes and reviewed/model note-offs consistent between JSON and MIDI", async () => {
    const f = await fixture(),
      receipt = await f.music();
    const options = await f.review(
      { music: receipt.files["music.raw.json"] ?? null, hands: null },
      {
        notes: [
          {
            eventId: "first",
            hand: "left",
            teacherFinger: 1,
            keyRelease: 1,
            reviewNotes: true,
            reviewFinger: true,
            evidence: ["frame-2"],
            reason: "Synthetic contact checked"
          }
        ]
      }
    );
    await exportCapture(f.root, options);
    const json = (await readJson(resolve(f.bundle, "notes.json"))) as {
      notes: CapturedNote[];
      midiHandPolicy: string;
      pedalCandidates: readonly PedalCandidate[] | null;
    };
    const midi = new Midi(new Uint8Array(await readFile(resolve(f.bundle, "notes.mid"))));
    const midiNotes = midi.tracks.flatMap((track) => track.notes);
    expect(midiNotes).toHaveLength(json.notes.length);
    for (const note of json.notes) {
      const actual = midiNotes.find(
        (entry) => entry.midi === note.pitch && Math.abs(entry.time - note.onset) < 0.001
      );
      expect(actual).toBeDefined();
      expect((actual?.time ?? 0) + (actual?.duration ?? 0)).toBeCloseTo(
        note.keyRelease ?? note.estimatedOffset,
        3
      );
      expect(actual?.velocity).toBeCloseTo(note.velocity / 127, 2);
    }
    expect(json.notes[0]).toMatchObject({
      teacherFinger: 1,
      writtenFinger: null,
      computedFinger: null,
      estimatedOffset: 0.75,
      keyRelease: 1
    });
    expect(midi.tracks.map((track) => track.name)).toEqual(["unassigned"]);
    expect(json.midiHandPolicy).toBe("unassigned");
    expect(json.pedalCandidates).toBeNull();
    expect(json.notes.map((note) => note.hand)).toEqual(["left", null, null]);
    const manifest = (await readJson(resolve(f.bundle, "manifest.json"))) as Manifest;
    for (const [file, hash] of Object.entries(manifest.files))
      expect(await digest(resolve(f.bundle, file))).toBe(hash);
    expect(manifest.files["manifest.json"]).toBeUndefined();
    expect(manifest.status).toEqual({
      notes: "draft",
      fingers: "draft",
      hands: "missing",
      pedal: "missing"
    });
  });

  it("exports explicit missing stages and source evidence without invented notes or poses", async () => {
    const f = await fixture();
    await exportCapture(f.root, f.options);
    const manifest = (await readJson(resolve(f.bundle, "manifest.json"))) as Manifest;
    expect(manifest.status).toEqual({
      notes: "missing",
      fingers: "missing",
      hands: "missing",
      pedal: "missing"
    });
    expect(await exists(resolve(f.bundle, "notes.mid"))).toBe(false);
    expect(await exists(resolve(f.bundle, "hands.raw.jsonl"))).toBe(false);
    expect(manifest.files["evidence/index.json"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("allows a hands-only reviewed range and passes its source-frame evidence references", async () => {
    const f = await fixture(),
      receipt = await f.hands();
    const options = await f.review(
      { music: null, hands: receipt.files["hands.raw.jsonl"] ?? null },
      {
        hands: { reviewedRanges: [{ start: 0, end: 0.5, evidence: ["frame-1"] }], issues: [] }
      }
    );
    await exportCapture(f.root, options);
    const manifest = (await readJson(resolve(f.bundle, "manifest.json"))) as Manifest;
    expect(manifest.status).toEqual({
      notes: "missing",
      fingers: "missing",
      hands: "reviewed",
      pedal: "missing"
    });
    expect(manifest.coverage).toMatchObject({ observedFrames: 3, framesWithHands: 0 });
    expect(vi.mocked(evidence).mock.calls[0]?.[5]).toContain("frame-1");
    expect(await digest(resolve(f.bundle, "hands.raw.jsonl"))).toBe(
      receipt.files["hands.raw.jsonl"]
    );
  });

  it("rejects a stale review bound to different raw predictions before creating the bundle", async () => {
    const f = await fixture();
    await f.music();
    const options = await f.review({ music: "f".repeat(64), hands: null });
    await expect(exportCapture(f.root, options)).rejects.toThrow(
      "другим результатам распознавания"
    );
    expect(await exists(f.bundle)).toBe(false);
  });

  it("rejects raw input corruption against the completed stage receipt", async () => {
    const f = await fixture();
    await f.music();
    await writeFile(resolve(f.directory, "music.raw.json"), "changed after receipt");
    await expect(exportCapture(f.root, f.options)).rejects.toThrow("Изменён результат этапа");
    expect(await exists(f.bundle)).toBe(false);
  });

  it("rejects an altered exported raw copy before issuing the manifest", async () => {
    const f = await fixture();
    await f.music();
    vi.mocked(evidence).mockImplementationOnce(async (_root, bundle) => {
      await writeFile(resolve(bundle, "music.raw.json"), "altered copy");
      return [];
    });
    await expect(exportCapture(f.root, f.options)).rejects.toThrow("Изменён raw при экспорте");
    expect(await exists(resolve(f.bundle, "manifest.json"))).toBe(false);
  });

  it("refuses reviewed evidence that was not generated from a source frame", async () => {
    const f = await fixture(),
      receipt = await f.hands();
    const options = await f.review(
      { music: null, hands: receipt.files["hands.raw.jsonl"] ?? null },
      {
        hands: { reviewedRanges: [{ start: 0, end: 0.5, evidence: ["frame-999"] }], issues: [] }
      }
    );
    await expect(exportCapture(f.root, options)).rejects.toThrow("Evidence диапазона не найден");
    expect(await exists(resolve(f.bundle, "manifest.json"))).toBe(false);
  });
});

describe("capture MIDI hand metadata", () => {
  function notes(count: number): CapturedNote[] {
    return captureNotes(
      Array.from({ length: count }, (_, index) => ({
        id: `note-${String(index)}`,
        pitch: index === 0 ? 55 : index % 2 ? 48 : 72,
        onset: Math.ceil(index / 2) * 0.125,
        offset: Math.ceil(index / 2) * 0.125 + 0.0625,
        velocity: 90
      })),
      [],
      { schemaVersion: 1, sourceSha256: "a".repeat(64), mirrored: false, keys: [] }
    );
  }

  it("keeps bass present on import when only one low right-hand note was reviewed", () => {
    const partial = notes(1225).map((note, index) =>
      index === 0 ? { ...note, hand: "right" as const } : note
    );
    const data = notesMidi(partial);
    const midi = new Midi(data);
    expect(midi.tracks.map((track) => [track.name, track.notes.length])).toEqual([
      ["unassigned", 1225]
    ]);

    const song = songFromMidi(Uint8Array.from(data).buffer, "Partial capture");
    expect(song.notes).toHaveLength(1225);
    // One track invokes the existing pitch fallback, not a false 1-vs-1224 part split.
    expect(song.notes.filter((note) => note.hand === "left")).toHaveLength(613);
    expect(song.notes.filter((note) => note.hand === "right")).toHaveLength(612);
    expect(
      song.notes.filter((note) => note.pitch === 48).every((note) => note.hand === "left")
    ).toBe(true);
    for (const note of partial) {
      const actual = song.notes.find(
        (entry) => entry.pitch === note.pitch && Math.abs(entry.start - note.onset) < 0.001
      );
      expect(actual).toBeDefined();
      expect(actual?.duration).toBeCloseTo(note.estimatedOffset - note.onset, 3);
    }
    // The fallback does not turn the partial evidence into an inferred original hand.
    expect(partial[0]?.hand).toBe("right");
    expect(song.notes.find((note) => note.pitch === 55)?.hand).toBe("left");
  });

  it("preserves same-time CC64 order so pedal-down then pedal-up finishes released", () => {
    const data = notesMidi(notes(1), [
      { time: 0, value: 64, source: "transkun", estimated: true },
      { time: 0, value: 63, source: "transkun", estimated: true }
    ]);
    const controls = new Midi(data).tracks[0]?.controlChanges[64] ?? [];
    expect(controls.map((control) => Math.round(control.value * 127))).toEqual([64, 63]);
  });

  it("writes pedal-down before a note-off at the exact same tick", () => {
    const first = notes(1)[0];
    if (!first) throw new Error("Synthetic note missing");
    const data = notesMidi(
      [{ ...first, pitch: 48, onset: 0, estimatedOffset: 0.5 }],
      [{ time: 0.5, value: 64, source: "transkun", estimated: true }]
    );
    // Full status bytes let us inspect the actual SMF event order, not an importer view.
    const bytes = Array.from(data);
    const index = bytes.findIndex(
      (value, position) =>
        value === 0xb0 && bytes[position + 1] === 64 && bytes[position + 2] === 64
    );
    expect(index).toBeGreaterThan(0);
    expect(bytes.slice(index, index + 7)).toEqual([0xb0, 64, 64, 0, 0x80, 48, 0]);
    expect(new Midi(data).tracks[0]?.notes[0]?.duration).toBe(0.5);
  });

  it("rejects nested same-pitch intervals merged by the partial-hand fallback", () => {
    const base = notes(2);
    const first = base[0],
      second = base[1];
    if (!first || !second) throw new Error("Synthetic notes missing");
    const overlapping: CapturedNote[] = [
      { ...first, pitch: 48, onset: 0, estimatedOffset: 1.5, hand: "left" },
      { ...second, pitch: 48, onset: 1, estimatedOffset: 1.25 }
    ];
    const before = JSON.stringify(overlapping);
    expect(() => notesMidi(overlapping)).toThrow("Перекрываются ноты высоты 48");
    expect(JSON.stringify(overlapping)).toBe(before);
    expect(() => notesMidi(overlapping.map((note) => ({ ...note, hand: "left" })))).toThrow(
      "Перекрываются"
    );
  });

  it("round-trips overlapping pitches on separate hand channels and touching repeats on one channel", () => {
    const base = notes(3);
    const first = base[0],
      second = base[1],
      third = base[2];
    if (!first || !second || !third) throw new Error("Synthetic notes missing");
    const data = notesMidi([
      { ...first, pitch: 48, onset: 0, estimatedOffset: 1.5, hand: "left" },
      { ...second, pitch: 48, onset: 1, estimatedOffset: 1.25, hand: "right" },
      { ...third, pitch: 48, onset: 1.5, estimatedOffset: 2, hand: "left" }
    ]);
    const midi = new Midi(data);
    expect(
      midi.tracks.map((track) => track.notes.map((note) => [note.time, note.time + note.duration]))
    ).toEqual([
      [
        [0, 1.5],
        [1.5, 2]
      ],
      [[1, 1.25]]
    ]);
  });

  it("exports complete hand assignments as separate tracks with every note retained", () => {
    const complete = notes(9).map((note) => ({
      ...note,
      hand: note.pitch < 60 ? ("left" as const) : ("right" as const)
    }));
    const data = notesMidi(complete);
    const midi = new Midi(data);
    expect(midi.tracks.map((track) => [track.name, track.notes.length])).toEqual([
      ["left", 5],
      ["right", 4]
    ]);
    const song = songFromMidi(Uint8Array.from(data).buffer, "Complete capture");
    expect(song.notes).toHaveLength(9);
    expect(song.notes.filter((note) => note.hand === "left")).toHaveLength(5);
    expect(song.notes.filter((note) => note.hand === "right")).toHaveLength(4);
  });
});
