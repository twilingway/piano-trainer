import { describe, expect, it, vi } from "vitest";
import { SONG_COURSE_SOURCES } from "../songCourse/catalog";
import { emptySongCourseProgress } from "../songCourse/progress";
import { initialCourseSelection, loadCourseProgress } from "./songCourseStartup";

describe("song-course startup", () => {
  it("starts the first actual score for a fresh player, preserving an explicit legacy selection", () => {
    expect(initialCourseSelection(emptySongCourseProgress(), false)?.nodeId).toBe(
      "hot-cross-buns/notes-c"
    );
    expect(initialCourseSelection(emptySongCourseProgress(), true)).toBeNull();
  });
  it("restores only an existing source revision and content hash", () => {
    const source = SONG_COURSE_SOURCES[1];
    if (!source?.nodes[1]) throw new Error("fixture");
    const selection = {
      songId: source.id,
      sourceRevision: source.revision,
      sourceHash: source.sourceHash,
      nodeId: source.nodes[1].id
    };
    const progress = { ...emptySongCourseProgress(), selection };
    expect(initialCourseSelection(progress, false)).toEqual(selection);
    expect(
      initialCourseSelection(
        { ...progress, selection: { ...selection, sourceHash: "f".repeat(64) } },
        false
      )?.songId
    ).toBe("hot-cross-buns");
  });
  it("does not overwrite a newer explicit selection when the database finishes late", async () => {
    let resolve!: (value: ReturnType<typeof emptySongCourseProgress>) => void;
    const repository = {
      load: () =>
        new Promise<ReturnType<typeof emptySongCourseProgress>>((done) => {
          resolve = done;
        }),
      save: vi.fn(() => Promise.resolve())
    };
    let epoch = 0;
    const source = SONG_COURSE_SOURCES[0];
    if (!source?.nodes[1]) throw new Error("fixture");
    let local = emptySongCourseProgress();
    const pending = loadCourseProgress(
      repository,
      () => local,
      () => epoch,
      epoch
    );
    epoch++;
    local = {
      ...local,
      selection: {
        songId: source.id,
        sourceRevision: source.revision,
        sourceHash: source.sourceHash,
        nodeId: source.nodes[1].id
      }
    };
    resolve(emptySongCourseProgress());
    expect((await pending).selection).toEqual(local.selection);
  });
});
