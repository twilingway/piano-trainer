import type { SongNote } from "../song/song";

/** Cache the next distinct attack once; notes sharing a chord onset must keep the same slot. */
export function nextSamePitchStarts(notes: readonly SongNote[]): ReadonlyMap<string, number> {
  const nextStarts = new Map<string, number>();
  const following = new Map<number, { start: number; next: number | undefined }>();
  const ordered = [...notes].sort((a, b) => a.start - b.start);
  for (let index = ordered.length - 1; index >= 0; index--) {
    const note = ordered[index];
    if (!note) continue;
    const after = following.get(note.pitch);
    const next = after && after.start > note.start + 1e-8 ? after.start : after?.next;
    if (next !== undefined) nextStarts.set(note.id, next);
    following.set(note.pitch, { start: note.start, next });
  }
  return nextStarts;
}

/** Limit the far tail after readability expansion, never moving the attack/head or musical time. */
export function separateRepeatTail(
  top: number,
  bottom: number,
  nextHead: number,
  screenSlope = 1
): number {
  if (
    !Number.isFinite(top) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(nextHead) ||
    !Number.isFinite(screenSlope)
  )
    return top;
  if (nextHead >= bottom) return bottom;
  const available = bottom - nextHead;
  // Preserve a visible body when attacks are denser than a three-pixel gap can physically fit.
  const gap = Math.min(available * 0.3, 3 / Math.max(0.01, Math.abs(screenSlope)));
  return Math.max(top, nextHead + gap);
}
