import type { Hand } from "../fingering/fingering";
import type { Song } from "../song/song";
import { ownsNote } from "./playableRange";
import type { PracticeOptions } from "./session";
import type { NoteResultSnapshot } from "./noteResult";

/** Evidence from a naturally ended run; recording a take is a separate contract. */
export interface RunCompletion {
  readonly runId: string;
  readonly songKey: string;
  readonly context?: string;
  readonly from: number;
  readonly to: number;
  readonly mode: "wait" | "tempo";
  readonly hands: readonly Hand[];
  readonly hitCount: number;
  readonly interrupted: boolean;
  readonly fullRange: boolean;
  readonly noteResult?: NoteResultSnapshot;
}

interface PreparedRun {
  readonly signature: string;
  readonly evidence: Omit<RunCompletion, "runId" | "hitCount" | "interrupted" | "from">;
}

/** Pure bookkeeping: no clock, renderer, input device or persistence. */
export class RunCompletionTracker {
  private sequence = 0;
  private prepared: PreparedRun | undefined;
  private active: RunCompletion | undefined;
  private emitted = false;
  private interrupted = false;

  load(
    song: Song,
    options: PracticeOptions,
    songKey: string,
    context?: string,
    preserve = false
  ): void {
    const hands = [...options.hands].sort();
    const to = options.to ?? song.duration;
    const prepared: PreparedRun = {
      signature: JSON.stringify([
        songKey,
        context,
        song.notes,
        song.duration,
        song.musicXml,
        {
          mode: options.mode,
          hands,
          speed: options.speed,
          difficulty: options.difficulty ?? "normal",
          learningWindow: options.mode === "tempo" && options.learningWindow === true,
          from: options.from ?? 0,
          to,
          missGraceMs: options.missGraceMs ?? 250,
          playable: options.playable ? [options.playable.low, options.playable.high] : undefined,
          parts: options.parts ? [...options.parts].sort() : undefined,
          accompaniment: options.accompaniment !== false,
          noteResult: options.noteResult !== false
        }
      ]),
      evidence: {
        songKey,
        ...(context !== undefined ? { context } : {}),
        to,
        mode: options.mode,
        hands,
        fullRange:
          Math.max(0, options.from ?? 0) === 0 &&
          to >= song.duration &&
          song.notes.every(
            (note) =>
              !options.hands.has(note.hand) ||
              ownsNote(note, options.hands, options.playable, options.parts)
          )
      }
    };
    if (!preserve) this.restart();
    else if (this.active && this.prepared?.signature !== prepared.signature) {
      this.interrupted = true;
      this.active = { ...this.active, interrupted: true };
    }
    this.prepared = prepared;
  }

  begin(from: number): void {
    if (this.active || !this.prepared) return;
    this.sequence++;
    this.active = {
      ...this.prepared.evidence,
      runId: String(this.sequence),
      from: Math.max(0, from),
      hitCount: 0,
      interrupted: this.interrupted
    };
    this.emitted = false;
  }

  /** Only session hits caused by player key presses belong here, including late hits. */
  hit(): void {
    if (this.active && !this.emitted)
      this.active = { ...this.active, hitCount: this.active.hitCount + 1 };
  }

  /** A seek never proves an uninterrupted pass, even when it seeks to zero. */
  seek(): void {
    this.active = undefined;
    this.interrupted = true;
  }

  /** Explicit restart and each new loop iteration begin with fresh evidence. */
  restart(): void {
    this.active = undefined;
    this.interrupted = false;
    this.emitted = false;
  }

  finish(noteResult?: NoteResultSnapshot): RunCompletion | undefined {
    if (!this.active || this.emitted) return undefined;
    this.emitted = true;
    return { ...this.active, ...(noteResult ? { noteResult: { ...noteResult } } : {}) };
  }
}
