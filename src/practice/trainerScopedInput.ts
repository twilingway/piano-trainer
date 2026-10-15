import type { KeyEvent } from "../input/midiInput";
import { stepTrainerHeldBass, type TrainerHeldBassPolicy } from "./heldBassPolicy";
import { stepTrainerPair, type TrainerPairPolicy } from "./twoHandPolicy";
import type { PracticeEvent, PracticeSession } from "./session";

/** Courses in waiting mode keep their verified-commit path separate from tempo observers. */
export function processScopedInput(
  event: KeyEvent,
  session: PracticeSession | undefined,
  heldBass: TrainerHeldBassPolicy | null,
  pair: TrainerPairPolicy | null,
  playing: boolean,
  raw: number,
  corrected: number,
  received: number,
  apply: (events: readonly PracticeEvent[]) => void
): void {
  if (!session) return;
  if (playing) apply(session.tick(received));
  if (heldBass)
    heldBass.onInput(
      event,
      session,
      playing,
      raw,
      corrected,
      received,
      session.clockReceipt(received)
    );
  else pair?.onInput(event, session, playing, raw, corrected, received);
  apply(stepTrainerPair(pair, session, playing, received));
  apply(stepTrainerHeldBass(heldBass, session, playing, received));
}
