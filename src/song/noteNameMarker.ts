export const NOTE_NAME_VERSE_PREFIX = "twiling-note-name-";

/** Generated note names are distinct from the source score's vocal verses. */
export function noteNameStack(verse: string): number | undefined {
  if (!verse.startsWith(NOTE_NAME_VERSE_PREFIX)) return undefined;
  const suffix = verse.slice(NOTE_NAME_VERSE_PREFIX.length);
  if (!/^[1-9]\d*$/.test(suffix)) return undefined;
  const value = Number(suffix);
  return Number.isSafeInteger(value) ? value : undefined;
}
