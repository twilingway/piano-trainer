import type { CourseLesson, CourseSelection, CourseStage, CourseRunResult } from "../course/model";
import {
  canCreditCourseRun,
  firstIncompleteSelection,
  phraseCompleted,
  progressKey,
  resolveSelection,
  runContext,
  stagePhrases
} from "../course/model";
import type { Song } from "../song/song";
import type { AppStore } from "./store";
import { courseActions } from "./courseSlice";
import { coursePhraseSong } from "./courseCatalog";
import { selectSongKey } from "./songSelectors";

export function courseSource(lesson: CourseLesson, selection: CourseSelection): string {
  return `course:${runContext(lesson, selection) ?? ""}`;
}

export function activeCourse(
  state: ReturnType<AppStore["getState"]>,
  lessons: readonly CourseLesson[]
) {
  const resolved = resolveSelection(lessons, state.course.selection);
  return resolved && state.song.librarySource === courseSource(resolved.lesson, resolved.selection)
    ? resolved
    : null;
}

/** Commands bind results to the current immutable task, never to a closed take. */
export function createCourseController(
  store: AppStore,
  lessons: readonly CourseLesson[],
  showSong: (song: Song, source: string | null) => void
) {
  const open = (selection: CourseSelection) => {
    const resolved = resolveSelection(lessons, selection);
    if (!resolved) return;
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
      const progress = store.getState().course.progress;
      const phrases = stagePhrases(lesson, stage);
      const phrase =
        phrases.find((candidate) => !phraseCompleted(lesson, stage, candidate, progress)) ??
        phrases[0];
      if (phrase) open({ lessonId, stage, phraseId: phrase.id });
    },
    finish: (result: CourseRunResult) => {
      const state = store.getState();
      const current = activeCourse(state, lessons);
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
