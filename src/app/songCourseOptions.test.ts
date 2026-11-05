// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { PracticeSession } from "../practice/session";
import { SONG_COURSE_SOURCES } from "../songCourse/catalog";
import { buildSongCourseMaterial } from "../songCourse/material";
import type { SongCourseNodeKind } from "../songCourse/model";
import { songCourseOptions } from "./songCourseOptions";
import { newCourseAttempt } from "./songCourseStartup";

function material(kind: SongCourseNodeKind) {
  const source = SONG_COURSE_SOURCES[0];
  const node = source?.nodes.find((value) => value.kind === "notes");
  if (!source || !node) throw new Error("missing source");
  return buildSongCourseMaterial(source, { ...node, kind });
}
describe("course learner transport options", () => {
  it.each([
    "notes",
    "duration",
    "guided-phrase",
    "independent-phrase",
    "performance",
    "review"
  ] as const)("uses one %s mode for the musical clock and independent evidence", (kind) => {
    const score = material(kind);
    const options = songCourseOptions(score, 0.75);
    const attempt = newCourseAttempt(score, 0.75, "run");
    expect(options.mode).toBe(kind === "review" ? "wait" : "tempo");
    expect(attempt.config.mode).toBe(options.mode);
    expect(attempt.config.speed).toBe(options.speed);
    expect(options.countInBeats).toBe(4);
  });
  it.each(["notes", "duration"] as const)(
    "keeps %s learner attacks silent until the child plays",
    (kind) => {
      const score = material(kind);
      expect(
        score.song.notes.some((note) => !score.source.learnerPartIds.includes(note.part ?? ""))
      ).toBe(true);
      const session = new PracticeSession(score.song, songCourseOptions(score, 1));
      const events = session.advance(session.leadInSeconds + score.song.duration + 1);
      expect(events.filter((event) => event.type === "autoNoteOn")).toEqual([]);
      expect(session.waiting).toBe(false);
    }
  );
  it.each(["guided-phrase", "independent-phrase", "performance"] as const)(
    "retains %s accompaniment",
    (kind) => {
      const score = material(kind);
      const session = new PracticeSession(score.song, songCourseOptions(score, 1));
      const events = session.advance(session.leadInSeconds + score.song.duration + 1);
      expect(events.some((event) => event.type === "autoNoteOn")).toBe(true);
    }
  );
});
