import { validateIntegratedEvidence } from "./evidenceIntegrated";
import type { IntegratedSavedResult } from "./integrated";
import { INTEGRATED_PHASE_IDS } from "./integratedPlan";
import type { IntegratedProgress } from "./progress";
import {
  finite,
  integer,
  oneOf,
  plainMusicJson,
  record,
  SOURCES,
  text,
  validMusicHelp
} from "./progressValidation";

/** IDs and minimum evidence are the fixed v1 plan's child contract, not regenerated score data. */
function activities(planId: string) {
  const rows = [
    ...[60, 62, 64, 65, 67].map(
      (pitch) => ["find-keys", `key-${String(pitch)}`, "keyboard", 1, false] as const
    ),
    ["read-melody", "reading", "reading", 16, false] as const,
    ["heard-rhythm", "rhythm", "rhythm", 4, true] as const,
    ["heard-intervals", "interval-4", "interval", 2, true] as const,
    ["heard-intervals", "interval-7", "interval", 2, true] as const,
    ...[60, 65, 67].map(
      (root) => ["build-chords", `chord-${String(root)}`, "harmony", 1, false] as const
    ),
    ["play-piece", "piece", "coordination", 20, false] as const,
    ["final-control", "final-reading", "reading", 20, false] as const,
    ["final-control", "final-rhythm", "rhythm", 4, true] as const,
    ["final-control", "final-harmony", "harmony", 4, false] as const
  ];
  return rows.map(([phaseId, suffix, skill, units, auditory]) => ({
    id: `${planId}-${suffix}`,
    phaseId,
    skill,
    units,
    auditory
  }));
}
const ERROR_KEYS = {
  keyboard: ["wrongKeys"],
  reading: ["pitches", "timing", "groups"],
  rhythm: ["onsets", "durations", "missing", "extra"],
  interval: ["recognition", "pitches"],
  harmony: ["pitches", "bass", "synchrony"],
  coordination: ["left", "right", "timing"]
} as const;
/** Only a recipe and completed reference boundaries survive reload; live answers have no fields. */
export function validateIntegratedProgress(value: unknown): value is IntegratedProgress {
  if (!plainMusicJson(value) || !record(value) || !record(value.plan) || !record(value.state))
    return false;
  if (
    Object.keys(value.plan).some((key) => !["seed", "version", "theme", "bpm"].includes(key)) ||
    Object.keys(value.state).some(
      (key) =>
        ![
          "lessonId",
          "planId",
          "activitySeeds",
          "generation",
          "sequence",
          "selectedPhase",
          "selectedActivityId",
          "resumeBoundary",
          "completedPhases",
          "results"
        ].includes(key)
    )
  )
    return false;
  const plan = value.plan,
    state = value.state;
  if (
    plan.theme !== "c-major" ||
    plan.version !== 1 ||
    !integer(plan.seed, 0, 0xffffffff) ||
    !finite(plan.bpm, 30, 240) ||
    state.planId !== `integrated-v1-c-major-${String(plan.seed)}-${String(plan.bpm)}` ||
    !text(state.lessonId) ||
    !integer(state.generation, 1) ||
    !integer(state.sequence, 1) ||
    !oneOf(state.selectedPhase, INTEGRATED_PHASE_IDS) ||
    !text(state.selectedActivityId) ||
    !oneOf(state.resumeBoundary, ["preparation", "child-result", "phase-result"]) ||
    !record(state.activitySeeds) ||
    !Array.isArray(state.completedPhases) ||
    state.completedPhases.length > 7 ||
    new Set(state.completedPhases).size !== state.completedPhases.length ||
    !state.completedPhases.every((phase) => oneOf(phase, INTEGRATED_PHASE_IDS)) ||
    !Array.isArray(state.results) ||
    state.results.length > 512
  )
    return false;
  const children = activities(state.planId);
  const selected = children.find((activity) => activity.id === state.selectedActivityId);
  if (!selected || selected.phaseId !== state.selectedPhase) return false;
  const novelIds = children
    .filter(
      (activity) => activity.phaseId === "read-melody" || activity.phaseId === "final-control"
    )
    .map((activity) => activity.id);
  if (
    !Object.entries(state.activitySeeds).every(
      ([id, seed]) => novelIds.includes(id) && integer(seed, 0, 0xffffffff)
    )
  )
    return false;
  const runs = new Set<string>(),
    ids = new Set<string>();
  const valid = state.results.every((result) => {
    if (
      !record(result) ||
      !text(result.activityId) ||
      !text(result.resultId) ||
      !text(result.runId) ||
      !text(result.presentationId) ||
      runs.has(result.runId) ||
      ids.has(result.resultId) ||
      !integer(result.generation, 1, state.generation as number) ||
      result.status !== "completed" ||
      !oneOf(result.source, SOURCES) ||
      !oneOf(result.purpose, ["training", "control"]) ||
      typeof result.auditoryVerified !== "boolean" ||
      typeof result.visualAlternative !== "boolean" ||
      !validMusicHelp(result.help) ||
      !record(result.errors)
    )
      return false;
    const child = children.find((activity) => activity.id === result.activityId);
    if (
      !child ||
      result.phaseId !== child.phaseId ||
      result.skill !== child.skill ||
      !integer(result.performedUnits, child.units, 512)
    )
      return false;
    const keys = ERROR_KEYS[child.skill];
    if (
      Object.keys(result.errors).length !== keys.length ||
      !keys.every((key) => integer((result.errors as Record<string, unknown>)[key], 0, 100000))
    )
      return false;
    if (child.phaseId !== "final-control" && result.purpose !== "training") return false;
    if (result.purpose === "control" && result.help.length > 0) return false;
    if (
      result.visualAlternative &&
      (!child.auditory || result.auditoryVerified || result.purpose !== "training")
    )
      return false;
    if (child.auditory && !result.visualAlternative && !result.auditoryVerified) return false;
    if (!child.auditory && result.auditoryVerified) return false;
    const prefix = `${state.lessonId as string}:${String(result.generation)}:`;
    const suffix = `:${child.id}:run`;
    if (
      !result.runId.startsWith(prefix) ||
      !result.runId.endsWith(suffix) ||
      result.presentationId !== result.runId.slice(0, -4) + ":presentation"
    )
      return false;
    const sequence = result.runId.slice(prefix.length, -suffix.length);
    if (!/^\d+$/.test(sequence) || !integer(Number(sequence), 1, state.sequence as number))
      return false;
    runs.add(result.runId);
    ids.add(result.resultId);
    return true;
  });
  if (
    !valid ||
    !validateIntegratedEvidence(state.results as IntegratedSavedResult[], {
      seed: plan.seed,
      version: plan.version,
      theme: plan.theme,
      bpm: plan.bpm
    })
  )
    return false;
  for (const phase of state.completedPhases) {
    if (
      children
        .filter((child) => child.phaseId === phase)
        .some(
          (child) =>
            !(state.results as Record<string, unknown>[]).some(
              (result) => result.activityId === child.id
            )
        )
    )
      return false;
  }
  const completedPhases = state.completedPhases;
  const selectedIndex = INTEGRATED_PHASE_IDS.indexOf(selected.phaseId);
  if (
    INTEGRATED_PHASE_IDS.slice(0, selectedIndex).some((phase) => !completedPhases.includes(phase))
  )
    return false;
  if (state.resumeBoundary === "phase-result" && !state.completedPhases.includes(selected.phaseId))
    return false;
  if (
    state.resumeBoundary === "child-result" &&
    !(state.results as Record<string, unknown>[]).some(
      (result) => result.activityId === selected.id
    )
  )
    return false;
  return true;
}
export function copyIntegratedProgress(value: IntegratedProgress): {
  plan: IntegratedProgress["plan"];
  state: IntegratedProgress["state"];
} {
  return JSON.parse(JSON.stringify(value)) as IntegratedProgress;
}
