/** Pitch colours never reveal a note before its existing named hint, or during a check. */
export function revealedClayNote(
  active: boolean,
  task: string | null,
  hintLevel: number,
  noteId?: string
): string | undefined {
  return active && task !== "check" && task !== null && hintLevel > 0 ? noteId : undefined;
}
