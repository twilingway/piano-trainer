export type BeginnerPhase = "intro" | "guided" | "independent";
export interface BeginnerSelection {
  readonly stageId: string;
  readonly phase: BeginnerPhase;
  readonly seed: number;
}
export interface BeginnerStage {
  readonly id: string;
  readonly hand: "right" | "left";
  readonly count: number;
  readonly pitches: readonly number[];
  readonly targetCount: number;
  readonly title: string;
}
const TITLES = [
  "Одна до",
  "Добавляем ре",
  "Добавляем ми",
  "Добавляем фа",
  "Добавляем соль",
  "Добавляем ля",
  "Добавляем си",
  "До через октаву"
];
const OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12];
export const BEGINNER_STAGES: readonly BeginnerStage[] = (["right", "left"] as const).flatMap(
  (hand) =>
    TITLES.map((title, index) => ({
      id: `beginner-v1-${hand}-${String(index + 1)}`,
      hand,
      count: index + 1,
      pitches: OFFSETS.slice(0, index + 1).map((offset) => (hand === "right" ? 60 : 48) + offset),
      targetCount: index < 2 ? 6 : index < 4 ? 8 : 10,
      title
    }))
);
export function beginnerStage(id: string): BeginnerStage {
  const stage = BEGINNER_STAGES.find((stage) => stage.id === id);
  if (!stage) throw new RangeError("Unknown beginner stage");
  return stage;
}
export function validBeginnerSelection(value: unknown): value is BeginnerSelection {
  if (!value || typeof value !== "object") return false;
  const s = value as BeginnerSelection;
  return (
    BEGINNER_STAGES.some((stage) => stage.id === s.stageId) &&
    ["intro", "guided", "independent"].includes(s.phase) &&
    Number.isInteger(s.seed) &&
    s.seed >= 0 &&
    s.seed <= 0xffffffff
  );
}

export function beginnerDisplayRange(
  stage: BeginnerStage | null
): readonly [number, number] | undefined {
  if (!stage) return undefined;
  const low = stage.pitches[0] ?? 60;
  return [low, Math.min(low + 24, Math.max(low + 12, stage.pitches.at(-1) ?? low))];
}
