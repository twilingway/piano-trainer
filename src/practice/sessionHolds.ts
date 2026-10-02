import type { SongNote } from "../song/song";

export interface HoldStatistics {
  readonly heldSeconds: number;
  readonly possibleSeconds: number;
  readonly accuracy: number | null;
  readonly releasedNotes: number;
  readonly meanReleaseOffsetMs: number | null;
  readonly medianReleaseOffsetMs: number | null;
}

interface Hold {
  readonly note: SongNote;
  readonly source: string;
  readonly attack: number;
  readonly start: number;
  ticks: number;
  stopped: number;
  release?: number;
}

/** Physical key spans retain history so a delayed old Note Off cannot close a new attack. */
export class SessionHolds {
  private readonly holds: Hold[] = [];
  private readonly stopBoundaries: { at: number; performanceMs?: number }[] = [];
  constructor(
    private readonly notes: readonly SongNote[],
    private readonly award: (id: string, ticks: number, at: number) => void,
    private readonly truncate: (id: string, until: number) => void
  ) {}
  start(note: SongNote, at: number, source: string, performanceMs?: number): void {
    if (note.duration < 0.5) return;
    for (const hold of this.holds) {
      if (
        hold.note.pitch === note.pitch &&
        hold.source === source &&
        hold.attack <= at &&
        hold.stopped > at
      ) {
        hold.stopped = at;
        this.truncate(hold.note.id, at);
      }
    }
    const nextAttack = Math.min(
      Infinity,
      ...this.holds
        .filter(
          (hold) => hold.note.pitch === note.pitch && hold.source === source && hold.attack > at
        )
        .map((hold) => hold.attack)
    );
    const pauseBoundary =
      this.stopBoundaries.find((boundary) =>
        performanceMs !== undefined && boundary.performanceMs !== undefined
          ? boundary.performanceMs >= performanceMs
          : boundary.at >= at
      )?.at ?? Infinity;
    this.holds.push({
      note,
      source,
      attack: at,
      start: Math.max(note.start, at),
      ticks: 0,
      stopped: Math.min(nextAttack, pauseBoundary)
    });
  }
  update(at: number): void {
    for (const hold of this.holds) {
      const end = Math.min(at, hold.note.start + hold.note.duration, hold.stopped);
      const ticks = Math.max(0, Math.floor((end - hold.start + 1e-9) / 0.1));
      for (let completed = hold.ticks + 1; completed <= ticks; completed++) {
        this.award(hold.note.id, completed, hold.start + completed * 0.1);
      }
      hold.ticks = Math.max(hold.ticks, ticks);
    }
  }
  release(pitch: number, at: number, source: string): void {
    const matching = this.holds.filter(
      (hold) => hold.note.pitch === pitch && hold.source === source && hold.attack <= at
    );
    const hold = matching.sort((a, b) => b.attack - a.attack)[0];
    if (!hold) return;
    hold.stopped = Math.min(hold.stopped, at);
    hold.release = at;
    this.truncate(hold.note.id, at);
    this.update(at);
  }
  stop(at: number, performanceMs?: number): void {
    this.stopBoundaries.push({ at, ...(performanceMs === undefined ? {} : { performanceMs }) });
    this.update(at);
    for (const hold of this.holds) hold.stopped = Math.min(hold.stopped, at);
  }
  snapshot(at: number): HoldStatistics {
    const possibleSeconds = this.notes
      .filter((note) => note.duration >= 0.5)
      .reduce((sum, note) => sum + note.duration, 0);
    const heldSeconds = this.holds.reduce(
      (sum, hold) =>
        sum +
        Math.max(0, Math.min(at, hold.stopped, hold.note.start + hold.note.duration) - hold.start),
      0
    );
    const errors = this.holds
      .flatMap((hold) =>
        hold.release === undefined
          ? []
          : [(hold.release - hold.note.start - hold.note.duration) * 1000]
      )
      .sort((a, b) => a - b);
    const mid = Math.floor(errors.length / 2);
    return {
      heldSeconds,
      possibleSeconds,
      accuracy: possibleSeconds > 0 ? Math.min(100, (heldSeconds / possibleSeconds) * 100) : null,
      releasedNotes: errors.length,
      meanReleaseOffsetMs:
        errors.length > 0 ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null,
      medianReleaseOffsetMs:
        errors.length > 0
          ? ((errors[mid] ?? 0) + (errors[(errors.length - 1) >> 1] ?? 0)) / 2
          : null
    };
  }
}
