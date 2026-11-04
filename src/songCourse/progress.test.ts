import { describe, expect, it } from "vitest";
import {
  completedSongCourseNodes,
  emptySongCourseProgress,
  mergeSongCourseProgress,
  readSongCourseProgress,
  validSongCourseResult
} from "./progress";
import { gradeSongCourseAttempt } from "./rubric";
import {
  courseConfig,
  gradeEvidence,
  rawInput,
  sourceFixture,
  TEST_SOURCE_HASH
} from "./testFixtures";

function receipt(runId = "run1", nodeId = "performance", time = 1) {
  return gradeSongCourseAttempt(
    courseConfig(undefined, { runId, nodeId }),
    gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)], { createdAt: time })
  );
}
describe("versioned song course progress", () => {
  it("retains two tabs' results without duplicate callbacks or stale selection overwrites", () => {
    const selected = {
      songId: "test",
      sourceRevision: "r1",
      sourceHash: TEST_SOURCE_HASH,
      nodeId: "new-selection"
    };
    const first = { ...emptySongCourseProgress(), selection: selected, results: [receipt("a")] };
    const second = { ...emptySongCourseProgress(), results: [receipt("b"), receipt("a")] };
    const merged = mergeSongCourseProgress(first, second);
    expect(merged.results.map((result) => result.runId)).toEqual(["a", "b"]);
    expect(merged.selection).toEqual(selected);
    expect(mergeSongCourseProgress(merged, second)).toEqual(merged);
  });
  it("keeps the first immutable receipt when a repeated run ID attempts to replace it", () => {
    const first = receipt("same");
    const other = receipt("same", "different-node", 2);
    const merged = mergeSongCourseProgress(
      { ...emptySongCourseProgress(), results: [first] },
      { ...emptySongCourseProgress(), results: [other] }
    );
    expect(merged.results).toEqual([first]);
  });
  it("filters only corrupted records and recalculates stars from note-level evidence", () => {
    const valid = receipt();
    expect(validSongCourseResult(valid)).toBe(true);
    const raw = {
      schemaVersion: 1,
      selection: null,
      results: [valid, { ...valid, runId: "forged", hold: 0 }, { stars: 3 }]
    };
    expect(readSongCourseProgress(raw).results).toEqual([valid]);
    expect(validSongCourseResult({ ...valid, rubricVersion: "legacy-reading" })).toBe(false);
    expect(validSongCourseResult({ ...valid, sourceRevision: "other" })).toBe(false);
    expect(validSongCourseResult({ ...valid, sourceHash: "malformed" })).toBe(false);
  });
  it("does not migrate legacy credit or a wrong mode/revision into the new final", () => {
    const source = sourceFixture();
    expect(
      readSongCourseProgress({
        schemaVersion: 1,
        completed: ["performance"],
        history: [{ stars: 3 }]
      }).results
    ).toEqual([]);
    const progress = { ...emptySongCourseProgress(), results: [receipt()] };
    expect(completedSongCourseNodes(progress, source)).toEqual(["performance"]);
    expect(completedSongCourseNodes(progress, { ...source, revision: "r2" })).toEqual([]);
    expect(completedSongCourseNodes(progress, { ...source, sourceHash: "b".repeat(64) })).toEqual(
      []
    );
    expect(
      completedSongCourseNodes(
        { ...progress, results: [{ ...receipt(), mode: "wait", onset: null }] },
        source
      )
    ).toEqual([]);
  });
  it("preserves completion proof when recent history is bounded", () => {
    const initial = receipt("proof", "one-time-stage", 0);
    const newer = Array.from({ length: 120 }, (_, index) =>
      receipt(`run-${String(index)}`, "performance", index + 1)
    );
    const merged = mergeSongCourseProgress(
      { ...emptySongCourseProgress(), results: [initial] },
      { ...emptySongCourseProgress(), results: newer }
    );
    expect(merged.results.some((result) => result.runId === "proof")).toBe(true);
    expect(merged.results.length).toBeLessThanOrEqual(98);
  });
  it("rejects a future schema instead of overwriting it", () => {
    expect(() =>
      mergeSongCourseProgress(
        { schemaVersion: 7, privateFutureField: true },
        emptySongCourseProgress()
      )
    ).toThrow("Unsupported");
  });
});
