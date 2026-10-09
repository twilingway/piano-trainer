import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import { progressKey, type CourseLesson } from "../course/model";
import {
  courseActions,
  courseReducer,
  initialCourseState,
  type CourseRoot,
  type CourseState
} from "./courseSlice";
import {
  COURSE_STORAGE_KEY,
  loadCourseState,
  registerCoursePersistence
} from "./coursePersistence";
import { persistenceKey, type PreferenceStorage } from "./preferencePersistence";
import {
  persistenceErrorChanged,
  persistenceReducer,
  type PersistenceState
} from "./persistenceSlice";

const phrase = { id: "first", version: "1", musicXml: "<score/>" };
const lesson: CourseLesson = {
  id: "lesson-01",
  number: 1,
  title: "Lesson",
  goal: "Goal",
  stages: ["right", "both"],
  phrases: [phrase]
};
const selection = { lessonId: lesson.id, stage: "right" as const, phraseId: "first" };
const key = progressKey(lesson, "right", phrase);
function storageFixture(
  raw: string | null = null
): PreferenceStorage & { setItem: ReturnType<typeof vi.fn> } {
  let value = raw;
  return {
    getItem: () => value,
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    })
  };
}
function fixtureStore(storage: PreferenceStorage) {
  const loaded = loadCourseState(storage, [lesson]);
  const listener = createListenerMiddleware<CourseRoot & { persistence: PersistenceState }>();
  registerCoursePersistence(listener, storage);
  return configureStore({
    reducer: { course: courseReducer, persistence: persistenceReducer },
    preloadedState: { course: loaded.course, persistence: { errors: loaded.errors } },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listener.middleware)
  });
}

