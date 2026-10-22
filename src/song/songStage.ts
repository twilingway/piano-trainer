/** A lesson level's stage dressing for the performance scene, from its local `.stage.json`. */
export interface SongStage {
  /** The neon sign behind the pianist. */
  readonly sign?: string;
  /** Fire bursts around the stage, and a brighter sign, on every bass note. */
  readonly bassFire?: boolean;
}

export const SONG_SIGN_MAX_LENGTH = 80;
const FIELDS = new Set(["sign", "bassFire"]);

function parseSign(sign: unknown): { readonly sign: string } | { readonly error: string } {
  if (typeof sign !== "string") return { error: "sign is not a string" };
  const trimmed = sign.trim();
  if (trimmed === "") return { error: "sign is empty" };
  for (let index = 0; index < trimmed.length; index++) {
    const code = trimmed.charCodeAt(index);
    // C0 and DEL, the C1 next line, and the Unicode line and paragraph separators.
    if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029)
      return { error: "sign has a line break or a control character" };
  }
  // What a reader counts as characters: an emoji or an accented letter is one.
  const characters = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)
  ).length;
  if (characters > SONG_SIGN_MAX_LENGTH)
    return { error: `sign is longer than ${String(SONG_SIGN_MAX_LENGTH)} characters` };
  return { sign: trimmed };
}

/** Strictly `{ "sign"?: string, "bassFire"?: boolean }`; anything else is refused with the reason. */
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
  const unknown = Object.keys(value).filter((key) => !FIELDS.has(key));
  if (unknown.length > 0) return { error: `unknown field ${unknown.join(", ")}` };
  let stage: SongStage = {};
  if ("sign" in value) {
    const sign = parseSign(value.sign);
    if ("error" in sign) return sign;
    stage = { ...stage, sign: sign.sign };
  }
  if ("bassFire" in value) {
    if (typeof value.bassFire !== "boolean") return { error: "bassFire is not true or false" };
    stage = { ...stage, bassFire: value.bassFire };
  }
  return { stage };
}
