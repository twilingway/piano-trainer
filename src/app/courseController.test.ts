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
import { activeCourse, createCourseController } from "./courseController";
import { selectSongKey } from "./songSelectors";

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
function harness() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
  const store = createAppStore({ storage, courseLessons: [lesson] });
  const controller = createCourseController(store, [lesson], (song, librarySource) =>
    store.dispatch(songActions.songOpened({ song, lesson: null, librarySource }))
  );
  const selection = { lessonId: lesson.id, stage: "right" as const, phraseId: "a" };
  const result = (): CourseRunResult => ({
    songKey: selectSongKey(store.getState()),
    context: runContext(lesson, selection) ?? "",
    mode: "wait",
    from: 0,
    to: 4,
    hands: ["right"],
    hitCount: 1,
    interrupted: false,
    fullRange: true
  });
  return { store, values, storage, controller, selection, result };
}

describe("course integration commands", () => {
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
  it("falls back safely when a locally saved course is unavailable", () => {
    const { controller, selection, storage } = harness();
    controller.open(selection);
    const restored = createAppStore({ storage, courseLessons: [] });
    expect(restored.getState().song.librarySource).toBeNull();
    expect(restored.getState().song.lesson).not.toBeNull();
  });
});
