import type {
  CourseAccessMode,
  CourseLesson,
  CourseSelection,
  CourseStage,
  CourseRunResult
} from "../course/model";
import {
  canCreditCourseRun,
  firstIncompleteSelection,
  lessonUnlocked,
  phraseCompleted,
  progressKey,
  resolveSelection,
  runContext,
  stagePhrases
} from "../course/model";
import type { Song } from "../song/song";
import type { AppStore } from "./store";
import { courseActions, type CourseState } from "./courseSlice";
import { coursePhraseSong } from "./courseCatalog";
import { selectSongKey } from "./songSelectors";

export function courseSource(lesson: CourseLesson, selection: CourseSelection): string {
  return `course:${runContext(lesson, selection) ?? ""}`;
}

export function activeCourse(
  state: { course: CourseState; song: { librarySource: string | null } },
  lessons: readonly CourseLesson[],
  accessMode: CourseAccessMode = "progression"
) {
  const resolved = resolveSelection(lessons, state.course.selection);
  return resolved &&
    lessonUnlocked(resolved.lesson, lessons, state.course.progress, accessMode) &&
    state.song.librarySource === courseSource(resolved.lesson, resolved.selection)
    ? resolved
    : null;
}

/** Commands bind results to the current immutable task, never to a closed take. */
export function createCourseController(
  store: AppStore,
  lessons: readonly CourseLesson[],
  showSong: (song: Song, source: string | null) => void,
  accessMode: CourseAccessMode = "progression"
) {
  const open = (selection: CourseSelection) => {
    const resolved = resolveSelection(lessons, selection);
    if (
      !resolved ||
      !lessonUnlocked(resolved.lesson, lessons, store.getState().course.progress, accessMode)
    )
      return;
    const song = coursePhraseSong(resolved.lesson, resolved.phrase);
    store.dispatch(courseActions.selectionChosen(selection));
    showSong(song, courseSource(resolved.lesson, selection));
  };
  return {
    open,
    continueLesson: (lessonId: string) => {
      const lesson = lessons.find((candidate) => candidate.id === lessonId);
      const selection =
        lesson && firstIncompleteSelection(lesson, store.getState().course.progress);
      if (selection) open(selection);
    },
    chooseStage: (lessonId: string, stage: CourseStage) => {
      const lesson = lessons.find((candidate) => candidate.id === lessonId);
      if (!lesson?.stages.includes(stage)) return;
      const state = store.getState();
      if (!lessonUnlocked(lesson, lessons, state.course.progress, accessMode)) return;
      const active = activeCourse(state, lessons, accessMode);
      const current = active?.lesson.id === lessonId ? active : null;
      if (current?.selection.stage === stage) return;
      const phrases = stagePhrases(lesson, stage);
      const phrase =
        (current && phrases.find((candidate) => candidate.id === current.phrase.id)) ??
        phrases.find(
          (candidate) => !phraseCompleted(lesson, stage, candidate, state.course.progress)
        ) ??
        phrases[0];
      if (phrase) open({ lessonId, stage, phraseId: phrase.id });
    },
    finish: (result: CourseRunResult) => {
      const state = store.getState();
      const current = activeCourse(state, lessons, accessMode);
      if (!current || state.preferences.word.enabled) return;
      if (!canCreditCourseRun(current.lesson, current.selection, result, selectSongKey(state)))
        return;
      store.dispatch(
        courseActions.phraseCredited(
          progressKey(current.lesson, current.selection.stage, current.phrase)
        )
      );
    }
  };
}
