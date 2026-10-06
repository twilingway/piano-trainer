import type { PracticeSession } from "../practice/session";
import { audioTime, cancelScheduledSound, scheduleSound } from "./pianoSound";
import {
  cancelScheduledVoices,
  scheduledClick,
  scheduledNoteOff,
  scheduledNoteOn
} from "./scheduledVoices";
/** Schedules score events against the session's Performance/Audio anchor. */
export class SessionAudio {
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
      restored = false
    ) => {
      if (this.scheduled.has(id) || songTime > end || songTime < liveTime - 0.1) return;
      const timestamp = session.performanceTimeAt(songTime) ?? (restored ? now : undefined);
      if (timestamp === undefined) return;
      this.scheduled.add(id);
      const at = this.anchor.audio + (timestamp - this.anchor.performance - offsetMs) / 1000;
      const job = scheduleSound(Math.max(audioTime(), at), (time) => {
        this.jobs.delete(job);
        action(time);
      });
      this.jobs.add(job);
    };
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
        restore
      );
      schedule(
        `off:${note.id}`,
        Math.min(note.start + note.duration, session.options.to ?? Infinity),
        (at) => {
          scheduledNoteOff(note.pitch, at, note.id);
        }
      );
    }
    if (metronome)
      for (const [index, beat] of session.audioBeats.entries()) {
        if (beat.time < session.startedFrom - 2) continue;
        schedule(`beat:${String(index)}`, beat.time, (at) => {
          scheduledClick(beat.downbeat, at);
        });
      }
  }
}
