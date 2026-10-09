import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import {
  lessonUnlocked,
  resolveSelection,
  type CourseLesson,
  type CourseSelection
} from "../course/model";
import { initialCourseState, type CourseRoot, type CourseState } from "./courseSlice";
import {
  browserPreferenceStorage,
  persistenceKey,
  type PreferenceStorage
} from "./preferencePersistence";
import { persistenceErrorChanged, type PersistenceState } from "./persistenceSlice";

export const COURSE_STORAGE_KEY = "lesson-course-v1";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isStage = (value: unknown) => value === "right" || value === "left" || value === "both";

function isProgressKey(key: string): boolean {
  try {
    const value: unknown = JSON.parse(key);
    return (
      Array.isArray(value) &&
      value.length === 4 &&
      value.every((part: unknown) => typeof part === "string" && part.length > 0) &&
      isStage(value[1])
    );
  } catch {
    return false;
  }
}

function parseSelection(value: unknown): CourseSelection | null {
  return isRecord(value) &&
    typeof value.lessonId === "string" &&
    value.lessonId.length > 0 &&
    typeof value.phraseId === "string" &&
    value.phraseId.length > 0 &&
    (value.stage === "right" || value.stage === "left" || value.stage === "both")
    ? { lessonId: value.lessonId, phraseId: value.phraseId, stage: value.stage }
    : null;
}

/** Loading never writes defaults or removes unavailable local lessons' saved credits. */
export function loadCourseState(
  storage: PreferenceStorage = browserPreferenceStorage(),
  lessons: readonly CourseLesson[] = []
): { course: CourseState; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const fallback = () => ({ course: { ...initialCourseState, progress: {} }, errors });
  let raw: string | null;
  try {
    raw = storage.getItem(COURSE_STORAGE_KEY);
  } catch {
    errors[persistenceKey(COURSE_STORAGE_KEY, "read")] = "unavailable";
    return fallback();
  }
  if (raw === null) return fallback();
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    errors[persistenceKey(COURSE_STORAGE_KEY, "read")] = "invalid";
    return fallback();
  }
  if (
    !isRecord(value) ||
    !isRecord(value.progress) ||
    !Object.entries(value.progress).every(
      ([key, credit]) => credit === true && isProgressKey(key)
    ) ||
    (value.selection !== null && !parseSelection(value.selection)) ||
    (value.view !== "tabs" &&
      value.view !== "staff" &&
      value.view !== "both" &&
      value.view !== "hidden") ||
    (value.topView !== undefined && value.topView !== "tabs" && value.topView !== "staff") ||
    typeof value.accompaniment !== "boolean" ||
    (value.listenOnly !== undefined && typeof value.listenOnly !== "boolean")
  ) {
    errors[persistenceKey(COURSE_STORAGE_KEY, "read")] = "invalid";
    return fallback();
  }
  const selection = parseSelection(value.selection);
  const progress = Object.fromEntries(
    Object.keys(value.progress).map((key) => [key, true as const])
  );
  const resolved = resolveSelection(lessons, selection);
  return {
    course: {
      progress,
      selection:
        resolved && lessonUnlocked(resolved.lesson, lessons, progress) ? resolved.selection : null,
      view: value.view,
      topView: value.topView ?? (value.view === "staff" ? "staff" : "tabs"),
      accompaniment: value.accompaniment,
      listenOnly: value.listenOnly === true
    },
    errors
  };
}

export function registerCoursePersistence<
  State extends CourseRoot & { persistence: PersistenceState }
>(
  listener: ListenerMiddlewareInstance<State>,
  storage: PreferenceStorage = browserPreferenceStorage()
) {
  return listener.startListening({
    predicate: (_action, current, previous) => current.course !== previous.course,
    effect: (_action, api) => {
      const current = JSON.stringify(api.getState().course);
      if (current === JSON.stringify(api.getOriginalState().course)) return;
      const key = persistenceKey(COURSE_STORAGE_KEY, "write");
      try {
        storage.setItem(COURSE_STORAGE_KEY, current);
        api.dispatch(persistenceErrorChanged({ key, error: null }));
      } catch {
        api.dispatch(persistenceErrorChanged({ key, error: "unavailable" }));
      }
    }
  });
}
