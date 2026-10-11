import {
  audioTime,
  cancelScheduledSound,
  pianoSoundReady,
  onPianoSoundInterrupted,
  scheduleSoundObserved,
  startPianoSound
} from "./pianoSound";
import {
  disposeScheduledVoice,
  onScheduledVoicesCancelled,
  scheduledNoteOff,
  scheduledNoteOn
} from "./scheduledVoices";

export interface IntervalPreviewRequest {
  readonly runId: string;
  readonly questionId: string;
  readonly pitches: readonly [number, number];
  readonly onStarted: () => void;
  readonly onCompleted: () => void;
  readonly onCancelled: (event: { readonly partial: boolean }) => void;
  readonly onError: (error: unknown) => void;
}

export interface IntervalPreview {
  readonly play: (request: IntervalPreviewRequest) => Promise<boolean>;
  readonly cancel: () => void;
  readonly dispose: () => void;
}

let nextOwner = 0;
const NOTE_SECONDS = 0.5;
const NOTE_GAP_SECONDS = 0.25;

/** Owns a finite audio reference. It never advances or resumes a PracticeSession. */
export function createIntervalPreview(ownerId: string): IntervalPreview {
  const owner = `interval:${ownerId}:${String(++nextOwner)}`;
  let generation = 0;
  let disposed = false;
  let active: IntervalPreviewRequest | null = null;
  let firstAttackAt: number | null = null;
  const jobs = new Set<number>();
  const voices = new Set<string>();

  const release = () => {
    for (const id of jobs) cancelScheduledSound(id);
    jobs.clear();
    for (const id of voices) disposeScheduledVoice(id);
    voices.clear();
    firstAttackAt = null;
  };
  const cancel = () => {
    const previous = active;
    const partial = firstAttackAt !== null && audioTime() >= firstAttackAt;
    ++generation;
    active = null;
    release();
    previous?.onCancelled({ partial });
  };
  const unsubscribe = onScheduledVoicesCancelled(cancel);
  const stopContext = onPianoSoundInterrupted(() => {
    if (!active) return;
    const request = active;
    cancel();
    request.onError(new Error("Interval audio was interrupted"));
  });

  const play = async (request: IntervalPreviewRequest): Promise<boolean> => {
    if (disposed || active) return false;
    const token = ++generation;
    active = request;
    const current = () => !disposed && generation === token && active === request;
    const fail = (error: unknown) => {
      if (!current()) return;
      ++generation;
      active = null;
      release();
      request.onError(error);
    };
    try {
      await startPianoSound();
      if (!current()) return false;
      if (!pianoSoundReady(request.pitches)) throw new Error("Interval audio is not audible");
      const first = audioTime() + 0.05;
      const second = first + NOTE_SECONDS + NOTE_GAP_SECONDS;
      for (const [index, pitch] of request.pitches.entries()) {
        const at = index === 0 ? first : second;
        const id = `${owner}:${request.runId}:${request.questionId}:${String(token)}:${String(index)}`;
        voices.add(id);
        if (!scheduledNoteOn(pitch, 100, at, id)) throw new Error("Interval sample is unavailable");
        scheduledNoteOff(pitch, at + NOTE_SECONDS, id);
      }
      firstAttackAt = first;
      const observe = (at: number, callback: () => void) => {
        const id = scheduleSoundObserved(at, () => {
          jobs.delete(id);
          if (!current()) return;
          if (!pianoSoundReady(request.pitches)) {
            cancel();
            request.onError(new Error("Interval audio was interrupted"));
            return;
          }
          callback();
        });
        jobs.add(id);
      };
      observe(first, request.onStarted);
      // Observe both attacks and the release tail before opening the answer gate.
      observe(second, () => undefined);
      observe(second + NOTE_SECONDS + 0.08, () => {
        active = null;
        release();
        request.onCompleted();
      });
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  };

  return {
    play,
    cancel,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancel();
      unsubscribe();
      stopContext();
    }
  };
}
