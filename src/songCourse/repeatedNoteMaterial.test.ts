// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "./catalog";
import { buildSongCourseMaterial, learnerScoreXml } from "./material";
import { expectedNodeRawIds } from "./nodeIdentity";
import { songCourseDemoSong } from "./demoSong";
import { gradeSongCourseAttempt } from "./rubric";
import {
  completedSongCourseNodes,
  readSongCourseProgress,
  validSongCourseResult
} from "./progress";
import { songCourseEvidenceMatchesNode } from "./evidenceProof";
import { rawInput, gradeEvidence, courseConfig } from "./testFixtures";
import { initialCourseSelection, nextCourseSelection } from "../app/songCourseStartup";
import { SongCourseReviewFlow } from "../app/songCourseReviewFlow";
import { songFromMusicXml } from "../song/musicxml";

const fixture = findSongCourseSource("hot-cross-buns");
if (!fixture) throw new Error("Missing source");
const source = fixture;
const id = "hot-cross-buns/notes-e-quarter-v1";
const halfId = "hot-cross-buns/notes-e-repeat-v1";
const legacyId = "hot-cross-buns/notes-e-intro";
function grade(nodeId = id, longHold = false) {
  const material = buildSongCourseMaterial(source, nodeId);
  const end = material.song.duration * 1000;
  const inputs = longHold
    ? [rawInput("down", 0, 0, 64), rawInput("up", end, 1, 64)]
    : material.expected.flatMap((note, index) => [
        rawInput("down", note.start * 1000, index * 2, note.pitch),
        rawInput("up", (note.start + note.duration) * 1000, index * 2 + 1, note.pitch)
      ]);
  return gradeSongCourseAttempt(
    courseConfig(material.expected, {
      runId: nodeId,
      songId: source.id,
      sourceRevision: source.revision,
      sourceHash: source.sourceHash,
      nodeId,
      learnerPartIds: source.learnerPartIds
    }),
    gradeEvidence(inputs, { musicalEndPerformanceMs: end, closedAtPerformanceMs: end + 200 })
  );
}

