import type { PracticeOptions } from "./practiceTypes";
import type { SongNote } from "../song/song";

interface WaitingGroup {
  readonly finished: boolean;
  readonly waiting: boolean;
  readonly options: PracticeOptions;
  nextDue(): SongNote[];
}

/** Validation is read-only; the session alone mutates status and anchors its clock. */
export function waitingPairForCommit(
  session: WaitingGroup,
  ids: readonly string[],
  atMs: number
): readonly SongNote[] | undefined {
  const due = session.nextDue();
  return !session.finished &&
    session.waiting &&
    session.options.mode === "wait" &&
    session.options.noteResult === false &&
    Number.isFinite(atMs) &&
    due.length === 2 &&
    ids.length === due.length &&
    new Set(ids).size === due.length &&
    due.every((note) => ids.includes(note.id))
    ? due
    : undefined;
}
