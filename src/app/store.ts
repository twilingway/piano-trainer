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
  const preloadedState = loadPreferences(storage);
  const listener = createPersistenceListener();
  registerPreferencePersistence(listener, storage);
  return configureStore({
    reducer: { preferences: preferencesReducer, persistence: persistenceReducer },
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listener.middleware)
  });
}
export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
