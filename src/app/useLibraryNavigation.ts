import { useState } from "react";

export type LibraryWindowKind = "lessons" | "melodies";

/** Navigation changes presentation only; opening a window never selects a score. */
export function useLibraryNavigation(setLibraryOpen: (open: boolean) => void) {
  const [kind, setKind] = useState<LibraryWindowKind>("lessons");
  return {
    kind,
    setKind,
    open: (next: LibraryWindowKind) => {
      setKind(next);
      setLibraryOpen(true);
    }
  };
}
