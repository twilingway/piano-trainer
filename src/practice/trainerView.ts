import type { FallingNotesView } from "../render/FallingNotesView";
import type { SongNote } from "../song/song";
import type { PracticeSession } from "./session";

const NOTHING: ReadonlySet<number> = new Set();

export function drawTrainerMirror(
  mirror:
    | { readonly view: FallingNotesView; readonly colorOf: (note: SongNote) => number | undefined }
    | undefined,
  session: PracticeSession
): void {
  mirror?.view.draw({
    time: session.time,
    hintTime: session.time,
    hintSpeed: session.options.speed,
    hintNotes: [],
    lookAhead: 2,
    statusOf: () => undefined,
    pressed: NOTHING,
    sounding: NOTHING,
    due: [],
    hands: session.options.hands,
    owns: session.owns,
    colorOf: mirror.colorOf
  });
}
