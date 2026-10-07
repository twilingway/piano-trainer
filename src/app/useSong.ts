import { useCallback } from "react";
import type { RefObject, SetStateAction } from "react";
import type { Finger } from "../fingering/fingering";
import type { Song } from "../song/song";
import { lessonSong, type LessonChoice } from "./lessons";
import { preferencesActions } from "./preferencesSlice";
import { songActions } from "./songSlice";
import {
  selectBaseSong,
  selectOverrides,
  selectSong,
  selectSongKey,
  selectSourceKey
} from "./songSelectors";
import { useAppDispatch, useAppSelector, useAppStore } from "./storeHooks";
export { loadOverrides } from "./songPersistence";

/** Runtime commands operate on the application's single selected song. */
export function useSong(startFromRef: RefObject<number | null>) {
  const dispatch = useAppDispatch(),
    store = useAppStore();
  const lesson = useAppSelector((state) => state.song.lesson);
  const librarySource = useAppSelector((state) => state.song.librarySource);
  const transpose = useAppSelector((state) => state.song.transpose);
  const octave = useAppSelector((state) => state.song.octave);
  const simplified = useAppSelector((state) => state.song.simplified);
  const source = useAppSelector((state) => state.song.sourceSong.source);
  const asWritten = useAppSelector((state) => state.preferences.player.notesAsWritten);
  const sourceKey = useAppSelector(selectSourceKey),
    baseSong = useAppSelector(selectBaseSong);
  const song = useAppSelector(selectSong),
    songKey = useAppSelector(selectSongKey),
    overrides = useAppSelector(selectOverrides);
  const showSong = useCallback(
    (loaded: Song, librarySource: string | null) => {
      startFromRef.current = null;
      dispatch(songActions.songOpened({ song: loaded, lesson: null, librarySource }));
    },
    [dispatch, startFromRef]
  );
  const openLesson = useCallback(
    (choice: LessonChoice) => {
      dispatch(songActions.beginSongSelection());
      const loaded = lessonSong(choice);
      startFromRef.current = null;
      dispatch(songActions.songOpened({ song: loaded, lesson: choice, librarySource: null }));
    },
    [dispatch, startFromRef]
  );
  const resetFingers = useCallback(() => {
    dispatch(songActions.fingersReset(selectSongKey(store.getState())));
  }, [dispatch, store]);
  const cycleFinger = useCallback(
    (noteId: string) => {
      const current = store.getState();
      const finger = selectSong(current).notes.find((note) => note.id === noteId)?.finger ?? 1;
      dispatch(
        songActions.fingerChanged({
          key: selectSongKey(current),
          noteId,
          finger: ((finger % 5) + 1) as Finger
        })
      );
    },
    [dispatch, store]
  );
  return {
    lesson,
    librarySource,
    setLibrarySource: (source: string | null) => {
      dispatch(songActions.librarySourceChanged(source));
    },
    sourceKey,
    transpose,
    setTranspose: (value: SetStateAction<number>) => {
      dispatch(
        songActions.transposeChanged(
          typeof value === "function" ? value(store.getState().song.transpose) : value
        )
      );
    },
    octave,
    setOctave: (value: SetStateAction<number>) => {
      dispatch(
        songActions.octaveChanged(
          typeof value === "function" ? value(store.getState().song.octave) : value
        )
      );
    },
    arrangement:
      source === "midi"
        ? {
            simplified,
            onSimplified: (value: boolean) => {
              dispatch(songActions.simplifiedChanged(value));
            },
            asWritten,
            onAsWritten: (value: boolean) => {
              dispatch(preferencesActions.playerChanged({ notesAsWritten: value }));
            }
          }
        : undefined,
    baseSong,
    song,
    songKey,
    overrides,
    resetFingers,
    cycleFinger,
    showSong,
    openLesson
  };
}
