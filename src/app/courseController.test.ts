// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { CourseLesson, CourseRunResult } from "../course/model";
import { progressKey, runContext } from "../course/model";
import { songActions } from "./songSlice";
import { preferencesActions } from "./preferencesSlice";
import { createAppStore } from "./store";
import { COURSE_STORAGE_KEY } from "./coursePersistence";
import { PREFERENCE_KEYS } from "./preferencePersistence";
import { courseActions } from "./courseSlice";
import { activeCourse, courseSource, createCourseController } from "./courseController";
import { selectSongKey } from "./songSelectors";
import type { Song } from "../song/song";
import { NOTE_RESULT_POLICY } from "../practice/noteResult";

const XML = `<score-partwise><part-list><score-part id="p"><part-name>Piano</part-name></score-part></part-list><part id="p"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><staff>1</staff></note><backup><duration>4</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><staff>2</staff></note></measure></part></score-partwise>`;
const lesson: CourseLesson = {
  id: "fixture",
  number: 1,
  title: "Synthetic",
  goal: "Synthetic",
  stages: ["right", "left", "both"],
  phrases: [
    { id: "a", version: "1", musicXml: XML },
    { id: "b", version: "1", musicXml: XML }
  ]
};
const firstPhrase = lesson.phrases[0];
if (!firstPhrase) throw new Error("Missing fixture phrase");
function harness(courseLesson = lesson) {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
  const store = createAppStore({ storage, courseLessons: [courseLesson] });
  const controller = createCourseController(store, [courseLesson], (song, librarySource) =>
    store.dispatch(songActions.songOpened({ song, lesson: null, librarySource }))
  );
  const selection = { lessonId: courseLesson.id, stage: "right" as const, phraseId: "a" };
  const result = (): CourseRunResult => ({
    songKey: selectSongKey(store.getState()),
    context: runContext(courseLesson, selection) ?? "",
    mode: "wait",
    from: 0,
    to: 4,
    hands: ["right"],
    hitCount: 1,
    noteResult: {
      policy: NOTE_RESULT_POLICY,
      expectedNotes: 1,
      hitNotes: 1,
      hitPercent: 30,
      holdPercent: 70,
      percent: 100
    },
    interrupted: false,
    fullRange: true
  });
  return { store, values, storage, controller, selection, result };
}

