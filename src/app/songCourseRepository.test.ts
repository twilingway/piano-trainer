import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { loadLibrarySetting, updateLibrarySetting } from "../library/myLibrary";
import { emptySongCourseProgress } from "../songCourse/progress";
import { gradeSongCourseAttempt } from "../songCourse/rubric";
import {
  courseConfig,
  gradeEvidence,
  rawInput,
  TEST_SOURCE_HASH
} from "../songCourse/testFixtures";
import { SONG_COURSE_DATABASE_KEY, songCourseRepository } from "./songCourseRepository";

beforeEach(async () => {
  await updateLibrarySetting(SONG_COURSE_DATABASE_KEY, () => emptySongCourseProgress());
});
function receipt(runId: string) {
  return gradeSongCourseAttempt(
    courseConfig(undefined, { runId }),
    gradeEvidence([rawInput("down", 0, 0), rawInput("up", 1000, 1)])
  );
}
describe("atomic song course repository", () => {
  it("merges concurrent independent saves through a real IndexedDB transaction", async () => {
    const empty = emptySongCourseProgress();
    await Promise.all([
      songCourseRepository.save({ ...empty, results: [receipt("tab-a")] }),
      songCourseRepository.save({ ...empty, results: [receipt("tab-b")] })
    ]);
    expect(
      (await songCourseRepository.load()).results.map((result) => result.runId).sort()
    ).toEqual(["tab-a", "tab-b"]);
  });
  it("does not let a late result save undo the current lesson selection", async () => {
    const selection = {
      songId: "test",
      sourceRevision: "r1",
      sourceHash: TEST_SOURCE_HASH,
      nodeId: "new-node"
    };
    await songCourseRepository.save({ ...emptySongCourseProgress(), selection }, true);
    await songCourseRepository.save({ ...emptySongCourseProgress(), results: [receipt("late")] });
    expect((await songCourseRepository.load()).selection).toEqual(selection);
  });
  it("preserves an unknown newer schema and isolates the old beginner key", async () => {
    const future = { schemaVersion: 3, futureData: [1, 2, 3] };
    await updateLibrarySetting(SONG_COURSE_DATABASE_KEY, () => future);
    await expect(songCourseRepository.load()).rejects.toThrow("Unsupported");
    await expect(songCourseRepository.save(emptySongCourseProgress())).rejects.toThrow(
      "Unsupported"
    );
    expect(await loadLibrarySetting(SONG_COURSE_DATABASE_KEY)).toEqual(future);
    await updateLibrarySetting("beginner-course-v1", () => ({ completed: ["performance"] }));
    await updateLibrarySetting(SONG_COURSE_DATABASE_KEY, () => emptySongCourseProgress());
    expect((await songCourseRepository.load()).results).toEqual([]);
  });
});

it("preserves full immutable evidence through an IndexedDB round-trip and refuses newer evidence", async () => {
  const result = receipt("proof");
  await songCourseRepository.save({ ...emptySongCourseProgress(), results: [result] });
  const loaded = await songCourseRepository.load();
  expect(loaded.results[0]?.evidence).toEqual(result.evidence);
  expect(Object.isFrozen(loaded.results[0]?.evidence.inputs)).toBe(true);
  const future = {
    schemaVersion: 1,
    selection: null,
    results: [{ ...result, evidence: { ...result.evidence, schemaVersion: 7 } }]
  };
  await updateLibrarySetting(SONG_COURSE_DATABASE_KEY, () => future);
  await expect(songCourseRepository.load()).rejects.toThrow("Unsupported");
  await expect(songCourseRepository.save(emptySongCourseProgress())).rejects.toThrow("Unsupported");
  expect(await loadLibrarySetting(SONG_COURSE_DATABASE_KEY)).toEqual(future);
});
