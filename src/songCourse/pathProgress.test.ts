// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "./catalog";
import { buildSongCourseMaterial } from "./material";
import { gradeSongCourseAttempt } from "./rubric";
import { coursePathResults } from "./pathProgress";

const fixture = findSongCourseSource("hot-cross-buns");
if (!fixture) throw new Error("missing fixture");
const source = fixture;
function receipt() {
  const material = buildSongCourseMaterial(source, "hot-cross-buns/guided-2");
  const inputs = material.expected.flatMap((note, index) => [
    {
      type: "down" as const,
      source: "keyboard",
      pitch: note.pitch,
      performanceMs: note.start * 1000,
      stableOrdinal: index * 2,
      songTime: note.start
    },
    {
      type: "up" as const,
      source: "keyboard",
      pitch: note.pitch,
      performanceMs: (note.start + note.duration) * 1000,
      stableOrdinal: index * 2 + 1,
      songTime: note.start + note.duration
    }
  ]);
  return gradeSongCourseAttempt(
    {
      runId: "old-repeat",
      songId: source.id,
      sourceRevision: source.revision,
      sourceHash: source.sourceHash,
      nodeId: material.node.id,
      mode: "tempo",
      speed: 1,
      learnerPartIds: source.learnerPartIds,
      expected: material.expected
    },
    {
      inputs,
      musicalEndPerformanceMs: material.song.duration * 1000,
      closedAtPerformanceMs: material.song.duration * 1000 + 300,
      createdAt: 1
    }
  );
}

describe("equivalent phrase credit", () => {
  it("shows a proved old repeat on its representative without changing any receipt identity", () => {
    const result = receipt();
    expect(result.stars).toBe(3);
    const grouped = coursePathResults(source, [result]);
    expect(grouped.get("hot-cross-buns/guided-1")).toBe(result);
    expect(grouped.has("hot-cross-buns/guided-2")).toBe(false);
    expect(coursePathResults(source, [result], false).get(result.nodeId)).toBe(result);
    expect(result.nodeId).toBe("hot-cross-buns/guided-2");
  });
  it("rejects forged credit, a different source revision and a repeat relabelled as its representative", () => {
    const result = receipt();
    for (const forged of [
      { ...result, stars: 2 as const },
      { ...result, sourceRevision: "unknown" },
      { ...result, nodeId: "hot-cross-buns/guided-1" },
      { ...result, rubricVariant: "learning-review" as const }
    ]) {
      expect(coursePathResults(source, [forged]).size).toBe(0);
    }
  });
});