describe("course integration commands", () => {
  it("opens and switches a downstream review lesson while requiring a qualified real run for credit", () => {
    const next: CourseLesson = { ...lesson, id: "next", number: 2 };
    const lessons = [lesson, next];
    const { store, selection, result } = harness(next);
    const showSong = (song: Song, librarySource: string | null) =>
      store.dispatch(songActions.songOpened({ song, lesson: null, librarySource }));
    const review = createCourseController(store, lessons, showSong, "review");
    const production = createCourseController(store, lessons, showSong);
    review.continueLesson(next.id);
    expect(activeCourse(store.getState(), lessons, "review")?.selection).toEqual(selection);
    expect(activeCourse(store.getState(), lessons)).toBeNull();
    expect(store.getState().course.progress).toEqual({});
    for (const stage of ["left", "both", "right"] as const) {
      review.chooseStage(next.id, stage);
      expect(activeCourse(store.getState(), lessons, "review")?.selection).toEqual({
        ...selection,
        stage
      });
    }
    const saved = store.getState();
    production.chooseStage(next.id, "left");
    production.open({ ...selection, phraseId: "b" });
    production.finish(result());
    expect(store.getState()).toBe(saved);
    const completion = result();
    if (!completion.noteResult) throw new Error("Missing result fixture");
    for (const rejected of [
      { ...result(), hands: [] },
      { ...result(), hitCount: 0 },
      { ...result(), interrupted: true },
      { ...result(), fullRange: false },
      {
        ...completion,
        noteResult: { ...completion.noteResult, holdPercent: 44.99, percent: 74.99 }
      }
    ]) {
      review.finish(rejected);
      expect(store.getState().course.progress).toEqual({});
    }
    review.finish(result());
    expect(store.getState().course.progress).toEqual({
      [progressKey(next, "right", firstPhrase)]: true
    });
  });

  it("rejects absent review phrases and unavailable lessons without changing selection", () => {
    const next = { ...lesson, id: "next", number: 2 };
    const unavailable: CourseLesson = { ...lesson, id: "unavailable", number: 3, phrases: [] };
    const { store, selection } = harness(next);
    const review = createCourseController(
      store,
      [lesson, next, unavailable],
      (song, librarySource) =>
        store.dispatch(songActions.songOpened({ song, lesson: null, librarySource })),
      "review"
    );
    review.open(selection);
    const saved = store.getState();
    review.open({ ...selection, phraseId: "missing" });
    review.open({ ...selection, lessonId: unavailable.id });
    review.continueLesson(unavailable.id);
    review.chooseStage(unavailable.id, "both");
    expect(store.getState()).toBe(saved);
    expect(store.getState().course.progress).toEqual({});
  });

  const mixed: CourseLesson = {
    ...lesson,
    phrases: [{ id: "coord", version: "1", musicXml: XML }, ...lesson.phrases],
    tasks: [
      { phraseId: "coord", stage: "both" },
      { phraseId: "a", stage: "right" },
      { phraseId: "b", stage: "right" },
      { phraseId: "a", stage: "left" },
      { phraseId: "b", stage: "left" },
      { phraseId: "a", stage: "both" },
      { phraseId: "b", stage: "both" }
    ]
  };

  it("keeps the current melody phrase when switching hands instead of opening coordination", () => {
    const { store, controller } = harness(mixed);
    controller.open({ lessonId: mixed.id, phraseId: "b", stage: "right" });
    store.dispatch(courseActions.listenOnlyChanged(true));
    store.dispatch(preferencesActions.playerChanged({ handChoice: "left", accompaniment: true }));
    const saved = store.getState();
    for (const stage of ["left", "both", "right"] as const) {
      controller.chooseStage(mixed.id, stage);
      expect(activeCourse(store.getState(), [mixed])?.selection).toEqual({
        lessonId: mixed.id,
        phraseId: "b",
        stage
      });
    }
    expect(store.getState().course.progress).toEqual(saved.course.progress);
    expect(store.getState().course.listenOnly).toBe(true);
    expect(store.getState().preferences).toEqual(saved.preferences);
  });

  it("keeps an already completed current phrase when selecting another stage", () => {
    const { store, controller } = harness(mixed);
    controller.open({ lessonId: mixed.id, phraseId: "b", stage: "right" });
    const phrase = mixed.phrases.find((candidate) => candidate.id === "b");
    if (!phrase) throw new Error("Missing fixture phrase");
    store.dispatch(courseActions.phraseCredited(progressKey(mixed, "both", phrase)));
    controller.chooseStage(mixed.id, "both");
    expect(store.getState().course.selection).toEqual({
      lessonId: mixed.id,
      phraseId: "b",
      stage: "both"
    });
  });

  it("does not reopen or reset the selected phrase when its stage is selected again", () => {
    const { store, controller } = harness(mixed);
    controller.open({ lessonId: mixed.id, phraseId: "b", stage: "right" });
    const saved = store.getState();
    controller.chooseStage(mixed.id, "right");
    expect(store.getState()).toBe(saved);
  });

  it.each([false, true])(
    "uses an assigned fallback when the current phrase has no requested stage (all complete: %s)",
    (allComplete) => {
      const { store, controller } = harness(mixed);
      controller.open({ lessonId: mixed.id, phraseId: "coord", stage: "both" });
      store.dispatch(courseActions.phraseCredited(progressKey(mixed, "right", firstPhrase)));
      if (allComplete) {
        const phrase = mixed.phrases.find((candidate) => candidate.id === "b");
        if (!phrase) throw new Error("Missing fixture phrase");
        store.dispatch(courseActions.phraseCredited(progressKey(mixed, "right", phrase)));
      }
      controller.chooseStage(mixed.id, "right");
      expect(store.getState().course.selection).toEqual({
        lessonId: mixed.id,
        phraseId: allComplete ? "a" : "b",
        stage: "right"
      });
    }
  );

  it("still continues from the first incomplete task in lesson order", () => {
    const { store, controller } = harness(mixed);
    controller.open({ lessonId: mixed.id, phraseId: "b", stage: "right" });
    controller.chooseStage(mixed.id, "both");
    controller.continueLesson(mixed.id);
    expect(store.getState().course.selection).toEqual({
      lessonId: mixed.id,
      phraseId: "coord",
      stage: "both"
    });
  });

  it("does not reuse a saved course phrase while an ordinary song is active", () => {
    const { store, controller } = harness(mixed);
    controller.open({ lessonId: mixed.id, phraseId: "b", stage: "right" });
    store.dispatch(songActions.librarySourceChanged(null));
    expect(activeCourse(store.getState(), [mixed])).toBeNull();
    controller.chooseStage(mixed.id, "both");
    expect(store.getState().course.selection).toEqual({
      lessonId: mixed.id,
      phraseId: "coord",
      stage: "both"
    });
  });

  it("uses the requested lesson's fallback while a different lesson is active", () => {
    const predecessor: CourseLesson = { ...mixed, finalTask: { stage: "both", phraseId: "a" } };
    const other = { ...mixed, id: "other", number: 2 };
    const { store } = harness(mixed);
    store.dispatch(courseActions.phraseCredited(progressKey(predecessor, "both", firstPhrase)));
    const controller = createCourseController(store, [predecessor, other], (song, librarySource) =>
      store.dispatch(songActions.songOpened({ song, lesson: null, librarySource }))
    );
    controller.open({ lessonId: other.id, phraseId: "b", stage: "right" });
    controller.chooseStage(mixed.id, "both");
    expect(store.getState().course.selection).toEqual({
      lessonId: mixed.id,
      phraseId: "coord",
      stage: "both"
    });
  });
  it("guards open, continue, stage changes and an injected active selection until the final is credited", () => {
    const predecessor: CourseLesson = { ...lesson, finalTask: { stage: "both", phraseId: "b" } };
    const next = { ...lesson, id: "next", number: 2 };
    const lessons = [predecessor, next];
    const { store } = harness(predecessor);
    const showSong = vi.fn((song: Song, librarySource: string | null) => {
      store.dispatch(songActions.songOpened({ song, lesson: null, librarySource }));
    });
    const controller = createCourseController(store, lessons, showSong);
    const nextTask = { lessonId: next.id, phraseId: "a", stage: "right" as const };
    controller.open(nextTask);
    controller.continueLesson(next.id);
    controller.chooseStage(next.id, "both");
    expect(showSong).not.toHaveBeenCalled();
    store.dispatch(courseActions.selectionChosen(nextTask));
    store.dispatch(songActions.librarySourceChanged(courseSource(next, nextTask)));
    expect(activeCourse(store.getState(), lessons)).toBeNull();
    controller.open({ lessonId: predecessor.id, phraseId: "b", stage: "both" });
    const final = { lessonId: predecessor.id, phraseId: "b", stage: "both" as const };
    const completion: CourseRunResult = {
      songKey: selectSongKey(store.getState()),
      context: runContext(predecessor, final) ?? "",
      mode: "tempo",
      from: 0,
      to: 4,
      hands: ["left", "right"],
      hitCount: 2,
      noteResult: {
        policy: NOTE_RESULT_POLICY,
        expectedNotes: 2,
        hitNotes: 2,
        hitPercent: 30,
        holdPercent: 70,
        percent: 100
      },
      interrupted: false,
      fullRange: true
    };
    for (const rejected of [
      { ...completion, hands: [] },
      { ...completion, hitCount: 0 },
      { ...completion, interrupted: true },
      { ...completion, fullRange: false }
    ]) {
      controller.finish(rejected);
      controller.open(nextTask);
      expect(activeCourse(store.getState(), lessons)?.lesson.id).toBe(predecessor.id);
    }
    controller.finish(completion);
    controller.open(nextTask);
    expect(activeCourse(store.getState(), lessons)?.selection).toEqual(nextTask);
  });

  it("does not reload a downstream saved lesson after the predecessor final is corrected", () => {
    const predecessor: CourseLesson = { ...lesson, finalTask: { stage: "both", phraseId: "b" } };
    const next = { ...lesson, id: "next", number: 2 };
    const { store, storage } = harness(predecessor);
    const finalPhrase = predecessor.phrases[1];
    if (!finalPhrase) throw new Error("Missing final");
    store.dispatch(courseActions.phraseCredited(progressKey(predecessor, "both", finalPhrase)));
    const controller = createCourseController(store, [predecessor, next], (song, librarySource) =>
      store.dispatch(songActions.songOpened({ song, lesson: null, librarySource }))
    );
    controller.open({ lessonId: next.id, phraseId: "a", stage: "right" });
    const downstreamKey = progressKey(next, "right", firstPhrase);
    store.dispatch(courseActions.phraseCredited(downstreamKey));
    const expected = store.getState().course.progress;
    const changed = { ...predecessor, phrases: [firstPhrase, { ...finalPhrase, version: "2" }] };
    expect(activeCourse(store.getState(), [changed, next])).toBeNull();
    storage.setItem.mockClear();
    const restored = createAppStore({ storage, courseLessons: [changed, next] });
    expect(restored.getState().course.selection).toBeNull();
    expect(restored.getState().song.librarySource).toBeNull();
    expect(restored.getState().course.progress).toEqual(expected);
    expect(restored.getState().course.progress[downstreamKey]).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("starts a mixed lesson with both hands and switches only to assigned stage phrases", () => {
    const mixed: CourseLesson = {
      ...lesson,
      stages: ["right", "both"],
      tasks: [
        { phraseId: "a", stage: "both" },
        { phraseId: "b", stage: "right" }
      ]
    };
    const { store } = harness();
    const controller = createCourseController(store, [mixed], (song, librarySource) =>
      store.dispatch(songActions.songOpened({ song, lesson: null, librarySource }))
    );
    controller.continueLesson(mixed.id);
    expect(store.getState().course.selection).toEqual({
      lessonId: mixed.id,
      phraseId: "a",
      stage: "both"
    });
    controller.chooseStage(mixed.id, "right");
    expect(store.getState().course.selection).toEqual({
      lessonId: mixed.id,
      phraseId: "b",
      stage: "right"
    });
    const current = store.getState();
    controller.open({ lessonId: mixed.id, phraseId: "a", stage: "right" });
    expect(store.getState()).toBe(current);
    controller.chooseStage(mixed.id, "both");
    store.dispatch(courseActions.phraseCredited(progressKey(mixed, "both", firstPhrase)));
    controller.continueLesson(mixed.id);
    expect(store.getState().course.selection).toEqual({
      lessonId: mixed.id,
      phraseId: "b",
      stage: "right"
    });
  });

  it("does not restore a saved pair removed from the task list while keeping unrelated credit", () => {
    const { controller, selection, result, storage } = harness();
    controller.open(selection);
    controller.finish(result());
    const mixed: CourseLesson = {
      ...lesson,
      tasks: [
        { phraseId: "a", stage: "both" },
        { phraseId: "b", stage: "right" },
        { phraseId: "b", stage: "left" }
      ]
    };
    const restored = createAppStore({ storage, courseLessons: [mixed] });
    expect(restored.getState().course.selection).toBeNull();
    expect(restored.getState().song.librarySource).toBeNull();
    expect(activeCourse(restored.getState(), [mixed])).toBeNull();
    expect(restored.getState().course.progress).toEqual({
      [progressKey(lesson, "right", firstPhrase)]: true
    });
  });
  it("allows any prepared task, preserves ordinary hand/accompaniment choices and starts with tabs", () => {
    const { store, controller } = harness();
    store.dispatch(preferencesActions.playerChanged({ handChoice: "left", accompaniment: true }));
    controller.chooseStage(lesson.id, "both");
    expect(activeCourse(store.getState(), [lesson])?.selection.stage).toBe("both");
    expect(store.getState().preferences.player).toMatchObject({
      handChoice: "left",
      accompaniment: true
    });
    expect(store.getState().course).toMatchObject({ view: "tabs", accompaniment: false });
  });
  it("credits only the current natural run and continues to the next incomplete phrase", () => {
    const { store, controller, selection, result } = harness();
    controller.open(selection);
    controller.finish({ ...result(), interrupted: true });
    controller.finish({ ...result(), hitCount: 0 });
    expect(store.getState().course.progress).toEqual({});
    controller.finish(result());
    expect(
      store.getState().course.progress[
        progressKey(lesson, "right", { id: "a", version: "1", musicXml: XML })
      ]
    ).toBe(true);
    controller.continueLesson(lesson.id);
    expect(store.getState().course.selection?.phraseId).toBe("b");
  });
  it("rejects a stale stage result, typing and ordinary songs", () => {
    const { store, controller, selection, result } = harness();
    controller.open(selection);
    const old = result();
    controller.chooseStage(lesson.id, "left");
    controller.finish(old);
    expect(store.getState().course.progress).toEqual({});
    controller.open(selection);
    store.dispatch(preferencesActions.wordChanged({ enabled: true }));
    controller.finish(result());
    expect(store.getState().course.progress).toEqual({});
    store.dispatch(preferencesActions.wordChanged({ enabled: false }));
    store.dispatch(songActions.librarySourceChanged(null));
    controller.finish(old);
    expect(activeCourse(store.getState(), [lesson])).toBeNull();
    expect(store.getState().course.selection).toEqual(selection);
  });
  it("restores the current course phrase and its credit without writing defaults", () => {
    const { store, controller, selection, result, storage } = harness();
    controller.open(selection);
    controller.finish(result());
    store.dispatch(courseActions.viewChanged("staff"));
    store.dispatch(courseActions.accompanimentChanged(true));
    storage.setItem.mockClear();
    const restored = createAppStore({ storage, courseLessons: [lesson] });
    expect(activeCourse(restored.getState(), [lesson])?.selection).toEqual(selection);
    expect(restored.getState().course).toMatchObject({ view: "staff", accompaniment: true });
    expect(restored.getState().course.progress).toEqual(store.getState().course.progress);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem(COURSE_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(PREFERENCE_KEYS.player)).not.toBeNull();
  });
  it("restores the actual downstream song only in review while preserving genuine marks and preferences", () => {
    const predecessor: CourseLesson = {
      ...lesson,
      finalTask: { stage: "both", phraseId: "b" }
    };
    const next: CourseLesson = { ...lesson, id: "next", number: 2 };
    const { store: original, controller, selection, result, storage } = harness(predecessor);
    controller.open(selection);
    controller.finish(result());
    original.dispatch(preferencesActions.playerChanged({ metronome: false, accompaniment: true }));
    const options = { storage, courseLessons: [predecessor, next] };
    const store = createAppStore({ ...options, courseAccess: "review" });
    const review = createCourseController(
      store,
      options.courseLessons,
      (song, librarySource) =>
        store.dispatch(songActions.songOpened({ song, lesson: null, librarySource })),
      "review"
    );
    review.open({ lessonId: next.id, phraseId: "b", stage: "right" });
    review.chooseStage(next.id, "left");
    const saved = store.getState();
    const nextSelection = { lessonId: next.id, phraseId: "b", stage: "left" as const };
    expect(saved.course.selection).toEqual(nextSelection);
    expect(saved.course.progress).toEqual({
      [progressKey(predecessor, "right", firstPhrase)]: true
    });
    expect(saved.song.librarySource).toBe(courseSource(next, nextSelection));
    expect(saved.song.sourceSong.title).toMatch(/^course:next:b:/);
    storage.setItem.mockClear();
    const restored = createAppStore({ ...options, courseAccess: "review" });
    expect(activeCourse(restored.getState(), options.courseLessons, "review")?.selection).toEqual(
      nextSelection
    );
    expect(restored.getState().song).toMatchObject({
      librarySource: saved.song.librarySource,
      sourceSong: saved.song.sourceSong,
      lesson: null
    });
    expect(restored.getState().course.progress).toEqual(saved.course.progress);
    expect(restored.getState().preferences).toEqual(saved.preferences);
    const production = createAppStore(options);
    expect(production.getState().course.selection).toBeNull();
    expect(production.getState().song.librarySource).toBeNull();
    expect(production.getState().song.sourceSong.title).not.toBe(saved.song.sourceSong.title);
    expect(activeCourse(production.getState(), options.courseLessons)).toBeNull();
    expect(production.getState().course.progress).toEqual(saved.course.progress);
    expect(production.getState().preferences).toEqual(saved.preferences);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("falls back safely when a locally saved course is unavailable", () => {
    const { controller, selection, storage } = harness();
    controller.open(selection);
    const restored = createAppStore({ storage, courseLessons: [] });
    expect(restored.getState().song.librarySource).toBeNull();
    expect(restored.getState().song.lesson).not.toBeNull();
  });
});
