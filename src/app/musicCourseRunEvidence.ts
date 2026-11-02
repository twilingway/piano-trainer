import type { Hand } from "../fingering/fingering";
import type { KeyEvent } from "../input/midiInput";
import { MusicInputJournal, MUSIC_INPUT_EVIDENCE_LIMIT } from "../musicLearning/evidence";
import type { MusicInputJournalData, MusicPresentationKind } from "../musicLearning/evidence";
import type { MusicInputSource } from "../musicLearning/progress";
import type { MusicNote } from "../musicLearning/types";
import type { MusicInputTimes } from "../practice/musicPolicy";
import type { PracticeEvent, PracticeSession } from "../practice/session";
import { quartersAt } from "../song/song";

export interface MusicRunInputContext {
  readonly fresh: boolean;
  readonly hand: Hand;
  readonly songBeat: number | undefined;
}
export interface MusicRunInputOutcome {
  readonly events: readonly PracticeEvent[];
  readonly eligible: boolean;
}
const time = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const text = (value: string): boolean =>
  typeof value === "string" && value.length > 0 && value.length <= 512;
const owner = (event: KeyEvent): string =>
  JSON.stringify([event.source, event.deviceId ?? "", event.channel ?? 0, event.pitch]);
export function validMusicRunKey(
  event: KeyEvent
): event is KeyEvent & { readonly source: MusicInputSource } {
  return (
    event.source !== undefined &&
    ["midi", "keyboard", "pointer"].includes(event.source) &&
    ["down", "up"].includes(event.type) &&
    Number.isInteger(event.pitch) &&
    event.pitch >= 0 &&
    event.pitch <= 127 &&
    Number.isFinite(event.velocity) &&
    event.velocity >= 0 &&
    event.velocity <= 127 &&
    (event.deviceId === undefined || text(event.deviceId)) &&
    (event.channel === undefined ||
      (Number.isInteger(event.channel) && event.channel >= 1 && event.channel <= 16)) &&
    (event.source !== "midi" || (event.deviceId !== undefined && event.channel !== undefined))
  );
}

/** Records caller-provided receipts only. It cannot advance, sample or create any clock. */
export class MusicRunRecorder {
  private readonly journal: MusicInputJournal;
  private readonly held = new Map<string, number>();
  private session: PracticeSession | null = null;
  private lastAtMs: number | null = null;
  private shown = false;
  private count = 0;
  constructor(
    identity: { readonly runId: string; readonly presentationId: string },
    private readonly notes: readonly MusicNote[]
  ) {
    this.journal = new MusicInputJournal(identity);
  }
  get valid(): boolean {
    return this.journal.valid;
  }
  private beatAt(session: PracticeSession, atMs: number): number | undefined {
    let seconds = session.songTimeAt(atMs);
    if (seconds === undefined) {
      const segment = session.tempoClockReceipt(atMs).segments.at(-1);
      if (segment)
        seconds = segment.songSeconds + ((atMs - segment.performanceMs) / 1000) * segment.speed;
    }
    return seconds === undefined ? undefined : quartersAt(session.song, seconds);
  }
  observe(session: PracticeSession | null, atMs: number): void {
    if (session) this.session = session;
    if (time(atMs)) this.lastAtMs = Math.max(this.lastAtMs ?? atMs, atMs);
  }
  present(atMs: number, kind: MusicPresentationKind): void {
    this.observe(null, atMs);
    if (!this.shown && this.journal.present(atMs, kind)) this.shown = true;
  }
  seed(events: readonly KeyEvent[], atMs: number, offsetMs: number): void {
    this.observe(null, atMs);
    this.held.clear();
    for (const event of events) {
      const raw = event.timestamp;
      if (!validMusicRunKey(event) || event.type !== "down") continue;
      if (raw !== undefined && time(raw) && raw <= atMs && Number.isFinite(offsetMs)) {
        if (
          this.journal.record({
            kind: "down",
            pitch: event.pitch,
            source: event.source,
            ...(event.deviceId === undefined ? {} : { deviceId: event.deviceId }),
            ...(event.channel === undefined ? {} : { channel: event.channel }),
            rawAtMs: raw,
            correctedAtMs: raw - offsetMs,
            receivedAtMs: atMs,
            songBeat: null,
            eligible: false
          })
        )
          this.count++;
      }
      this.held.set(owner(event), raw ?? atMs);
    }
  }
  input(
    event: KeyEvent,
    session: PracticeSession,
    times: MusicInputTimes,
    receive: (context: MusicRunInputContext) => MusicRunInputOutcome
  ): readonly PracticeEvent[] {
    if (
      !this.valid ||
      !validMusicRunKey(event) ||
      !time(times.raw) ||
      !time(times.received) ||
      !Number.isFinite(times.corrected) ||
      times.corrected < -60_000 ||
      times.corrected > Number.MAX_SAFE_INTEGER ||
      times.received < times.raw ||
      (event.timestamp !== undefined && event.timestamp !== times.raw)
    )
      return [];
    this.observe(session, times.received);
    const songBeat = this.beatAt(session, times.corrected);
    const hand =
      session.nextDue().find((note) => note.pitch === event.pitch)?.hand ??
      this.notes.find((note) => note.pitch === event.pitch)?.hand ??
      "right";
    const id = owner(event),
      previous = this.held.get(id);
    const fresh =
      event.type === "down"
        ? previous === undefined
        : previous !== undefined && times.raw >= previous;
    const entry = {
      kind: event.type,
      pitch: event.pitch,
      source: event.source,
      ...(event.deviceId === undefined ? {} : { deviceId: event.deviceId }),
      ...(event.channel === undefined ? {} : { channel: event.channel }),
      rawAtMs: times.raw,
      correctedAtMs: times.corrected,
      receivedAtMs: times.received,
      songBeat: songBeat ?? null,
      hand
    };
    if (this.count >= MUSIC_INPUT_EVIDENCE_LIMIT) {
      this.journal.record({ ...entry, eligible: false });
      return [];
    }
    if (fresh) {
      if (event.type === "down") this.held.set(id, times.raw);
      else this.held.delete(id);
    }
    const result = receive({ fresh, songBeat, hand });
    if (!this.journal.record({ ...entry, eligible: result.eligible })) return [];
    this.count++;
    return result.events;
  }
  choice(
    value: string,
    source: "keyboard" | "pointer",
    atMs: number | undefined,
    eligible: boolean
  ): boolean {
    const at = atMs ?? this.lastAtMs;
    if (
      !this.valid ||
      !text(value) ||
      at === null ||
      !time(at) ||
      !["keyboard", "pointer"].includes(source)
    )
      return false;
    this.observe(null, at);
    const songBeat = this.session ? this.beatAt(this.session, at) : undefined;
    const recorded = this.journal.record({
      kind: "choice",
      value,
      source,
      rawAtMs: at,
      correctedAtMs: at,
      receivedAtMs: at,
      songBeat: songBeat ?? null,
      eligible
    });
    if (recorded) this.count++;
    return recorded;
  }
  snapshot(): MusicInputJournalData {
    return this.journal.snapshot();
  }
}