describe("course persistence", () => {
  it("restores review selection without bypassing progression or changing real saved marks", () => {
    const next: CourseLesson = { ...lesson, id: "next", number: 2 };
    const nextSelection = { ...selection, lessonId: next.id };
    const nextKey = progressKey(next, "right", phrase);
    const state = {
      ...initialCourseState,
      selection: nextSelection,
      progress: { [nextKey]: true },
      accessMode: "review"
    };
    const raw = JSON.stringify(state);
    const storage = storageFixture(raw);
    const review = loadCourseState(storage, [lesson, next], "review");
    expect(review.course).toMatchObject({ selection: nextSelection, progress: state.progress });
    expect(review.course).not.toHaveProperty("accessMode");
    expect(review.errors).toEqual({});
    expect(loadCourseState(storage, [lesson, next]).course).toMatchObject({
      selection: null,
      progress: state.progress
    });
    expect(loadCourseState(storage, [lesson, next], "progression").course.selection).toBeNull();
    expect(storage.getItem(COURSE_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not restore an unprepared or removed assignment during review", () => {
    const next: CourseLesson = { ...lesson, id: "next", number: 2 };
    const storage = storageFixture(
      JSON.stringify({
        ...initialCourseState,
        selection: { ...selection, lessonId: next.id },
        progress: { [key]: true }
      })
    );
    for (const unavailable of [
      { ...next, phrases: [] },
      { ...next, stages: [] },
      { ...next, phrases: [{ ...phrase, id: "replaced" }] }
    ]) {
      expect(loadCourseState(storage, [lesson, unavailable], "review").course).toMatchObject({
        selection: null,
        progress: { [key]: true }
      });
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(["staff", "tabs"] as const)(
    "keeps the first enabled %s reader on top after reload",
    (first) => {
      const storage = storageFixture(),
        store = fixtureStore(storage);
      store.dispatch(courseActions.viewChanged("hidden"));
      store.dispatch(courseActions.viewChanged(first));
      store.dispatch(courseActions.viewChanged("both"));
      expect(store.getState().course).toMatchObject({ view: "both", topView: first });
      const restored = fixtureStore(storage);
      expect(restored.getState().course).toMatchObject({ view: "both", topView: first });
      const remaining = first === "staff" ? "tabs" : "staff";
      restored.dispatch(courseActions.viewChanged(remaining));
      restored.dispatch(courseActions.viewChanged("both"));
      expect(loadCourseState(storage, [lesson]).course).toMatchObject({
        view: "both",
        topView: remaining
      });
    }
  );

  it.each([
    ["staff", "staff"],
    ["tabs", "tabs"],
    ["both", "tabs"],
    ["hidden", "tabs"]
  ] as const)("loads legacy %s views with a stable %s-first order", (view, topView) => {
    const { topView: _topView, ...legacy } = initialCourseState;
    const storage = storageFixture(JSON.stringify({ ...legacy, view }));
    expect(loadCourseState(storage, [lesson]).course).toMatchObject({ view, topView });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("restores both score readers without changing the assignment or progress", () => {
    const storage = storageFixture(),
      store = fixtureStore(storage);
    store.dispatch(courseActions.selectionChosen(selection));
    store.dispatch(courseActions.phraseCredited(key));
    store.dispatch(courseActions.viewChanged("both"));
    expect(loadCourseState(storage, [lesson]).course).toMatchObject({
      view: "both",
      selection,
      progress: { [key]: true }
    });
  });

  it("round-trips a hidden course view without losing its selection or credits", () => {
    const storage = storageFixture(),
      store = fixtureStore(storage);
    store.dispatch(courseActions.selectionChosen(selection));
    store.dispatch(courseActions.phraseCredited(key));
    store.dispatch(courseActions.viewChanged("hidden"));
    expect(loadCourseState(storage, [lesson]).course).toMatchObject({
      view: "hidden",
      selection,
      progress: { [key]: true }
    });
  });

  it("preserves blocked downstream credits while dropping the restored selection", () => {
    const predecessor: CourseLesson = {
      ...lesson,
      finalTask: { stage: "both", phraseId: phrase.id }
    };
    const next = { ...lesson, id: "next", number: 2 };
    const nextSelection = { ...selection, lessonId: next.id };
    const downstreamKey = progressKey(next, "right", phrase);
    const state = {
      ...initialCourseState,
      selection: nextSelection,
      progress: { [downstreamKey]: true }
    };
    const storage = storageFixture(JSON.stringify(state));
    expect(loadCourseState(storage, [predecessor, next]).course).toMatchObject({
      selection: null,
      progress: state.progress
    });
    const finalKey = progressKey(predecessor, "both", phrase);
    const unlocked = storageFixture(
      JSON.stringify({ ...state, progress: { ...state.progress, [finalKey]: true } })
    );
    expect(loadCourseState(unlocked, [predecessor, next]).course.selection).toEqual(nextSelection);
    const revised = { ...predecessor, phrases: [{ ...phrase, version: "2" }] };
    expect(loadCourseState(unlocked, [revised, next]).course.selection).toBeNull();
    expect(loadCourseState(unlocked, [revised, next]).course.progress).toEqual({
      ...state.progress,
      [finalKey]: true
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(unlocked.setItem).not.toHaveBeenCalled();
  });
  it("does not write default state, unrelated actions, or repeated credits", () => {
    const storage = storageFixture(),
      store = fixtureStore(storage);
    store.dispatch({ type: "unrelated/action" });
    store.dispatch(courseActions.viewChanged("tabs"));
    store.dispatch(courseActions.accompanimentChanged(false));
    store.dispatch(courseActions.listenOnlyChanged(false));
    expect(storage.setItem).not.toHaveBeenCalled();
    store.dispatch(courseActions.phraseCredited(key));
    store.dispatch(courseActions.phraseCredited(key));
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("restores progress, available selection, tabs preference and accompaniment independently", () => {
    const storage = storageFixture(),
      store = fixtureStore(storage);
    store.dispatch(courseActions.selectionChosen(selection));
    store.dispatch(courseActions.phraseCredited(key));
    store.dispatch(courseActions.viewChanged("staff"));
    store.dispatch(courseActions.accompanimentChanged(true));
    store.dispatch(courseActions.listenOnlyChanged(true));
    const expected: CourseState = {
      progress: { [key]: true },
      selection,
      view: "staff",
      topView: "staff",
      accompaniment: true,
      listenOnly: true
    };
    expect(loadCourseState(storage, [lesson]).course).toEqual(expected);
    store.dispatch({ type: "song/otherSongChosen" });
    expect(store.getState().course.selection).toEqual(selection);
    expect(storage.setItem).toHaveBeenCalledTimes(5);
  });

  it("loads legacy settings with listening disabled without dropping progress", () => {
    const storage = storageFixture(
      JSON.stringify({ progress: { [key]: true }, selection, view: "staff", accompaniment: true })
    );
    expect(loadCourseState(storage, [lesson])).toEqual({
      course: {
        progress: { [key]: true },
        selection,
        view: "staff",
        topView: "staff",
        accompaniment: true,
        listenOnly: false
      },
      errors: {}
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("retains explicit listening while changing the selected task", () => {
    const storage = storageFixture(),
      store = fixtureStore(storage);
    store.dispatch(courseActions.listenOnlyChanged(true));
    store.dispatch(courseActions.selectionChosen({ ...selection, stage: "both" }));
    expect(loadCourseState(storage, [lesson]).course).toMatchObject({
      listenOnly: true,
      selection: { ...selection, stage: "both" }
    });
  });

  it("retains unavailable lessons' credits but only restores an available phrase selection", () => {
    const storage = storageFixture(
      JSON.stringify({ ...initialCourseState, progress: { [key]: true }, selection })
    );
    const loaded = loadCourseState(storage, [{ ...lesson, phrases: [] }]);
    expect(loaded.course.progress).toEqual({ [key]: true });
    expect(loaded.course.selection).toBeNull();
    expect(loaded.errors).toEqual({});
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    "not json",
    "null",
    "[]",
    JSON.stringify({ ...initialCourseState, listenOnly: "true" }),
    JSON.stringify({ ...initialCourseState, listenOnly: null }),
    JSON.stringify({ ...initialCourseState, progress: { bogus: true } }),
    JSON.stringify({
      ...initialCourseState,
      selection: { lessonId: "id", stage: "bogus", phraseId: "phrase" }
    })
  ])("reports corrupt state and keeps defaults without overwriting it: %s", (raw) => {
    const storage = storageFixture(raw),
      loaded = loadCourseState(storage, [lesson]);
    expect(loaded.course).toEqual(initialCourseState);
    expect(loaded.errors[persistenceKey(COURSE_STORAGE_KEY, "read")]).toBe("invalid");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reports unavailable reads and keeps defaults", () => {
    const storage = {
      getItem: () => {
        throw new Error("Unavailable");
      },
      setItem: vi.fn()
    };
    const loaded = loadCourseState(storage, [lesson]);
    expect(loaded.course).toEqual(initialCourseState);
    expect(loaded.errors[persistenceKey(COURSE_STORAGE_KEY, "read")]).toBe("unavailable");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps in-memory progress during quota errors and clears only its own error on recovery", () => {
    const storage = storageFixture(),
      store = fixtureStore(storage);
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Quota exceeded");
    });
    store.dispatch(persistenceErrorChanged({ key: "other", error: "aborted" }));
    store.dispatch(courseActions.phraseCredited(key));
    expect(store.getState().course.progress[key]).toBe(true);
    expect(store.getState().persistence.errors).toEqual({
      other: "aborted",
      [persistenceKey(COURSE_STORAGE_KEY, "write")]: "unavailable"
    });
    store.dispatch(courseActions.accompanimentChanged(true));
    expect(store.getState().persistence.errors).toEqual({ other: "aborted" });
    expect(loadCourseState(storage, [lesson]).course.progress[key]).toBe(true);
  });

  it("keeps explicit listening in memory after a write error and saves it on recovery", () => {
    const storage = storageFixture(),
      store = fixtureStore(storage);
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Quota exceeded");
    });
    store.dispatch(courseActions.listenOnlyChanged(true));
    expect(store.getState().course.listenOnly).toBe(true);
    expect(store.getState().persistence.errors[persistenceKey(COURSE_STORAGE_KEY, "write")]).toBe(
      "unavailable"
    );
    store.dispatch(courseActions.viewChanged("staff"));
    expect(loadCourseState(storage, [lesson]).course.listenOnly).toBe(true);
    expect(store.getState().persistence.errors).toEqual({});
  });
});
