import { inputTokenId } from "./inputTokens";
import type { GeneratedToken } from "./types";

/** Song seconds around the owed note whose pitches a stray key avoids: wider than a hit window. */
const NEAR_S = 1;

/**
 * The pitch a key plays in the per-word layout: its pitch in the word of the owed note (the last
 * word once nothing is owed). A key of the mode's keyboard that the word lacks plays the pitch
 * nearest the owed note, a semitone below first, that no note near it has, so the miss is heard
 * and judged and can never land on a neighbouring note; any other key plays nothing.
 */
export function wordKeyPitch(
  tokens: readonly GeneratedToken[],
  owedNoteId: string | undefined,
  tokenId: string,
  keyboard: ReadonlySet<string>
): number | undefined {
  const owed = tokens.find((token) => token.noteId === owedNoteId) ?? tokens.at(-1);
  if (!owed) return undefined;
  const match = tokens.find(
    (token) => token.wordIndex === owed.wordIndex && inputTokenId(token.input) === tokenId
  );
  if (match) return match.pitch;
  if (!keyboard.has(tokenId)) return undefined;
  const near = new Set(
    tokens.filter((token) => Math.abs(token.start - owed.start) <= NEAR_S).map(({ pitch }) => pitch)
  );
  for (let step = 1; step < 128; step++) {
    for (const pitch of [owed.pitch - step, owed.pitch + step]) {
      if (pitch >= 0 && pitch <= 127 && !near.has(pitch)) return pitch;
    }
  }
  return undefined;
}
