import { BEGINNER_STAGES, validBeginnerSelection, type BeginnerSelection } from "./catalog";
import { validBeginnerResult, type BeginnerResult } from "./resultValidation";
export interface BeginnerProgress {
  readonly schemaVersion: 1;
  readonly selection: BeginnerSelection | null;
  readonly history: readonly BeginnerResult[];
  readonly completed: readonly string[];
}
export function emptyBeginnerProgress(): BeginnerProgress {
  return { schemaVersion: 1, selection: null, history: [], completed: [] };
}
export function futureBeginnerProgress(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    typeof value.schemaVersion === "number" &&
    value.schemaVersion > 1
  );
}
export function readBeginnerProgress(value: unknown): BeginnerProgress {
  const empty = emptyBeginnerProgress();
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1
  )
    return empty;
  const v = value as BeginnerProgress;
  const history = Array.isArray(v.history) ? v.history.filter(validBeginnerResult) : [];
  const completed = new Set<string>();
  for (const entry of history)
    if (entry.selection.phase === "independent") completed.add(entry.selection.stageId);
  return {
    schemaVersion: 1,
    selection: validBeginnerSelection(v.selection) ? v.selection : null,
    history,
    completed: [...completed]
  };
}
export function mergeBeginnerProgress(
  saved: unknown,
  local: BeginnerProgress,
  selectionChanged = true
): BeginnerProgress {
  if (futureBeginnerProgress(saved)) throw new Error("Unsupported beginner schema");
  const previous = readBeginnerProgress(saved);
  const history = [
    ...new Map(
      [...previous.history, ...local.history]
        .filter(validBeginnerResult)
        .map((r) => [r.result.runId ?? r.result.id, r])
    ).values()
  ].sort((a, b) => a.result.createdAt - b.result.createdAt);
  const proofs = new Map(
    history.filter((r) => r.selection.phase === "independent").map((r) => [r.selection.stageId, r])
  );
  const retained = new Set([...history.slice(-(96 - proofs.size)), ...proofs.values()]);
  const bounded = history.filter((r) => retained.has(r));
  return readBeginnerProgress({
    schemaVersion: 1,
    selection: selectionChanged ? local.selection : previous.selection,
    history: bounded,
    completed: [...new Set([...previous.completed, ...local.completed])]
  });
}
export function nextBeginnerStage(completed: readonly string[]): string | null {
  return BEGINNER_STAGES.find((stage) => !completed.includes(stage.id))?.id ?? null;
}
