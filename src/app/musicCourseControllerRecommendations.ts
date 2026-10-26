import { integratedObservations, recommendIntegratedPhase } from "../musicLearning/integrated";
import type { IntegratedPhaseId, IntegratedSavedResult } from "../musicLearning/integrated";
import type { MusicCourseChoice } from "../ui/musicCourseTypes";
import type { MusicControllerState } from "./musicCourseControllerView";
import type { MusicPersistentState } from "./musicPersistence";

const PHASES = [
  "find-keys",
  "read-melody",
  "heard-rhythm",
  "heard-intervals",
  "build-chords",
  "play-piece"
] as const;
const LABELS: Record<(typeof PHASES)[number], { readonly repeat: string; readonly skill: string }> =
  {
    "find-keys": { repeat: "Повторить поиск клавиш", skill: "Поиск клавиш" },
    "read-melody": { repeat: "Повторить чтение мелодии", skill: "Чтение мелодии" },
    "heard-rhythm": { repeat: "Повторить ритм на слух", skill: "Ритм на слух" },
    "heard-intervals": { repeat: "Повторить интервалы на слух", skill: "Интервалы на слух" },
    "build-chords": { repeat: "Повторить построение аккордов", skill: "Построение аккордов" },
    "play-piece": { repeat: "Повторить игру двумя руками", skill: "Игра двумя руками" }
  };
/** Read deduplicated child references, never aggregate pseudo-observations or another source's skill. */
export function musicControllerRepeatChoices(
  state: MusicControllerState,
  saved: MusicPersistentState
): readonly MusicCourseChoice[] {
  const snapshot = state.lesson?.snapshot();
  if (!snapshot || !["result", "completed"].includes(state.status)) return [];
  const children = new Map<string, IntegratedSavedResult>();
  const histories = saved.history
    .filter((result) => result.course === "integrated")
    .toSorted((a, b) => a.completedAt - b.completedAt);
  const receipts = [
    ...histories.flatMap((result) => result.state.results),
    ...(saved.integrated?.state.results ?? []),
    ...snapshot.results
  ];
  for (const receipt of receipts)
    if (!children.has(receipt.runId)) children.set(receipt.runId, receipt);
  const recommended = recommendIntegratedPhase(
    integratedObservations([...children.values()]),
    saved.inputSource,
    snapshot.completedPhases,
    state.previousRecommendations
  );
  return PHASES.filter((phase, index) =>
    PHASES.slice(0, index).every((earlier) => snapshot.completedPhases.includes(earlier))
  ).map((phase) => ({
    value: `repeat-phase:${phase}`,
    labelKey:
      recommended.kind === "repeat" && recommended.phaseId === phase
        ? "Рекомендуем повторить: {skill}"
        : LABELS[phase].repeat,
    ...(recommended.kind === "repeat" && recommended.phaseId === phase
      ? { params: { skill: LABELS[phase].skill } }
      : {})
  }));
}
export function musicControllerRepeatPhase(value: string): IntegratedPhaseId | null {
  const phase = value.slice("repeat-phase:".length);
  return value.startsWith("repeat-phase:") && PHASES.some((id) => id === phase)
    ? (phase as IntegratedPhaseId)
    : null;
}
