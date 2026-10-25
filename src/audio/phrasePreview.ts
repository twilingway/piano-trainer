import { normalizeMusicNotes } from "../musicLearning/material";
import type { MusicExercise, MusicNote } from "../musicLearning/types";
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

export interface PhrasePreviewReceipt {
  readonly runId: string;
  readonly presentationId: string;
  readonly playbackId: string;
  /** Scheduled sources observed on the running audio clock; not hardware audibility. */
  readonly evidence: "engine-observed";
  readonly firstAttackAudioSeconds: number | null;
  readonly observedAudioSeconds: number;
  /** Scheduled note-on timestamps observed while engine readiness was true. */
  readonly observedAttacks: number;
  /** Scheduled note-off timestamps observed; the engine exposes no per-source onended receipt. */
  readonly observedReleases: number;
  readonly totalNotes: number;
}
export interface PhrasePreviewCancellation extends PhrasePreviewReceipt {
  readonly partial: boolean;
}
export interface PhrasePreviewRequest {
  readonly runId: string;
  readonly presentationId: string;
  readonly playbackId: string;
  readonly material: Pick<MusicExercise, "notes" | "bpm">;
  readonly onStarted: (receipt: PhrasePreviewReceipt) => void;
  readonly onCompleted: (receipt: PhrasePreviewReceipt) => void;
  readonly onCancelled: (receipt: PhrasePreviewCancellation) => void;
  readonly onError: (error: unknown, receipt: PhrasePreviewReceipt) => void;
}
export interface PhrasePreview {
  readonly play: (request: PhrasePreviewRequest) => Promise<boolean>;
  readonly cancel: () => void;
  readonly dispose: () => void;
}
interface ActivePhrase {
  readonly request: PhrasePreviewRequest;
  readonly generation: number;
  readonly notes: readonly MusicNote[];
  readonly pitches: readonly number[];
  readonly jobs: Set<number>;
  readonly voices: Set<string>;
  readonly attacks: Set<number>;
  readonly releases: Set<number>;
  firstAttackAt: number | null;
  started: boolean;
}
let nextOwner = 0;
const LEAD_SECONDS = 0.05;
const RELEASE_TAIL_SECONDS = 0.08;

/**
 * Finite references use the existing audio clock and never advance a PracticeSession.
 * Context suspension and global cancellation invalidate the whole phrase. Samples,
 * running context and unmuted destination are checked at every attack/release/end.
 * The current engine has no mute/volume/instrument-change subscription: a brief mute
 * entirely between observations cannot be detected, nor can hardware output silence.
 */
