import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { shallowEqual } from "react-redux";
import { useAppSelector } from "./storeHooks";
import { completedPathSteps } from "../learningPath/evidence";
import { browserGuidedStorage, createGuidedJournal, GUIDED_STORAGE_PREFIX } from "./guidedJournal";
const Context = createContext<{
  completed: readonly string[];
  error: boolean;
  mark: (id: string) => void;
} | null>(null);
export function GuidedProgressProvider({ children }: { readonly children: ReactNode }) {
  const [journal] = useState(() => createGuidedJournal(browserGuidedStorage()));
  const snapshot = useSyncExternalStore(
    journal.subscribe,
    journal.getSnapshot,
    journal.getSnapshot
  );
  const histories = useAppSelector(
    (s) => ({
      right: s.reading.history,
      left: s.reading.bass.history,
      intervals: s.reading.intervals.history,
      rhythm: s.reading.rhythm.history,
      twoHand: s.reading.coordination.history,
      heldBass: s.reading.heldBass.history,
      independent: s.reading.independentRhythm.history,
      music: s.reading.music.history
    }),
    shallowEqual
  );
  const evidence = useMemo(() => completedPathSteps(histories), [histories]);
  useEffect(() => {
    journal.record(evidence);
  }, [journal, evidence]);
  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(GUIDED_STORAGE_PREFIX)) journal.refresh();
    };
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
    };
  }, [journal]);
  const completed = useMemo(
    () => [...new Set([...snapshot.completed, ...evidence])],
    [snapshot.completed, evidence]
  );
  const mark = (id: string) => {
    journal.record([id]);
  };
  return (
    <Context.Provider value={{ completed, error: snapshot.error, mark }}>
      {children}
    </Context.Provider>
  );
}
export function useGuidedProgress() {
  const value = useContext(Context);
  if (!value) throw new Error("GuidedProgressProvider is missing");
  return value;
}
