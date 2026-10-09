import type { SongNote } from "../song/song";

export const NOTE_RESULT_POLICY = "note-result-30-70-v1";
export const COURSE_PASS_PERCENT = 75;

export interface NoteResultSnapshot {
  readonly policy: string;
  readonly expectedNotes: number;
  readonly hitNotes: number;
  readonly hitPercent: number;
  readonly holdPercent: number;
  readonly percent: number | null;
}

interface PhysicalSpan {
  readonly pitch: number;
  readonly source: string;
  readonly start: number;
  readonly performanceMs?: number;
  end: number;
  noteId?: string;
  primary?: boolean;
}

interface PhysicalEvent {
  readonly at: number;
  readonly order: number;
  readonly span?: PhysicalSpan;
}

function insertSorted<T>(
  items: T[],
  item: T,
  value: (item: T) => number,
  tie: (first: T, second: T) => number = () => 0
): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const candidate = items[middle];
    if (
      candidate !== undefined &&
      (value(candidate) < value(item) ||
        (value(candidate) === value(item) && tie(candidate, item) <= 0))
    )
      low = middle + 1;
    else high = middle;
  }
  items.splice(low, 0, item);
  return low;
}

/** Song-time physical intervals, independent of bonus points and timing grades. */
export class NoteResult {
  private readonly hits = new Map<string, number>();
  private readonly spans = new Map<string, PhysicalSpan[]>();
  private readonly events = new Map<string, PhysicalEvent[]>();
  private readonly accepted = new Map<number, SongNote[]>();
  private readonly byPitch = new Map<number, PhysicalSpan[]>();
  private readonly byId: Map<string, SongNote>;
  private lastPress?: PhysicalSpan;
  constructor(private readonly notes: readonly SongNote[]) {
    this.byId = new Map(notes.map((note) => [note.id, note]));
  }

