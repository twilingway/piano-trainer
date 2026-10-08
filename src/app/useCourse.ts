import { useMemo } from "react";
import type { Song } from "../song/song";
import { resolveSelection, runContext } from "../course/model";
import { COURSE_LESSONS } from "./courseCatalog";
import { activeCourse, createCourseController } from "./courseController";
import { courseActions } from "./courseSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";

export function useCourse(showSong: (song: Song, source: string | null) => void) {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const saved = useAppSelector((state) => state.course);
  const source = useAppSelector((state) => state.song.librarySource);
  const word = useAppSelector((state) => state.preferences.word.enabled);
  const controller = useMemo(
    () => createCourseController(store, COURSE_LESSONS, showSong),
    [store, showSong]
  );
  const selected = useMemo(
    () => resolveSelection(COURSE_LESSONS, saved.selection),
    [saved.selection]
  );
  const active =
    selected &&
    source === `course:${runContext(selected.lesson, selected.selection) ?? ""}` &&
    !word
      ? selected
      : null;
  const chooseStage = (stage: "right" | "left" | "both") => {
    const current = activeCourse(store.getState(), COURSE_LESSONS);
    if (current) controller.chooseStage(current.lesson.id, stage);
  };
  return {
    active,
    saved,
    controller,
    practice: active
      ? {
          stage: active.selection.stage,
          context: runContext(active.lesson, active.selection) ?? "",
          accompaniment: saved.accompaniment,
          onStage: chooseStage,
          onAccompaniment: (value: boolean) => {
            dispatch(courseActions.accompanimentChanged(value));
          }
        }
      : undefined,
    setView: (view: "tabs" | "staff") => {
      dispatch(courseActions.viewChanged(view));
    }
  };
}
