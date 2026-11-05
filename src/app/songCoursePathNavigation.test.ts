// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { SONG_COURSE_SOURCES } from "../songCourse/catalog";
import { emptySongCourseProgress } from "../songCourse/progress";
import { initialCourseSelection, nextCourseSelection } from "./songCourseStartup";
const source = SONG_COURSE_SOURCES[0];
if (!source) throw new Error("missing fixture");
it("moves through unique motifs while keeping a chosen old repeat forward-only", () => {
  for (const [from, next] of [
    ["guided-1", "guided-3"],
    ["guided-2", "guided-3"],
    ["guided-4", "independent-1"]
  ] as const) {
    expect(nextCourseSelection({ source, node: { id: `${source.id}/${from}` } })?.nodeId).toBe(
      `${source.id}/${next}`
    );
  }
});
it("keeps an explicitly saved old repeat playable instead of rewriting its history", () => {
  const selection = {
    songId: source.id,
    sourceRevision: source.revision,
    sourceHash: source.sourceHash,
    nodeId: `${source.id}/guided-4`
  };
  expect(initialCourseSelection({ ...emptySongCourseProgress(), selection }, false)).toEqual(
    selection
  );
});
it("starts the next source normally after the full original performance", () => {
  expect(nextCourseSelection({ source, node: { id: `${source.id}/performance` } })?.nodeId).toBe(
    SONG_COURSE_SOURCES[1]?.nodes[0]?.id
  );
});