describe("four source-derived Es", () => {
  it("keeps the source intact and engraves four independent quarter-note events with finger three", () => {
    const original = source.musicXml;
    const material = buildSongCourseMaterial(source, id);
    expect(material.expected.map((note) => note.pitch)).toEqual([64, 64, 64, 64]);
    expect(material.expected.map((note) => note.startBeat)).toEqual([0, 1, 2, 3]);
    expect(material.song.measures.map((measure) => measure.length)).toEqual([4]);
    expect(material.song.duration).toBeCloseTo((4 * 60) / 72);
    expect(new Set(material.expected.map((note) => note.sourceNoteId)).size).toBe(4);
    expect(new Set(material.expected.map((note) => note.runtimeNoteId)).size).toBe(4);
    expect(material.expected.every((note) => Math.abs(note.duration - 60 / 72) < 1e-7)).toBe(true);
    expect(
      material.expected.map((note) => material.sourceToRuntime.get(note.sourceNoteId))
    ).toEqual(material.expected.map((note) => note.runtimeNoteId));
    expect(
      material.song.notes.every(
        (note) => note.finger === 3 && note.scoreFinger === 3 && note.part === "learner"
      )
    ).toBe(true);
    const document = new DOMParser().parseFromString(learnerScoreXml(material), "application/xml");
    expect(document.querySelectorAll("clef")).toHaveLength(1);
    expect(document.querySelectorAll("time")).toHaveLength(1);
    expect(
      document.querySelectorAll(
        "measure[number='2'] > attributes, measure[number='2'] > direction, measure[number='2'] > print"
      )
    ).toHaveLength(0);
    const fullXml = new DOMParser().parseFromString(material.musicXml, "application/xml");
    for (const part of fullXml.querySelectorAll("score-partwise > part")) {
      expect(
        part.querySelectorAll(
          "measure[number='2'] > attributes, measure[number='2'] > direction, measure[number='2'] > print"
        )
      ).toHaveLength(0);
    }
    expect([...document.querySelectorAll("note > type")].map((node) => node.textContent)).toEqual([
      "quarter",
      "quarter",
      "quarter",
      "quarter"
    ]);
    expect([...document.querySelectorAll("fingering")].map((node) => node.textContent)).toEqual([
      "3",
      "3",
      "3",
      "3"
    ]);
    expect(
      songFromMusicXml(learnerScoreXml(material), "test").notes.map((note) => [
        note.pitch,
        note.start,
        note.duration
      ])
    ).toEqual(material.expected.map((note) => [note.pitch, note.start, note.duration]));
    expect(songCourseDemoSong(material).notes.map((note) => note.id)).toEqual(
      material.expected.map((note) => note.runtimeNoteId)
    );
    expect(source.musicXml).toBe(original);
    expect(source.revision).toBe("1");
  });
  it("credits four actual attacks and rejects one held note as four answers", () => {
    expect(grade()).toMatchObject({
      pitch: 100,
      onset: 100,
      hold: 100,
      stars: 3,
      expectedCount: 4,
      completed: true
    });
    const held = grade(id, true);
    expect(held.pitch).toBe(25);
    expect(held.notes.filter((note) => note.matched)).toHaveLength(1);
    expect(held.completed).toBe(false);
  });
  it.each([
    [legacyId, "song-course-v1"],
    [halfId, "song-course-v1"],
    [halfId, "song-course-v2"]
  ] as const)(
    "retains %s proof without crediting it to the replacement node",
    (oldId, rubricVersion) => {
      const legacy = { ...grade(oldId), rubricVersion };
      const current = grade();
      const material = buildSongCourseMaterial(source, id);
      expect(validSongCourseResult(legacy)).toBe(true);
      expect(songCourseEvidenceMatchesNode(legacy, source, material.node)).toBe(false);
      expect(songCourseEvidenceMatchesNode({ ...legacy, nodeId: id }, source, material.node)).toBe(
        false
      );
      expect(songCourseEvidenceMatchesNode(current, source, material.node)).toBe(true);
      const old = readSongCourseProgress({ schemaVersion: 1, selection: null, results: [legacy] });
      expect(old.results).toEqual([legacy]);
      expect(completedSongCourseNodes(old, source)).not.toContain(id);
      expect(completedSongCourseNodes({ ...old, results: [legacy, current] }, source)).toContain(
        id
      );
    }
  );
  it.each([legacyId, halfId])(
    "restores %s directly to the replacement and continues within this song",
    (oldId) => {
      const selection = {
        songId: source.id,
        sourceRevision: source.revision,
        sourceHash: source.sourceHash,
        nodeId: oldId
      };
      expect(
        initialCourseSelection({ schemaVersion: 1, selection, results: [] }, false)?.nodeId
      ).toBe(id);
      expect(nextCourseSelection(buildSongCourseMaterial(source, oldId))?.nodeId).toBe(
        "hot-cross-buns/notes-e"
      );
      expect(nextCourseSelection(buildSongCourseMaterial(source, id))?.nodeId).toBe(
        "hot-cross-buns/notes-e"
      );
    }
  );
  it("keeps the four-half legacy material and its receipts unchanged", () => {
    const material = buildSongCourseMaterial(source, halfId);
    const legacyXml = new DOMParser().parseFromString(material.musicXml, "application/xml");
    for (const part of legacyXml.querySelectorAll("score-partwise > part")) {
      expect(part.querySelectorAll(":scope > measure")).toHaveLength(2);
      expect(part.querySelectorAll("clef")).toHaveLength(1);
      expect(part.querySelectorAll("time")).toHaveLength(1);
      expect(
        part.querySelectorAll(
          "measure[number='2'] > attributes, measure[number='2'] > direction, measure[number='2'] > print"
        )
      ).toHaveLength(0);
    }
    expect(material.expected.map((note) => note.startBeat)).toEqual([0, 2, 4, 6]);
    expect(material.song.measures.map((measure) => measure.length)).toEqual([4, 4]);
    expect(material.expected.every((note) => Math.abs(note.duration - (2 * 60) / 72) < 1e-7)).toBe(
      true
    );
    expect(expectedNodeRawIds(material.node)).toEqual(
      [1, 2, 3, 4].map((index) => `practice-hot-cross-buns-notes-e-repeat-v1-n${String(index)}`)
    );
    expect(material.expected.every((note) => note.sourceNoteId.includes("notes-e-repeat-v1"))).toBe(
      true
    );
    expect(grade(halfId)).toMatchObject({ stars: 3, completed: true, expectedCount: 4 });
    for (const oldId of [legacyId, halfId])
      expect(source.legacyNodes?.find((node) => node.id === oldId)?.supersededBy).toBe(id);
    expect(source.nodes.some((node) => [legacyId, halfId].includes(node.id))).toBe(false);
    expect(() =>
      expectedNodeRawIds({
        ...material.node,
        repeat: { originNoteId: "hot-cross-buns-m1-n1", count: 4, duration: "whole" } as never
      })
    ).toThrow("song-course-invalid-repeat-definition");
  });
  it("keeps derived IDs out of source-only reviews and validates the repeat definition", () => {
    const material = buildSongCourseMaterial(source, id),
      result = grade(id, true),
      flow = new SongCourseReviewFlow();
    expect(flow.canReview(material, result)).toBe(false);
    expect(flow.start(material, result, null)).toBeNull();
    expect(() => expectedNodeRawIds({ ...material.node, sourceNoteIds: ["unknown"] })).toThrow();
    expect(() =>
      buildSongCourseMaterial(source, {
        ...material.node,
        repeat: { originNoteId: "unknown", count: 4, duration: "quarter" }
      })
    ).toThrow();
  });
});
