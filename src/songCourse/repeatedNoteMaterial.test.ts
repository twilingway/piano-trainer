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
const id = "hot-cross-buns/notes-e-repeat-v1";
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
  it("keeps the source intact and engraves four independent half-note events with finger three", () => {
    const original = source.musicXml;
    const material = buildSongCourseMaterial(source, id);
    expect(material.expected.map((note) => note.pitch)).toEqual([64, 64, 64, 64]);
    expect(material.expected.map((note) => note.startBeat)).toEqual([0, 2, 4, 6]);
    expect(material.song.measures.map((measure) => measure.length)).toEqual([4, 4]);
    expect(material.song.duration).toBeCloseTo((8 * 60) / 72);
    expect(new Set(material.expected.map((note) => note.sourceNoteId)).size).toBe(4);
    expect(new Set(material.expected.map((note) => note.runtimeNoteId)).size).toBe(4);
    expect(material.expected.every((note) => Math.abs(note.duration - (2 * 60) / 72) < 1e-7)).toBe(
      true
    );
    expect(
      material.expected.map((note) => material.sourceToRuntime.get(note.sourceNoteId))
    ).toEqual(material.expected.map((note) => note.runtimeNoteId));
    expect(
      material.song.notes.every(
        (note) => note.finger === 3 && note.scoreFinger === 3 && note.part === "learner"
      )
    ).toBe(true);
    const document = new DOMParser().parseFromString(learnerScoreXml(material), "application/xml");
    expect([...document.querySelectorAll("note > type")].map((node) => node.textContent)).toEqual([
      "half",
      "half",
      "half",
      "half"
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
  it("retains the old proof without crediting it to the replacement node", () => {
    const legacy = { ...grade(legacyId), rubricVersion: "song-course-v1" as const };
    const current = grade();
    const material = buildSongCourseMaterial(source, id);
    expect(validSongCourseResult(legacy)).toBe(true);
    expect(songCourseEvidenceMatchesNode(legacy, source, material.node)).toBe(false);
    expect(songCourseEvidenceMatchesNode({ ...legacy, nodeId: id }, source, material.node)).toBe(
      false
    );
    expect(songCourseEvidenceMatchesNode(current, source, material.node)).toBe(true);
    const old = readSongCourseProgress({ schemaVersion: 1, selection: null, results: [legacy] });
    expect(old.results).toHaveLength(1);
    expect(completedSongCourseNodes(old, source)).not.toContain(id);
    expect(completedSongCourseNodes({ ...old, results: [legacy, current] }, source)).toContain(id);
  });
  it("restores the replacement without starting it and continues within this song", () => {
    const selection = {
      songId: source.id,
      sourceRevision: source.revision,
      sourceHash: source.sourceHash,
      nodeId: legacyId
    };
    expect(
      initialCourseSelection({ schemaVersion: 1, selection, results: [] }, false)?.nodeId
    ).toBe(id);
    expect(nextCourseSelection(buildSongCourseMaterial(source, legacyId))?.nodeId).toBe(
      "hot-cross-buns/notes-e"
    );
    expect(nextCourseSelection(buildSongCourseMaterial(source, id))?.nodeId).toBe(
      "hot-cross-buns/notes-e"
    );
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
        repeat: { originNoteId: "unknown", count: 4 }
      })
    ).toThrow();
  });
});
