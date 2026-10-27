import { musicChoice, musicRandom } from "./random";
import type { MusicNote } from "./types";

export type HarmonyTonePitchSet = "white" | "all";
export interface HarmonyToneRecipe {
  readonly version: 1;
  readonly pitchSet: HarmonyTonePitchSet;
  readonly root: number;
  readonly notationFifths: 0;
}
const WHITE_CLASSES = [0, 2, 4, 5, 7, 9, 11];
export function createHarmonyToneMaterial(
  seed: number,
  pitchSet: HarmonyTonePitchSet,
  selectedRoot: number
): {
  readonly toneRecipe: HarmonyToneRecipe;
  readonly notes: readonly MusicNote[];
  readonly interval: number;
} {
  const random = musicRandom(seed);
  const interval = musicChoice([1, 2], random);
  const root =
    pitchSet === "white"
      ? musicChoice(
          [60, 62, 64, 65, 67, 69, 71].filter((pitch) =>
            WHITE_CLASSES.includes((pitch + interval) % 12)
          ),
          random
        )
      : selectedRoot;
  return {
    toneRecipe: { version: 1, pitchSet, root, notationFifths: 0 },
    interval,
    notes: [root, root + interval].map((pitch, index) => ({
      pitch,
      startBeat: index,
      durationBeats: 1,
      hand: "right"
    }))
  };
}
/** Missing metadata remains legacy; present metadata must describe the saved notes exactly. */
export function validHarmonyToneRecipe(
  value: unknown,
  notes: readonly MusicNote[]
): value is HarmonyToneRecipe {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const recipe = value as Record<string, unknown>;
  const first = notes[0],
    second = notes[1];
  return (
    Object.keys(recipe).length === 4 &&
    recipe.version === 1 &&
    (recipe.pitchSet === "white" || recipe.pitchSet === "all") &&
    Number.isInteger(recipe.root) &&
    typeof recipe.root === "number" &&
    recipe.root >= 48 &&
    recipe.root <= 72 &&
    recipe.notationFifths === 0 &&
    notes.length === 2 &&
    !!first &&
    !!second &&
    first.pitch === recipe.root &&
    [1, 2].includes(second.pitch - first.pitch) &&
    notes.every(
      (note, index) =>
        note.startBeat === index &&
        note.durationBeats === 1 &&
        note.hand === "right" &&
        (recipe.pitchSet !== "white" || WHITE_CLASSES.includes(note.pitch % 12))
    )
  );
}
