import type { SongNote } from "../song/song";
import type { NoteStatus, PracticeEvent, PracticeOptions } from "./practiceTypes";
import type { SessionScoring } from "./sessionScoring";

export function sameSessionResult(
  notes: readonly SongNote[],
  options: PracticeOptions,
  duration: number,
  previousNotes: readonly SongNote[],
  previousOptions: PracticeOptions,
  previousDuration: number
): boolean {
  return (
    JSON.stringify([notes, options.mode, options.speed, options.to, duration]) ===
    JSON.stringify([
      previousNotes,
      previousOptions.mode,
      previousOptions.speed,
      previousOptions.to,
      previousDuration
    ])
  );
}

export function sessionResultNotes(notes: readonly SongNote[], to = Infinity): SongNote[] {
  return notes.map((note) => ({
    ...note,
    duration: Math.max(0, Math.min(note.duration, to - note.start))
  }));
}
export function sessionScoringNotes(
  notes: readonly SongNote[],
  speed: number,
  to = Infinity
): SongNote[] {
  return sessionResultNotes(notes, to).map((note) => ({
    ...note,
    start: note.start / speed,
    duration: note.duration / speed
  }));
}

/** Ordinary chord grading stays separate from the course's verified onset guard. */
export function finalizeSessionChords(
  notes: readonly SongNote[],
  status: ReadonlyMap<string, NoteStatus>,
  finalized: Set<string>,
  hitTimes: ReadonlyMap<string, number>,
  speed: number,
  lateWindow: number,
  game: SessionScoring
): void {
  for (let index = 0; index < notes.length;) {
    const first = notes[index];
    if (!first) break;
    const chord: SongNote[] = [];
    while (index < notes.length) {
      const member = notes[index];
      if (!member || member.start - first.start > 0.03) break;
      chord.push(member);
      index++;
    }
    if (
      chord.length < 2 ||
      finalized.has(first.id) ||
      chord.some((note) => status.get(note.id) === "pending")
    )
      continue;
    if (chord.some((note) => status.get(note.id) === "skipped")) continue;
    const hit = chord.every((note) => status.get(note.id) === "hit");
    game.chord(
      first.id,
      hit,
      hit
        ? Math.max(...chord.map((note) => hitTimes.get(note.id) ?? note.start / speed))
        : Math.max(...chord.map((note) => note.start)) / speed + lateWindow
    );
    finalized.add(first.id);
  }
}

export function advanceSessionAuto(
  notes: readonly SongNote[],
  sounding: SongNote[],
  from: number,
  time: number,
  to: number,
  events: PracticeEvent[]
): number {
  for (let index = sounding.length - 1; index >= 0; index--) {
    const note = sounding[index];
    if (note && Math.min(note.start + note.duration, to) <= time) {
      sounding.splice(index, 1);
      events.push({ type: "autoNoteOff", pitch: note.pitch });
    }
  }
  while (from < notes.length) {
    const note = notes[from];
    if (!note || note.start > time) break;
    from++;
    events.push(
      note.velocity === undefined
        ? { type: "autoNoteOn", pitch: note.pitch }
        : { type: "autoNoteOn", pitch: note.pitch, velocity: note.velocity }
    );
    sounding.push(note);
  }
  return from;
}
