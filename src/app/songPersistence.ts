import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import type { Finger } from "../fingering/fingering";
import type { Song } from "../song/song";
import { FIRST_LESSON, LESSONS, lessonSong } from "./lessons";
import type { PlayerPrefs } from "./playerPrefs";
import {
  browserPreferenceStorage,
  persistenceKey,
  type PreferenceRoot,
  type PreferenceStorage
} from "./preferencePersistence";
import { persistenceErrorChanged } from "./persistenceSlice";
import { preferencesActions } from "./preferencesSlice";
import { selectSongKey, type SongRoot } from "./songSelectors";
import { songActions, type SongState } from "./songSlice";

export function readOverrides(
  key: string,
  storage: PreferenceStorage = browserPreferenceStorage()
) {
  let error: string | null = null;
  const overrides: Record<string, Finger> = {};
  try {
    const text = storage.getItem(key);
    const raw: unknown = text === null ? [] : (JSON.parse(text) as unknown);
    if (!Array.isArray(raw)) error = "invalid";
    else
      for (const entry of raw) {
        if (
          !Array.isArray(entry) ||
          entry.length !== 2 ||
          typeof entry[0] !== "string" ||
          typeof entry[1] !== "number" ||
          !Number.isInteger(entry[1]) ||
          entry[1] < 1 ||
          entry[1] > 5
        ) {
          error = "invalid";
          continue;
        }
        Object.defineProperty(overrides, entry[0], {
          value: entry[1],
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
  } catch {
    error = "unavailable";
  }
  return { overrides, error };
}
export function loadSongState(player: PlayerPrefs): SongState {
  const kept = player.lesson;
  const exercise = kept && LESSONS.find((item) => item.id === kept.exerciseId);
  const lesson =
    kept && exercise?.levels.some((level) => level.id === kept.levelId) ? kept : FIRST_LESSON;
  return {
    sourceSong: lessonSong(lesson),
    lesson,
    librarySource: player.librarySource,
    transpose: 0,
    octave: 0,
    simplified: true,
    revision: 0,
    overridesByKey: {}
  };
}
/** Initial correction hydration is read-only and runs before the Provider mounts. */
export function hydrateSongOverrides<State extends SongRoot & PreferenceRoot>(
  state: State,
  storage: PreferenceStorage
) {
  const key = selectSongKey(state);
  const { overrides, error } = readOverrides(key, storage);
  state.song.overridesByKey[key] = overrides;
  if (error !== null) state.persistence.errors[persistenceKey(key, "read")] = error;
  return state;
}
export function loadOverrides(song: Song): Map<string, Finger> {
  return new Map(
    Object.entries(
      readOverrides(
        `fingering:${song.title}${song.simplified ? ":simplified" : ""}${song.asWritten ? ":written" : ""}:${String(song.notes.length)}`
      ).overrides
    )
  );
}
export function registerSongPersistence<State extends SongRoot & PreferenceRoot>(
  listener: ListenerMiddlewareInstance<State>,
  storage: PreferenceStorage = browserPreferenceStorage()
) {
  return listener.startListening({
    predicate: (_action, current, previous) =>
      current.song !== previous.song ||
      current.preferences.player.notesAsWritten !== previous.preferences.player.notesAsWritten,
    effect: (action, api) => {
      const previous = api.getOriginalState(),
        current = api.getState();
      if (songActions.songOpened.match(action) || songActions.librarySourceChanged.match(action)) {
        api.dispatch(
          preferencesActions.playerChanged({
            ...(current.song.lesson
              ? { lesson: current.song.lesson, librarySource: null }
              : { librarySource: current.song.librarySource })
          })
        );
      }
      const key = selectSongKey(current);
      if (selectSongKey(previous) !== key && current.song.overridesByKey[key] === undefined) {
        const { overrides, error } = readOverrides(key, storage);
        api.dispatch(songActions.overridesLoaded({ key, overrides }));
        api.dispatch(persistenceErrorChanged({ key: persistenceKey(key, "read"), error }));
      }
      if (!songActions.fingerChanged.match(action) && !songActions.fingersReset.match(action))
        return;
      const changedKey = songActions.fingerChanged.match(action)
        ? action.payload.key
        : action.payload;
      const before = previous.song.overridesByKey[changedKey] ?? {},
        after = current.song.overridesByKey[changedKey] ?? {};
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      try {
        storage.setItem(changedKey, JSON.stringify(Object.entries(after)));
        api.dispatch(
          persistenceErrorChanged({ key: persistenceKey(changedKey, "write"), error: null })
        );
      } catch {
        api.dispatch(
          persistenceErrorChanged({
            key: persistenceKey(changedKey, "write"),
            error: "unavailable"
          })
        );
      }
    }
  });
}
