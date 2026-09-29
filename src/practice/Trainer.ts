import { soundAllOff, soundClick, soundNoteOff, soundNoteOn } from "../audio/pianoSound";
import type { KeyEvent } from "../input/midiInput";
import type { FallingNotesView } from "../render/FallingNotesView";
import type { Song } from "../song/song";
import { PracticeSession } from "./session";
import type { PracticeEvent, PracticeOptions, PracticeStats } from "./session";

export interface TrainerSnapshot {
  readonly playing: boolean;
  readonly waiting: boolean;
  readonly finished: boolean;
  readonly time: number;
  /** Beat of the last note that has started; what the staff cursor follows. */
  readonly beat: number;
  readonly stats: PracticeStats;
}

/** Song seconds visible above the hit line. */
const LOOK_AHEAD_S = 3;
const SNAPSHOT_INTERVAL_MS = 150;

/** Beat of the latest note that has started by `time`; notes are sorted by start. */
export function beatAt(song: Song, time: number): number {
  let low = 0;
  let high = song.notes.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const note = song.notes[middle];
    if (!note) break;
    if (note.start <= time) {
      found = note.startBeat;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * Glue between the pure session, the picture, the sound and the keys. Owns
 * the frame loop; React only reads throttled snapshots and sends commands.
 */
export class Trainer {
  onSnapshot: ((snapshot: TrainerSnapshot) => void) | undefined;
  metronome = false;

  private session: PracticeSession | undefined;
  private playing = false;
  private readonly pressed = new Set<number>();
  private readonly sounding = new Set<number>();
  private sinceSnapshot = 0;
  private lastBeat = -1;
  private readonly view: FallingNotesView;

  constructor(view: FallingNotesView) {
    this.view = view;
    view.onTick((deltaMs) => {
      this.frame(deltaMs);
    });
  }

  load(song: Song, options: PracticeOptions): void {
    this.silence();
    this.session = new PracticeSession(song, options);
    this.playing = false;
    this.view.setSong(song);
    this.lastBeat = -1;
    this.publish();
  }

  /** Restarts the run from song time `from`, keeping play or pause as it was. */
  seek(from: number): void {
    if (!this.session) return;
    this.silence();
    this.session.seek(from);
    this.publish();
  }

  setPlaying(playing: boolean): void {
    this.playing = playing && this.session?.finished !== true;
    if (!this.playing) this.silence();
    this.publish();
  }

  key(event: KeyEvent): void {
    if (event.type === "down") this.pressed.add(event.pitch);
    else this.pressed.delete(event.pitch);
    if (event.type === "down" && this.playing && this.session) {
      this.apply(this.session.pressKey(event.pitch));
      this.publish();
    }
  }

  private frame(deltaMs: number): void {
    const session = this.session;
    if (!session) return;
    if (this.playing) {
      // A tab in the background delivers one huge frame; don't let it skip the song.
      this.apply(session.advance(Math.min(deltaMs, 100) / 1000));
    }
    this.view.draw({
      time: session.time,
      lookAhead: LOOK_AHEAD_S,
      statusOf: (id) => session.statusOf(id),
      pressed: this.pressed,
      sounding: this.sounding,
      due: this.playing || session.time < 0 ? session.nextDue() : [],
      hands: session.options.hands
    });
    this.sinceSnapshot += deltaMs;
    const beat = beatAt(session.song, session.time);
    if (this.sinceSnapshot >= SNAPSHOT_INTERVAL_MS || beat !== this.lastBeat) this.publish();
  }

  private apply(events: readonly PracticeEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "autoNoteOn":
          this.sounding.add(event.pitch);
          soundNoteOn(event.pitch);
          break;
        case "autoNoteOff":
          this.sounding.delete(event.pitch);
          soundNoteOff(event.pitch);
          break;
        case "beat":
          if (this.metronome) soundClick(event.downbeat);
          break;
        case "finished":
          this.playing = false;
          break;
        case "hit":
        case "miss":
        case "wrong":
          break;
      }
    }
  }

  private silence(): void {
    if (this.session) this.apply(this.session.stopAuto());
    this.sounding.clear();
    soundAllOff();
  }

  private publish(): void {
    const session = this.session;
    if (!session) return;
    this.sinceSnapshot = 0;
    this.lastBeat = beatAt(session.song, session.time);
    this.onSnapshot?.({
      playing: this.playing,
      waiting: session.waiting,
      finished: session.finished,
      time: session.time,
      beat: this.lastBeat,
      stats: session.stats()
    });
  }
}
