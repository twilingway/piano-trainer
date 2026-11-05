// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { Trainer } from "../practice/Trainer";
import type { Song } from "../song/song";
import type { PracticeSession } from "../practice/session";
import { SONG_COURSE_SOURCES } from "../songCourse/catalog";
import { buildSongCourseMaterial } from "../songCourse/material";
import { emptySongCourseProgress } from "../songCourse/progress";
import { gradeSongCourseAttempt } from "../songCourse/rubric";
import { courseConfig, gradeEvidence } from "../songCourse/testFixtures";
import type { CourseMaterial, SongCourseResult } from "../songCourse/model";
import { SongCourseReviewFlow } from "./songCourseReviewFlow";
import { SongCourseController } from "./songCourseController";
import { songCourseMessages } from "../i18n/songCourseMessages";

function example() {
  const source = SONG_COURSE_SOURCES.find((value) => value.id === "hot-cross-buns");
  const node = source?.nodes.find((value) => value.kind === "performance");
  if (!source || !node) throw new Error("source missing");
  const material = buildSongCourseMaterial(source, node);
  const selection = {
    songId: source.id,
    sourceRevision: source.revision,
    sourceHash: source.sourceHash,
    nodeId: node.id
  };
  return { material, selection };
}
function mistakes(material: CourseMaterial, runId = "mistakes"): SongCourseResult {
  return gradeSongCourseAttempt(
    courseConfig(material.expected, {
      runId,
      songId: material.source.id,
      sourceRevision: material.source.revision,
      sourceHash: material.source.sourceHash,
      nodeId: material.node.id,
      learnerPartIds: material.source.learnerPartIds,
      ...(material.node.kind === "review" ? { rubricVariant: "learning-review" as const } : {})
    }),
    gradeEvidence([], {
      musicalEndPerformanceMs: material.song.duration * 1000,
      closedAtPerformanceMs: material.song.duration * 1000 + 1000
    })
  );
}

describe("reviewing all actual source blocks", () => {
  it("keeps every failed phrase queued, then returns to the original stage", () => {
    const { material, selection } = example();
    const flow = new SongCourseReviewFlow();
    let current = flow.start(material, mistakes(material), selection);
    const blocks: CourseMaterial[] = [];
    while (current) {
      blocks.push(current);
      expect(current.node.kind).toBe("review");
      expect(
        current.expected.every((note) =>
          material.expected.some((original) => original.sourceNoteId === note.sourceNoteId)
        )
      ).toBe(true);
      expect(songCourseMessages[current.node.instruction]?.en).toBeTruthy();
      current = flow.takeNext();
    }
    expect(blocks.length).toBeGreaterThan(1);
    expect(
      new Set(blocks.flatMap((block) => block.expected.map((note) => note.sourceNoteId)))
    ).toEqual(new Set(material.expected.map((note) => note.sourceNoteId)));
    expect(flow.hasPending).toBe(false);
    expect(flow.returnTo).toEqual(selection);
  });
  it("repeats a failed review block without dropping later original phrases", () => {
    const { material, selection } = example();
    const flow = new SongCourseReviewFlow();
    const first = flow.start(material, mistakes(material), selection);
    if (!first) throw new Error("review missing");
    const repeated = flow.start(first, mistakes(first, "review-failed"), selection);
    expect(repeated?.expected.map((note) => note.sourceNoteId)).toEqual(
      first.expected.map((note) => note.sourceNoteId)
    );
    const next = flow.takeNext();
    expect(next?.node.phraseIds).not.toEqual(first.node.phraseIds);
    expect(flow.returnTo).toEqual(selection);
    flow.clear();
    expect(flow.hasPending).toBe(false);
    expect(flow.returnTo).toBeNull();
  });
  it("describes this block's actual error axis rather than another phrase's error", () => {
    const { material, selection } = example();
    const result = mistakes(material);
    const firstPhrase = material.expected[0]?.phraseId;
    const custom: SongCourseResult = {
      ...result,
      notes: result.notes.map((note) => ({
        ...note,
        mistakes: note.phraseId === firstPhrase ? ["hold"] : ["onset"]
      }))
    };
    const flow = new SongCourseReviewFlow();
    expect(flow.start(material, custom, selection)?.node.instruction).toContain("длину звуков");
    expect(flow.takeNext()?.node.instruction).toContain("ритм");
  });
});

