import type { MelodyMidiOutput } from "../input/melodyMidiOutput";
import type { PracticeSession } from "../practice/session";
import { audioTime, cancelScheduledSound, scheduleSound } from "./pianoSound";
import {
  cancelScheduledVoices,
  scheduledClick,
  scheduledNoteOff,
  scheduledNoteOn
} from "./scheduledVoices";
import { startVoiceTrack, stopVoiceTrack, voiceTrackReady } from "./voiceTrack";
export interface SessionMelodyOutput {
  readonly browser: boolean;
  readonly midi?: MelodyMidiOutput | undefined;
}

/** Schedules score events against the session's Performance/Audio anchor. */
export class SessionAudio {
  private output: SessionMelodyOutput = { browser: true };

  configure(output: SessionMelodyOutput, now: number): void {
    this.reset(now);
    this.output = output;
  }

  private anchor = { performance: 0, audio: 0 };
  private readonly scheduled = new Set<string>();
  private readonly jobs = new Set<number>();
  private pump: ReturnType<typeof setInterval> | undefined;
  reset(performanceMs: number): void {
    if (this.pump !== undefined) clearInterval(this.pump);
    this.pump = undefined;
    for (const job of this.jobs) cancelScheduledSound(job);
    this.jobs.clear();
    this.scheduled.clear();
    cancelScheduledVoices();
    this.output.midi?.reset();
    stopVoiceTrack();
    this.anchor = { performance: performanceMs, audio: audioTime() };
  }
  start(session: PracticeSession, now: number, offsetMs: number, metronome: () => boolean): void {
    this.reset(now);
    const pump = () => {
      this.schedule(session, performance.now(), offsetMs, metronome());
    };
    pump();
    this.pump = setInterval(pump, 50);
  }
  schedule(session: PracticeSession, now: number, offsetMs: number, metronome: boolean): void {
    const due = session.options.mode === "wait" ? session.nextDue()[0]?.start : undefined;
    const liveTime = Math.min(session.songTimeAt(now) ?? session.time, due ?? Infinity);
    const horizon = liveTime + (0.3 + Math.max(0, offsetMs) / 1000) * session.options.speed;
    const end = Math.min(horizon, due ?? Infinity, session.options.to ?? Infinity);
    const schedule = (
      id: string,
      songTime: number,
      action: (audioSeconds: number) => void,
      restored = false,
      midiAction?: (timestamp: number) => void
    ) => {
      if (this.scheduled.has(id) || songTime > end || songTime < liveTime - 0.1) return;
      const timestamp = session.performanceTimeAt(songTime) ?? (restored ? now : undefined);
      if (timestamp === undefined) return;
      this.scheduled.add(id);
      midiAction?.(Math.max(now, timestamp - offsetMs));
      if (midiAction && !this.output.browser) return;
      const at = this.anchor.audio + (timestamp - this.anchor.performance - offsetMs) / 1000;
      const job = scheduleSound(Math.max(audioTime(), at), (time) => {
        this.jobs.delete(job);
        action(time);
      });
      this.jobs.add(job);
    };
    // The voice can only follow a song clock that runs at its own pace; until its file
    // is loaded it is retried on every pump, and then starts from the current second.
    const voice = session.song.voice;
    if (
      voice !== undefined &&
      session.options.mode !== "wait" &&
      session.options.speed === 1 &&
      voiceTrackReady(voice)
    ) {
      const from = Math.max(0, liveTime);
      schedule(
        "voice",
        from,
        (at) => {
          startVoiceTrack(voice, at, from);
        },
        liveTime > 0
      );
      const to = session.options.to;
      if (to !== undefined)
        schedule("voice-off", to, (at) => {
          stopVoiceTrack(at);
        });
    }
    for (const note of session.song.notes) {
      if (
        !session.accompanies(note) ||
        note.start < session.startedFrom ||
        note.start >= (session.options.to ?? Infinity)
      )
        continue;
      if (note.start > end) break;
      const restore = note.start < liveTime && note.start + note.duration > liveTime;
      schedule(
        `on:${note.id}`,
        restore ? liveTime : note.start,
        (at) => {
          if (restore)
            scheduledNoteOn(
              note.pitch,
              note.velocity,
              at,
              note.id,
              (liveTime - note.start) / session.options.speed
            );
          else scheduledNoteOn(note.pitch, note.velocity, at, note.id);
        },
        restore,
        (at) => {
          this.output.midi?.noteOn(note.pitch, note.velocity ?? 100, at, note.id);
        }
      );
      schedule(
        `off:${note.id}`,
        Math.min(note.start + note.duration, session.options.to ?? Infinity),
        (at) => {
          scheduledNoteOff(note.pitch, at, note.id);
        },
        false,
        (at) => {
          this.output.midi?.noteOff(note.pitch, at, note.id);
        }
      );
    }
    if (metronome)
      for (const [index, beat] of session.audioBeats.entries()) {
        if (
          beat.time < session.startedFrom - session.leadInSeconds ||
          (session.options.countInBeats !== undefined && beat.time >= session.song.duration)
        )
          continue;
        schedule(`beat:${String(index)}`, beat.time, (at) => {
          scheduledClick(beat.downbeat, at);
        });
      }
  }
}
