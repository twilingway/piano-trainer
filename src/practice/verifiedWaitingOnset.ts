import type { Song, SongNote } from "../song/song";
import type { PracticeOptions } from "./practiceTypes";

export interface VerifiedOnsetScope {
  readonly runId: string;
  readonly fragmentId: string;
  readonly presentationId: string;
  readonly steps: readonly (readonly string[])[];
}
export interface ScopedVerifiedOnset {
  readonly runId: string;
  readonly fragmentId: string;
  readonly presentationId: string;
  readonly step: number;
  readonly noteIds: readonly string[];
}

/** A scope is immutable and belongs to one fresh current-fragment session. */
export class VerifiedWaitingOnsets {
  private scope: VerifiedOnsetScope | undefined;
  private step = 0;

  register(scope: VerifiedOnsetScope, song: Song, options: PracticeOptions): boolean {
    if (
      this.scope ||
      !scope.runId ||
      !scope.fragmentId ||
      !scope.presentationId ||
      options.mode !== "wait" ||
      options.noteResult !== false ||
      options.speed !== 1 ||
      options.accompaniment !== false ||
      options.hands.size !== 2 ||
      !options.hands.has("left") ||
      !options.hands.has("right") ||
      options.from !== undefined ||
      options.to !== undefined ||
      options.parts !== undefined ||
      options.playable !== undefined ||
      ![2, 4].includes(scope.steps.length)
    )
      return false;
    const allIds = scope.steps.flat();
    if (new Set(allIds).size !== allIds.length || allIds.length !== song.notes.length) return false;
    if (
      scope.steps.some((ids, index) => {
        const notes = song.notes.filter((note) => note.start === index * 0.5);
        return (
          ids.length !== (index === 0 ? 2 : 1) ||
          notes.length !== ids.length ||
          notes.some((note) => !ids.includes(note.id)) ||
          (index === 0
            ? notes.filter((note) => note.hand === "left").length !== 1
            : notes.some((note) => note.hand !== "right"))
        );
      }) ||
      song.duration !== scope.steps.length * 0.5
    )
      return false;
    this.scope = { ...scope, steps: scope.steps.map((ids) => [...ids]) };
    return true;
  }

  get registered(): boolean {
    return this.scope !== undefined;
  }

  accepts(request: ScopedVerifiedOnset, due: readonly SongNote[]): boolean {
    const scope = this.scope;
    if (!scope) return false;
    const expected = scope.steps[this.step];
    if (!expected) return false;
    return (
      scope.runId === request.runId &&
      scope.fragmentId === request.fragmentId &&
      scope.presentationId === request.presentationId &&
      request.step === this.step &&
      request.noteIds.length === expected.length &&
      new Set(request.noteIds).size === expected.length &&
      due.length === expected.length &&
      expected.every((id) => request.noteIds.includes(id) && due.some((note) => note.id === id))
    );
  }

  committed(): void {
    this.step++;
  }
}