function controllerHarness() {
  const onResult = vi.fn(),
    save = vi.fn(() => Promise.resolve());
  const controller = new SongCourseController(
    { onSelection: vi.fn(), onResult },
    {
      load: () => Promise.resolve(emptySongCourseProgress()),
      save
    }
  );
  controller.choose("hot-cross-buns", "hot-cross-buns/notes-c");
  let session = { time: 0, waiting: false, finished: true } as unknown as PracticeSession;
  const play = vi.fn((playing: boolean) => {
    if (playing) controller.policy.onStart(session, 1000, []);
  });
  const load = vi.fn((song: Song) => {
    session = { song, time: 0, waiting: false, finished: true } as unknown as PracticeSession;
  });
  let resolveSound: (value: boolean) => void = () => undefined;
  const sound = new Promise<boolean>((resolve) => {
    resolveSound = resolve;
  });
  controller.refreshConnection({
    trainer: { setPlaying: play, load } as unknown as Trainer,
    blocked: false,
    prepare: () => sound
  });
  return {
    controller,
    play,
    save,
    onResult,
    resolveSound,
    get session() {
      return session;
    }
  };
}
describe("controller review routing", () => {
  it("reaches every block after retries and returns only after the last review", async () => {
    const h = controllerHarness();
    h.controller.choose("hot-cross-buns", "hot-cross-buns/performance");
    const original = h.controller.getSnapshot().material;
    h.controller.present(h.controller.sceneId);
    h.resolveSound(true);
    await h.controller.start();
    h.controller.policy.onFrame(h.session, true, 2000);
    h.controller.policy.onFrame(h.session, true, 10000);
    expect(h.controller.getSnapshot().phase).toBe("result");
    expect(h.controller.canReview).toBe(true);
    h.controller.review();
    const first = h.controller.getSnapshot().material;
    expect(first?.node.kind).toBe("review");
    h.controller.retry();
    expect(h.controller.getSnapshot().material).toBe(first);
    const reviewed = new Set<string>();
    let steps = 0;
    while (h.controller.getSnapshot().material?.node.kind === "review") {
      const material = h.controller.getSnapshot().material;
      material?.expected.forEach((note) => reviewed.add(note.sourceNoteId));
      expect(h.controller.hasNext).toBe(true);
      h.controller.next();
      if (++steps > 20) throw new Error("review flow did not terminate");
    }
    expect(steps).toBeGreaterThan(1);
    expect(reviewed).toEqual(new Set(original?.expected.map((note) => note.sourceNoteId)));
    expect(h.controller.getSnapshot().material?.node.id).toBe(original?.node.id);
    expect(h.controller.getSnapshot().phase).toBe("ready");
  });
});

describe("staff failure stops a song course attempt", () => {
  it("cancels an in-flight begin even if sound later becomes ready", async () => {
    const h = controllerHarness();
    h.controller.present(h.controller.sceneId);
    const start = h.controller.start();
    h.controller.staffError(h.controller.sceneId);
    h.resolveSound(true);
    await start;
    expect(h.play).not.toHaveBeenCalledWith(true);
    expect(h.controller.getSnapshot().phase).toBe("error");
    expect(h.controller.getSnapshot().material).not.toBeNull();
  });
  it("never grades or saves a result after failure during an active attempt", async () => {
    const h = controllerHarness();
    h.controller.present(h.controller.sceneId);
    h.resolveSound(true);
    await h.controller.start();
    h.save.mockClear();
    h.controller.staffError(h.controller.sceneId);
    h.controller.policy.onFrame(h.session, true, 2000);
    h.controller.policy.onFrame(h.session, false, 10000);
    expect(h.play).toHaveBeenLastCalledWith(false);
    expect(h.controller.getSnapshot().phase).toBe("error");
    expect(h.controller.getSnapshot().result).toBeNull();
    expect(h.onResult).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
    await h.controller.start();
    expect(h.play.mock.calls.filter(([playing]) => playing)).toHaveLength(1);
    expect(h.controller.getSnapshot().phase).toBe("error");
    h.controller.retry();
    expect(h.controller.getSnapshot().phase).toBe("ready");
  });
});
