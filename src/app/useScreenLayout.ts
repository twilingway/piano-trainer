import { useState } from "react";

import {
  DEFAULT_SCREEN_LAYOUT,
  loadScreenLayouts,
  normalizeLayout,
  saveScreenLayouts
} from "./screenLayout";
import type { LayoutMode, ScreenLayout } from "./screenLayout";

/** The current mode's layout, kept across reloads apart from the other mode's. */
export function useScreenLayout(mode: LayoutMode) {
  const [layouts, setLayouts] = useState(loadScreenLayouts);
  // A drag sends changes faster than renders: each builds on the stored layout, not a stale one.
  const store = (layout: (previous: ScreenLayout) => ScreenLayout) => {
    setLayouts((previous) => {
      const next = { ...previous, [mode]: layout(previous[mode]) };
      saveScreenLayouts(next);
      return next;
    });
  };
  return {
    layout: layouts[mode],
    updateLayout: (change: Partial<ScreenLayout>) => {
      store((previous) => normalizeLayout({ ...previous, ...change }));
    },
    resetLayout: () => {
      store(() => DEFAULT_SCREEN_LAYOUT);
    }
  };
}
