import { useState } from "react";

import { DEFAULT_SCREEN_LAYOUTS, startEditing } from "./screenLayout";
import type { LayoutMode, ScreenLayout } from "./screenLayout";
import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";

/** The current mode's layout, kept across reloads apart from the other mode's. */
export function useScreenLayout(mode: LayoutMode) {
  const layout = useAppSelector((state) => state.preferences.layouts[mode]);
  const dispatch = useAppDispatch();
  // Off the edit mode the layout stays, but nothing on the screen drags or shows its handle.
  const [editing, setEditing] = useState(startEditing);
  const defaults = DEFAULT_SCREEN_LAYOUTS[mode];
  return {
    layout,
    editing,
    toggleEditing: () => {
      setEditing((on) => !on);
    },
    /** Something differs from where reset would put it. */
    moved: (Object.keys(defaults) as (keyof ScreenLayout)[]).some(
      (key) => layout[key] !== defaults[key]
    ),
    updateLayout: (change: Partial<ScreenLayout>) => {
      dispatch(preferencesActions.layoutChanged({ mode, change }));
    },
    resetLayout: () => {
      dispatch(preferencesActions.layoutReset(mode));
    }
  };
}
