import { normalizeReadingSeed } from "../reading/generator";
import { musicFingerprint } from "./material";
import type { MusicNote } from "./types";

export const MUSIC_NOVELTY_CANDIDATES = 4096;

export interface MusicMaterialCandidate {
  readonly notes: readonly MusicNote[];
}
export type MusicMaterialSearch<T> =
  | {
      readonly status: "found";
      readonly seed: number;
      readonly checked: number;
      readonly fingerprint: string;
      readonly material: T;
    }
  | { readonly status: "exhausted"; readonly checked: number };

/** Candidate only: the shell must atomically reserve its fingerprint before any disclosure. */
export function findNewMusicMaterial<T extends MusicMaterialCandidate>(
  seed: number,
  create: (seed: number) => T,
  known: ReadonlySet<string>,
  maxCandidates = MUSIC_NOVELTY_CANDIDATES
): MusicMaterialSearch<T> {
  let next = normalizeReadingSeed(seed);
  if (
    !Number.isInteger(maxCandidates) ||
    maxCandidates < 1 ||
    maxCandidates > MUSIC_NOVELTY_CANDIDATES
  )
    throw new RangeError("Invalid music novelty candidate budget");
  for (let checked = 1; checked <= maxCandidates; checked++) {
    const material = create(next);
    const fingerprint = musicFingerprint(material.notes);
    if (!known.has(fingerprint))
      return { status: "found", seed: next, checked, fingerprint, material };
    next = (next + 1) >>> 0;
  }
  return { status: "exhausted", checked: maxCandidates };
}