  press(pitch: number, at: number, source: string, performanceMs?: number): void {
    const span: PhysicalSpan = {
      pitch,
      source,
      start: at,
      end: Infinity,
      ...(performanceMs === undefined ? {} : { performanceMs })
    };
    this.lastPress = span;
    const physical = this.byPitch.get(pitch) ?? [];
    insertSorted(physical, span, (item) => item.start);
    this.byPitch.set(pitch, physical);
    this.input(pitch, source, { at, order: performanceMs ?? at * 1000, span });
    const notes = this.accepted.get(pitch) ?? [];
    // A repress resumes only the most recent accepted note whose interval is still active.
    let low = 0;
    let high = notes.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const candidate = notes[middle];
      if (candidate && (this.hits.get(candidate.id) ?? Infinity) <= at) low = middle + 1;
      else high = middle;
    }
    const note = notes[low - 1];
    if (note && note.start + note.duration > at) this.assign(span, note.id);
  }

  hit(noteId: string, at: number): void {
    const note = this.byId.get(noteId);
    if (!note) return;
    const fresh = !this.hits.has(noteId);
    if (fresh) {
      this.hits.set(noteId, at);
      const notes = this.accepted.get(note.pitch) ?? [];
      insertSorted(notes, note, (item) => this.hits.get(item.id) ?? Infinity);
      this.accepted.set(note.pitch, notes);
    }
    if (this.lastPress?.pitch === note.pitch && this.lastPress.start === at) {
      this.lastPress.primary = fresh;
      this.assign(this.lastPress, noteId);
    }
    if (fresh) this.reconcileRepeats(note);
  }

  release(pitch: number, at: number, source: string, performanceMs?: number): void {
    this.input(pitch, source, { at, order: performanceMs ?? at * 1000 });
  }

  snapshot(at: number): NoteResultSnapshot {
    let hitNotes = 0;
    let holdUnits = 0;
    for (const note of this.notes) {
      const attack = this.hits.get(note.id);
      if (attack === undefined) continue;
      hitNotes++;
      if (note.duration <= 0) {
        holdUnits++;
        continue;
      }
      const start = Math.max(note.start, attack);
      const end = Math.min(note.start + note.duration, at);
      let held = 0;
      let until = start;
      for (const span of this.spans.get(note.id) ?? []) {
        const from = Math.max(start, span.start);
        const to = Math.min(end, span.end);
        held += Math.max(0, to - Math.max(until, from));
        until = Math.max(until, to);
      }
      holdUnits += Math.min(1, held / note.duration);
    }
    const expectedNotes = this.notes.length;
    const hitPercent = expectedNotes > 0 ? (30 * hitNotes) / expectedNotes : 0;
    const holdPercent = expectedNotes > 0 ? (70 * holdUnits) / expectedNotes : 0;
    return {
      policy: NOTE_RESULT_POLICY,
      expectedNotes,
      hitNotes,
      hitPercent,
      holdPercent,
      percent: expectedNotes > 0 ? Math.min(100, hitPercent + holdPercent) : null
    };
  }

  private reconcileRepeats(note: SongNote): void {
    const accepted = this.accepted.get(note.pitch) ?? [];
    const index = accepted.indexOf(note);
    const start = this.hits.get(note.id) ?? note.start;
    const next = accepted[index + 1];
    const end = next ? (this.hits.get(next.id) ?? Infinity) : Infinity;
    const physical = this.byPitch.get(note.pitch) ?? [];
    let low = 0;
    let high = physical.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const candidate = physical[middle];
      if (candidate && candidate.start < start) low = middle + 1;
      else high = middle;
    }
    for (let i = low; i < physical.length; i++) {
      const span = physical[i];
      if (!span || span.start >= end) break;
      if (!span.primary)
        this.assign(span, span.start < note.start + note.duration ? note.id : undefined);
    }
  }

  private assign(span: PhysicalSpan, noteId: string | undefined): void {
    if (span.noteId === noteId) return;
    if (span.noteId) {
      const previous = this.spans.get(span.noteId) ?? [];
      previous.splice(previous.indexOf(span), 1);
    }
    if (!noteId) {
      delete span.noteId;
      return;
    }
    span.noteId = noteId;
    const spans = this.spans.get(noteId) ?? [];
    insertSorted(spans, span, (item) => item.start);
    this.spans.set(noteId, spans);
  }

  private input(pitch: number, source: string, event: PhysicalEvent): void {
    const key = JSON.stringify([pitch, source]);
    const events = this.events.get(key) ?? [];
    const index = insertSorted(
      events,
      event,
      (item) => item.order,
      (first, second) => Number(!first.span) - Number(!second.span)
    );
    this.events.set(key, events);
    // Keep releases even if their corresponding press has not arrived yet.
    // Only the adjacent press boundaries change when an event is inserted.
    if (event.span) event.span.end = events[index + 1]?.at ?? Infinity;
    const previous = events[index - 1];
    if (previous?.span) previous.span.end = event.at;
  }
}

/** Invalid or historical evidence cannot turn a displayed percentage into course credit. */
export function passingNoteResult(result: NoteResultSnapshot | undefined, hits: number): boolean {
  if (result?.policy !== NOTE_RESULT_POLICY || result.percent === null) return false;
  return (
    Number.isInteger(result.expectedNotes) &&
    result.expectedNotes > 0 &&
    Number.isInteger(result.hitNotes) &&
    result.hitNotes === hits &&
    result.hitNotes <= result.expectedNotes &&
    [result.hitPercent, result.holdPercent, result.percent].every(Number.isFinite) &&
    Math.abs(result.hitPercent - (30 * result.hitNotes) / result.expectedNotes) < 1e-9 &&
    result.holdPercent >= 0 &&
    result.holdPercent <= (70 * result.hitNotes) / result.expectedNotes + 1e-9 &&
    Math.abs(result.percent - result.hitPercent - result.holdPercent) < 1e-9 &&
    result.percent >= COURSE_PASS_PERCENT &&
    result.percent <= 100
  );
}
