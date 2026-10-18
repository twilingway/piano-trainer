/** A lesson level's stage dressing for the performance scene, from its local `.stage.json`. */
export interface SongStage {
  /** The neon sign behind the pianist. */
  readonly sign?: string;
}

export const SONG_SIGN_MAX_LENGTH = 80;

/** Strictly `{ "sign"?: string }`; anything else is refused with the reason. */
export function parseSongStage(
  text: string
): { readonly stage: SongStage } | { readonly error: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: "not JSON" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { error: "not a JSON object" };
  const unknown = Object.keys(value).filter((key) => key !== "sign");
  if (unknown.length > 0) return { error: `unknown field ${unknown.join(", ")}` };
  if (!("sign" in value)) return { stage: {} };
  const sign: unknown = value.sign;
  if (typeof sign !== "string") return { error: "sign is not a string" };
  const trimmed = sign.trim();
  if (trimmed === "") return { error: "sign is empty" };
  for (let index = 0; index < trimmed.length; index++) {
    const code = trimmed.charCodeAt(index);
    if (code < 0x20 || code === 0x7f)
      return { error: "sign has a line break or a control character" };
  }
  // What a reader counts as characters: an emoji or an accented letter is one.
  const characters = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)
  ).length;
  if (characters > SONG_SIGN_MAX_LENGTH)
    return { error: `sign is longer than ${String(SONG_SIGN_MAX_LENGTH)} characters` };
  return { stage: { sign: trimmed } };
}
