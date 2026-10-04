import { inputTokenId } from "./inputTokens";
import type { GeneratedToken } from "./types";

/**
 * The pitch a key plays in the per-word layout: its pitch in the word of the owed note (the last
 * word once nothing is owed). A key of the mode's keyboard that the word lacks plays a semitone
 * below the owed note, so the miss is heard and judged; any other key plays nothing.
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
  return owed.pitch > 0 ? owed.pitch - 1 : owed.pitch + 1;
}
