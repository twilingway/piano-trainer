import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { applyReview, bindReview, captureNotes, fingerCandidates } from "./model";
import type { Calibration, HandFrame, Review } from "./model";
import { notesMidi, reviewStatus } from "./export";
import { calibrationFrom, frameFrom, parseFrames, predictionFrom, reviewFrom } from "./validate";
import { captureOptions } from "./options";
import { selectionExpression } from "./evidence";

const calibration: Calibration = {
  schemaVersion: 1,
  sourceSha256: "source",
  mirrored: false,
  keys: [
    {
      pitch: 60,
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ]
    }
  ]
};
const raw = [{ id: "n0", pitch: 60, onset: 1, offset: 2, velocity: 80 }] as const;
const frame: HandFrame = {
  frameIndex: 12,
  pts: "1010",
  timeBase: "1/1000",
  time: 1.01,
  hands: [
    {
      trackId: "h1",
      side: null,
      handednessScore: 0.99,
      landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
      worldLandmarks: Array.from({ length: 21 }, () => ({ x: 0.01, y: 0.01, z: 0 })),
      worldIsEstimate: true
    }
  ],
  diagnostics: []
};
const review = {
  schemaVersion: 1,
  sourceSha256: "source",
  inputs: { music: "a".repeat(64), hands: null },
  notes: [
    {
      eventId: "n0",
      hand: "right",
      teacherFinger: 2,
      keyRelease: 1.75,
      reviewNotes: true,
      reviewFinger: true,
      evidence: ["frame-12"],
      reason: "Контакт виден до, на и после атаки."
    }
  ],
  hands: { reviewedRanges: [], issues: [] }
} as const satisfies Review;

describe("rig-independent capture", () => {
  it("keeps evidence selection expressions shallow for thousands of attacks", () => {
    const expression = selectionExpression(Array.from({ length: 4096 }, (_, i) => i));
    let depth = 0,
      maximum = 0;
    for (const character of expression) {
      if (character === "(") maximum = Math.max(maximum, ++depth);
      else if (character === ")") depth--;
    }
    expect(maximum).toBeLessThan(32);
    expect(expression.match(/eq\(/g)).toHaveLength(4096);
    expect(selectionExpression([])).toBe("0");
  });
  it("keeps model ends and fingertip candidates distinct from observations", () => {
    const notes = captureNotes(raw, [frame], calibration);
    expect(notes[0]).toMatchObject({
      estimatedOffset: 2,
      keyRelease: null,
      acousticEnd: null,
      teacherFinger: null,
      computedFinger: null,
      hand: null,
      review: { notes: false, finger: false }
    });
    expect(fingerCandidates(raw[0], [frame], calibration)).toHaveLength(5);
    expect(notes[0]?.candidates[0]?.hand).toBeNull();
    expect(fingerCandidates({ ...raw[0], pitch: 61 }, [frame], calibration)).toEqual([]);
  });
  it("applies a separate evidenced review without mutating raw or conflating fingers", () => {
    const base = captureNotes(raw, [frame], calibration);
    const result = applyReview(base, review);
    expect(result[0]).toMatchObject({
      hand: "right",
      teacherFinger: 2,
      writtenFinger: null,
      computedFinger: null,
      keyRelease: 1.75
    });
    expect(base[0]?.teacherFinger).toBeNull();
    expect(reviewStatus(result, review, 0, 2)).toEqual({
      notes: "reviewed",
      fingers: "reviewed",
      hands: "draft"
    });
    expect(
      reviewStatus(
        result,
        {
          ...review,
          hands: { reviewedRanges: [{ start: 0, end: 2, evidence: ["frame-12"] }], issues: [] }
        },
        0,
        2
      ).hands
    ).toBe("reviewed");
  });
  it("exports exactly the reviewed intervals, retaining chords and repeated notes", () => {
    const notes = applyReview(
      captureNotes(
        [
          ...raw,
          { ...raw[0], id: "chord", pitch: 64 },
          { ...raw[0], id: "repeat", onset: 2, offset: 3 }
        ],
        [],
        calibration
      ),
      review
    );
    const midi = new Midi(notesMidi(notes));
    const output = midi.tracks.flatMap((track) => track.notes);
    expect(output).toHaveLength(3);
    const observed = output.find((note) => note.midi === 60 && note.time === 1);
    expect(observed?.duration).toBeCloseTo(0.75, 4);
    expect(output.some((note) => note.midi === 60 && note.time === 2)).toBe(true);
  });
  it("rejects guessed review, stale sources, invalid geometry and malformed predictions", () => {
    expect(() => reviewFrom(review, "other")).toThrow();
    expect(() => {
      bindReview(review, { music: "b".repeat(64), hands: null });
    }).toThrow();
    expect(() =>
      reviewFrom({ ...review, notes: [{ ...review.notes[0], teacherFinger: 8 }] }, "source")
    ).toThrow();
    expect(() =>
      reviewFrom({ ...review, notes: [{ ...review.notes[0], evidence: [] }] }, "source")
    ).toThrow();
    expect(() =>
      applyReview(captureNotes(raw, [], calibration), {
        ...review,
        notes: [{ ...review.notes[0], eventId: "missing" }]
      })
    ).toThrow();
    expect(() =>
      applyReview(captureNotes(raw, [], calibration), {
        ...review,
        notes: [{ ...review.notes[0], teacherFinger: null }]
      })
    ).toThrow();
    expect(() =>
      calibrationFrom({ ...calibration, roi: { x: 0.5, y: 0, width: 1, height: 1 } }, "source")
    ).toThrow();
    expect(() =>
      predictionFrom({
        schemaVersion: 1,
        backend: {},
        warnings: [],
        notes: [{ ...raw[0], offset: 0 }]
      })
    ).toThrow();
  });
  it("validates rational PTS and preserves missing detections on a variable frame timeline", () => {
    const second = {
      ...frame,
      frameIndex: 13,
      pts: "1090",
      time: 1.09,
      hands: [],
      diagnostics: ["no-hands"]
    };
    expect(
      parseFrames([frame, second].map((value) => JSON.stringify(value)).join("\n"))
    ).toHaveLength(2);
    expect(() => frameFrom({ ...frame, time: 3 })).toThrow();
    expect(() =>
      parseFrames([second, frame].map((value) => JSON.stringify(value)).join("\n"))
    ).toThrow();
    expect(() => frameFrom({ ...frame, hands: [{ ...frame.hands[0], landmarks: [] }] })).toThrow();
  });
  it("keeps command boundaries and rejects conflicting or traversing arguments", () => {
    expect(
      captureOptions(["download", "--id", "video", "--url", "https://youtu.be/id"])
    ).toMatchObject({ command: "download", id: "video" });
    for (const args of [
      ["export", "--id", "../bad"],
      ["export", "--id", "ok", "--bundle", "../bad"],
      ["download", "--id", "ok", "--url", "u", "--video", "v"],
      ["hands", "--id", "ok", "--start", "2", "--end", "1"],
      ["music", "--id", "ok", "--calibration", "x"]
    ])
      expect(() => captureOptions(args)).toThrow();
  });
});