export function createPhrasePreview(ownerId: string): PhrasePreview {
  const owner = `phrase:${ownerId}:${String(++nextOwner)}`;
  let generation = 0;
  let disposed = false;
  let active: ActivePhrase | null = null;
  const current = (phrase: ActivePhrase): boolean =>
    !disposed && active === phrase && phrase.generation === generation;
  const receipt = (phrase: ActivePhrase): PhrasePreviewReceipt => ({
    runId: phrase.request.runId,
    presentationId: phrase.request.presentationId,
    playbackId: phrase.request.playbackId,
    evidence: "engine-observed",
    firstAttackAudioSeconds: phrase.started ? phrase.firstAttackAt : null,
    observedAudioSeconds: audioTime(),
    observedAttacks: phrase.attacks.size,
    observedReleases: phrase.releases.size,
    totalNotes: phrase.notes.length
  });
  const release = (phrase: ActivePhrase) => {
    for (const id of phrase.jobs) cancelScheduledSound(id);
    phrase.jobs.clear();
    for (const id of phrase.voices) disposeScheduledVoice(id);
    phrase.voices.clear();
  };
  const terminate = (error?: unknown, inferStart = true) => {
    const phrase = active;
    if (!phrase) return;
    // Infer a delayed start only while the engine still reports audible readiness.
    // Elapsed audio time alone does not establish a first sound through mute/suspension.
    const lateStart =
      inferStart &&
      !phrase.started &&
      phrase.firstAttackAt !== null &&
      audioTime() >= phrase.firstAttackAt &&
      pianoSoundReady(phrase.pitches);
    if (lateStart) phrase.started = true;
    const event = receipt(phrase);
    ++generation;
    active = null;
    release(phrase);
    if (lateStart) phrase.request.onStarted(event);
    phrase.request.onCancelled({ ...event, partial: phrase.started });
    if (error !== undefined) phrase.request.onError(error, event);
  };
  const cancel = () => {
    terminate();
  };
  const unsubscribe = onScheduledVoicesCancelled(cancel);
  const stopContext = onPianoSoundInterrupted(() => {
    terminate(new Error("Phrase audio was interrupted"));
  });

  const play = async (request: PhrasePreviewRequest): Promise<boolean> => {
    if (disposed || active) return false;
    const phrase: ActivePhrase = {
      request,
      generation: ++generation,
      notes: [],
      pitches: [],
      jobs: new Set(),
      voices: new Set(),
      attacks: new Set(),
      releases: new Set(),
      firstAttackAt: null,
      started: false
    };
    active = phrase;
    try {
      if (!request.runId || !request.presentationId || !request.playbackId)
        throw new RangeError("Phrase playback identity is required");
      if (
        !Number.isFinite(request.material.bpm) ||
        request.material.bpm < 30 ||
        request.material.bpm > 240
      )
        throw new RangeError("Phrase tempo must be between 30 and 240 BPM");
      const notes = normalizeMusicNotes(request.material.notes);
      if (new Set(notes.map((note) => note.startBeat)).size > 8)
        throw new RangeError("Phrase preview supports at most eight attack groups");
      const prepared: ActivePhrase = { ...phrase, notes, pitches: notes.map((note) => note.pitch) };
      active = prepared;
      await startPianoSound();
      if (!current(prepared)) return false;
      if (!pianoSoundReady(prepared.pitches)) throw new Error("Phrase audio is not audible");
      const firstBeat = notes[0]?.startBeat ?? 0;
      const first = audioTime() + LEAD_SECONDS;
      const secondsPerBeat = 60 / request.material.bpm;
      let end = first;
      for (const [index, note] of notes.entries()) {
        const at = first + (note.startBeat - firstBeat) * secondsPerBeat;
        const off = at + note.durationBeats * secondsPerBeat;
        const id = `${owner}:${request.runId}:${request.presentationId}:${request.playbackId}:${String(prepared.generation)}:${String(index)}`;
        prepared.voices.add(id);
        if (!scheduledNoteOn(note.pitch, 100, at, id))
          throw new Error("Phrase sample is unavailable");
        prepared.firstAttackAt ??= first;
        scheduledNoteOff(note.pitch, off, id);
        end = Math.max(end, off);
      }
      const observe = (at: number, callback: () => void) => {
        const job = scheduleSoundObserved(at, () => {
          prepared.jobs.delete(job);
          if (!current(prepared)) return;
          if (audioTime() < at) {
            observe(at, callback);
            return;
          }
          if (!pianoSoundReady(prepared.pitches)) {
            terminate(new Error("Phrase audio was interrupted"), false);
            return;
          }
          callback();
        });
        prepared.jobs.add(job);
      };
      for (const [index, note] of notes.entries()) {
        const at = first + (note.startBeat - firstBeat) * secondsPerBeat;
        observe(at, () => {
          prepared.attacks.add(index);
          if (prepared.started) return;
          prepared.started = true;
          request.onStarted(receipt(prepared));
        });
        observe(at + note.durationBeats * secondsPerBeat, () => {
          prepared.releases.add(index);
        });
      }
      observe(end + RELEASE_TAIL_SECONDS, () => {
        if (prepared.attacks.size !== notes.length || prepared.releases.size !== notes.length) {
          terminate(new Error("Phrase observations were incomplete"));
          return;
        }
        const event = receipt(prepared);
        active = null;
        release(prepared);
        request.onCompleted(event);
      });
      return true;
    } catch (error) {
      if (generation === phrase.generation) terminate(error);
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
