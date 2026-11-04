// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "./catalog";
import {
  buildSongCourseMaterial,
  buildSongCourseReviewMaterial,
  courseDisplayRange,
  learnerScoreXml
} from "./material";
import { loadSongCourseSource } from "./loader";
import type { SongCourseNode, SongCourseSource } from "./model";
import { songFromMusicXml } from "../song/musicxml";

const fixture = findSongCourseSource("hot-cross-buns");
if (!fixture) throw new Error("missing fixture");
const source: SongCourseSource = fixture;

describe("source-derived course material", () => {
  it("rebases the four real repeated Cs while preserving original identities, measures and written fingers", () => {
    const full = loadSongCourseSource(source);
    const material = buildSongCourseMaterial(source, "hot-cross-buns/notes-c");
    expect(material.expected.map((note) => note.startBeat)).toEqual([0, 1, 2, 3]);
    expect(material.expected.map((note) => note.measureIndex)).toEqual([4, 4, 4, 4]);
    expect(material.expected.map((note) => note.sourceNoteId)).toEqual(
      [1, 2, 3, 4].map((index) => `hot-cross-buns@1:hot-cross-buns-m5-n${String(index)}`)
    );
    for (const note of material.expected) {
      expect(full.sourceToRuntime.get(note.sourceNoteId)).not.toBe(note.runtimeNoteId);
      expect(material.song.notes.find((value) => value.id === note.runtimeNoteId)?.finger).toBe(1);
    }
    expect(new Set(material.expected.map((note) => note.runtimeNoteId)).size).toBe(4);
    expect(material.song.duration).toBeCloseTo((4 * 60) / 72);
    expect(courseDisplayRange(material)).toEqual({ low: 60, high: 72 });
  });

  it("has six real notes followed by a short final measure, without four-note padding", () => {
    const c = source.nodes.find((node) => node.id.endsWith("/notes-c"));
    const d = source.nodes.find((node) => node.id.endsWith("/notes-d"));
    if (!c || !d) throw new Error("missing nodes");
    const node: SongCourseNode = {
      ...c,
      id: "six-real-notes",
      sourceNoteIds: [...c.sourceNoteIds, ...d.sourceNoteIds.slice(0, 2)],
      phraseIds: [...c.phraseIds, ...d.phraseIds]
    };
    const material = buildSongCourseMaterial(source, node);
    expect(material.expected.map((note) => note.pitch)).toEqual([60, 60, 60, 60, 62, 62]);
    expect(material.song.measures.map((measure) => measure.length)).toEqual([4, 2]);
    expect(material.expected.map((note) => note.startBeat)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(material.song.duration).toBeCloseTo((6 * 60) / 72);
  });

  it("keeps accompaniment playable while its display-only score contains learner notes alone", () => {
    const material = buildSongCourseMaterial(source, "hot-cross-buns/guided-1");
    expect(
      material.song.notes.some((note) => note.pitch < 60 && note.part === "accompaniment")
    ).toBe(true);
    const display = learnerScoreXml(material);
    expect(display).not.toContain('<part id="accompaniment"');
    expect(songFromMusicXml(display, "test").notes.map((note) => note.pitch)).toEqual(
      material.expected.map((note) => note.pitch)
    );
    expect(courseDisplayRange(material)).toEqual({ low: 60, high: 72 });
    expect(material.musicXml).toContain('<part id="accompaniment"');
  });

  it("derives review notes from bounded original measures and leaves the original score untouched", () => {
    const original = source.musicXml;
    const material = buildSongCourseReviewMaterial(
      source,
      { fromMeasure: 4, toMeasure: 6, phraseIds: ["hot-cross-buns/phrase-3"] },
      "attempt-7"
    );
    expect(material.node.kind).toBe("review");
    expect(material.expected.map((note) => note.pitch)).toEqual([60, 60, 60, 60, 62, 62, 62, 62]);
    expect(material.expected.map((note) => note.measureIndex)).toEqual([4, 4, 4, 4, 5, 5, 5, 5]);
    expect(source.musicXml).toBe(original);
    expect(() =>
      buildSongCourseReviewMaterial(
        source,
        { fromMeasure: 0, toMeasure: 6, phraseIds: ["hot-cross-buns/phrase-1"] },
        "bad"
      )
    ).toThrow();
    expect(() =>
      buildSongCourseReviewMaterial(
        source,
        { fromMeasure: 0, toMeasure: 2, phraseIds: ["hot-cross-buns/phrase-4"] },
        "bad"
      )
    ).toThrow();
    expect(() => buildSongCourseMaterial(source, "missing")).toThrow();
  });

  it("retains the written final rest in the octave motif's musical progress length", () => {
    const joy = findSongCourseSource("joy-octave");
    if (!joy) throw new Error("missing joy");
    const material = buildSongCourseMaterial(joy, "joy-octave/performance");
    const final = material.expected.at(-1);
    if (!final) throw new Error("missing final note");
    expect(final.startBeat).toBe(12);
    expect(final.duration).toBeCloseTo((3 * 60) / 72);
    expect(material.song.duration).toBeCloseTo((16 * 60) / 72);
    expect(material.song.duration - (final.start + final.duration)).toBeCloseTo(60 / 72);
  });

  it("does not introduce the next unlearned note when an early C-only attempt is reviewed", () => {
    const original = buildSongCourseMaterial(source, "hot-cross-buns/notes-c");
    const review = buildSongCourseReviewMaterial(
      source,
      {
        fromMeasure: 4,
        toMeasure: 6,
        phraseIds: ["hot-cross-buns/phrase-3"],
        sourceNoteIds: original.expected.map((note) => note.sourceNoteId)
      },
      "c-only"
    );
    expect(review.expected.map((note) => note.pitch)).toEqual([60, 60, 60, 60]);
    expect(review.expected.map((note) => note.sourceNoteId)).toEqual(
      original.expected.map((note) => note.sourceNoteId)
    );
    expect(() =>
      buildSongCourseReviewMaterial(
        source,
        {
          fromMeasure: 4,
          toMeasure: 6,
          phraseIds: ["hot-cross-buns/phrase-3"],
          sourceNoteIds: ["foreign@1:note"]
        },
        "bad"
      )
    ).toThrow();
  });
});
