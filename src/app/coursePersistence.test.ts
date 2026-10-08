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
  it("does not write default state, unrelated actions, or repeated credits", () => {
    const storage = storageFixture(),
      store = fixtureStore(storage);
    store.dispatch({ type: "unrelated/action" });
    store.dispatch(courseActions.viewChanged("tabs"));
    store.dispatch(courseActions.accompanimentChanged(false));
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
    const expected: CourseState = {
      progress: { [key]: true },
      selection,
      view: "staff",
      accompaniment: true
    };
    expect(loadCourseState(storage, [lesson]).course).toEqual(expected);
    store.dispatch({ type: "song/otherSongChosen" });
    expect(store.getState().course.selection).toEqual(selection);
    expect(storage.setItem).toHaveBeenCalledTimes(4);
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
});
