import type { KeyEvent } from "../input/midiInput";
import { recordKeyInput } from "../recording/recordInput";
import type { TakeRecorder } from "../recording/take";
import type { TrainerReadingPolicy } from "./readingPolicy";
import type { PracticeEvent, PracticeSession } from "./session";
import { inputDiagnostic, type InputDiagnostic } from "./trainerSnapshot";

interface PianoInputContext {
  readonly session: PracticeSession | undefined;
  readonly reading: TrainerReadingPolicy | null;
  readonly playing: () => boolean;
  readonly fresh: boolean;
  readonly raw: number;
  readonly corrected: number;
  readonly received: number;
  readonly recorder: () => TakeRecorder | undefined;
  readonly realTime: number;
  readonly apply: (events: readonly PracticeEvent[]) => void;
  readonly diagnose: (diagnostic: InputDiagnostic) => void;
  readonly publish: () => void;
}

/** Ordinary piano input keeps its recording and reading rules outside course observers. */
export function processPianoInput(event: KeyEvent, context: PianoInputContext): void {
  const { session, reading, fresh, raw, corrected, received } = context;
  if (session && context.playing()) context.apply(session.tick(received));
  if (session) reading?.onFrame(session, context.playing(), received);
  const eventTime =
    session?.songTimeAt(corrected) ?? (event.type === "up" ? session?.time : undefined);
  context.diagnose(inputDiagnostic(event, raw, corrected, received, eventTime));
  if (eventTime === undefined || received - raw > 250) {
    context.publish();
    return;
  }
  const recorder = context.recorder();
  if (recorder && session)
    recordKeyInput(recorder, event, eventTime, context.realTime, raw, corrected, raw - corrected);
  if (event.type === "down" && session) {
    if (
      reading &&
      (!fresh || !context.playing() || !session.waiting || !reading.allowInput(event, session, raw))
    ) {
      context.publish();
      return;
    }
    const events = session.pressKeyAt(
      event.pitch,
      corrected,
      received,
      event.deviceId ?? event.source
    );
    reading?.onJudgement(event, events, raw, corrected);
    context.apply(events);
    context.publish();
  }
  if (event.type === "up" && session)
    session.releaseKeyAt(event.pitch, corrected, event.deviceId ?? event.source);
}
