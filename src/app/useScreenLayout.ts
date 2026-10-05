import { useState } from "react";

import {
  DEFAULT_SCREEN_LAYOUTS,
  loadScreenLayouts,
  normalizeLayout,
  saveScreenLayouts,
  startEditing
} from "./screenLayout";
import type { LayoutMode, ScreenLayout } from "./screenLayout";

/** The current mode's layout, kept across reloads apart from the other mode's. */
export function useScreenLayout(mode: LayoutMode) {
  const [layouts, setLayouts] = useState(loadScreenLayouts);
  // Off the edit mode the layout stays, but nothing on the screen drags or shows its handle.
  const [editing, setEditing] = useState(startEditing);
  // A drag sends changes faster than renders: each builds on the stored layout, not a stale one.
  const store = (layout: (previous: ScreenLayout) => ScreenLayout) => {
    setLayouts((previous) => {
      const next = { ...previous, [mode]: layout(previous[mode]) };
      saveScreenLayouts(next);
      return next;
    });
  };
  const layout = layouts[mode];
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
      store((previous) => normalizeLayout({ ...previous, ...change }, defaults));
    },
    resetLayout: () => {
      store(() => defaults);
    }
  };
}
