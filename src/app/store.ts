import { practiceReducer } from "./practiceSlice";
import { songReducer } from "./songSlice";
import { hydrateSongOverrides, loadSongState, registerSongPersistence } from "./songPersistence";
import type { SongRoot } from "./songSelectors";
import type { PreferenceRoot } from "./preferencePersistence";
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

export function createAppStore(options: { storage?: PreferenceStorage } = {}) {
  const storage = options.storage ?? browserPreferenceStorage();
  const loaded = loadPreferences(storage);
  const preloadedState = hydrateSongOverrides(
    { ...loaded, song: loadSongState(loaded.preferences.player) },
    storage
  );
  const listener = createPersistenceListener<PreferenceRoot & SongRoot>();
  registerPreferencePersistence(listener, storage);
  registerSongPersistence(listener, storage);
  return configureStore({
    reducer: {
      preferences: preferencesReducer,
      persistence: persistenceReducer,
      song: songReducer,
      practice: practiceReducer
    },
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listener.middleware)
  });
}
export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
