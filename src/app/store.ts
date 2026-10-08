import { practiceReducer } from "./practiceSlice";
import { libraryReducer } from "./librarySlice";
import { reviewReducer, type ReviewRoot } from "./reviewSlice";
import { registerReviewPersistence } from "./reviewPersistence";
import { songReducer } from "./songSlice";
import { hydrateSongOverrides, loadSongState, registerSongPersistence } from "./songPersistence";
import type { SongRoot } from "./songSelectors";
import type { PreferenceRoot } from "./preferencePersistence";
import { courseReducer, type CourseRoot } from "./courseSlice";
import { loadCourseState, registerCoursePersistence } from "./coursePersistence";
import { COURSE_LESSONS, coursePhraseSong } from "./courseCatalog";
import { courseSource } from "./courseController";
import { resolveSelection, type CourseLesson } from "../course/model";
import { configureStore } from "@reduxjs/toolkit";
import { preferencesReducer } from "./preferencesSlice";
import { persistenceReducer } from "./persistenceSlice";
import {
  browserPreferenceStorage,
  createPersistenceListener,
  loadPreferences,
  registerPreferencePersistence,
  type PreferenceStorage
} from "./preferencePersistence";

export function createAppStore(
  options: { storage?: PreferenceStorage; courseLessons?: readonly CourseLesson[] } = {}
) {
  const storage = options.storage ?? browserPreferenceStorage();
  const loaded = loadPreferences(storage);
  const courseLessons = options.courseLessons ?? COURSE_LESSONS;
  const course = loadCourseState(storage, courseLessons);
  Object.assign(loaded.persistence.errors, course.errors);
  const initialSong = loadSongState(loaded.preferences.player);
  if (initialSong.librarySource?.startsWith("course:")) {
    const resolved = resolveSelection(courseLessons, course.course.selection);
    initialSong.librarySource = resolved ? courseSource(resolved.lesson, resolved.selection) : null;
    if (resolved) {
      initialSong.sourceSong = coursePhraseSong(resolved.lesson, resolved.phrase);
      initialSong.lesson = null;
    }
  }
  const preloadedState = hydrateSongOverrides(
    { ...loaded, song: initialSong, course: course.course },
    storage
  );
  const listener = createPersistenceListener<PreferenceRoot & SongRoot & ReviewRoot & CourseRoot>();
  registerPreferencePersistence(listener, storage);
  registerSongPersistence(listener, storage);
  registerReviewPersistence(listener, storage);
  registerCoursePersistence(listener, storage);
  return configureStore({
    reducer: {
      preferences: preferencesReducer,
      persistence: persistenceReducer,
      song: songReducer,
      practice: practiceReducer,
      library: libraryReducer,
      review: reviewReducer,
      course: courseReducer
    },
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listener.middleware)
  });
}
export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
