import { courseHoldCue, type CourseHoldCue } from "../songCourse/holdCue";
import type { CourseExpectedNote } from "../songCourse/model";

interface HeldNote {
  readonly note: CourseExpectedNote;
  readonly key: string;
  segmentStart: number;
  elapsed: number;
  progress: number;
  paused: boolean;
}

/** Transient musical segments only. Physical acceptance and lifecycle belong to the owning policy. */
export class SongCourseHold {
  private current: HeldNote | null = null;

  accept(note: CourseExpectedNote, key: string, songTime: number): void {
    if (!Number.isFinite(songTime) || !(note.duration > 0)) return;
    this.current = { note, key, segmentStart: songTime, elapsed: 0, progress: 0, paused: false };
  }
  pause(songTime: number): void {
    const hold = this.current;
    if (!hold || hold.paused) return;
    hold.elapsed += Math.max(0, songTime - hold.segmentStart);
    hold.paused = true;
  }
  resume(key: string, songTime: number): string | null {
    const hold = this.current;
    if (!hold?.paused || hold.key !== key || !Number.isFinite(songTime)) return null;
    hold.segmentStart = songTime;
    hold.paused = false;
    return hold.note.sourceNoteId;
  }
  release(key: string, duringPause: boolean): void {
    if (this.current?.key === key && !duringPause) this.clear();
  }
  clear(): void {
    this.current = null;
  }
  read(songTime: number): CourseHoldCue | null {
    const hold = this.current;
    if (!hold) return null;
    const elapsed = hold.elapsed + (hold.paused ? 0 : Math.max(0, songTime - hold.segmentStart));
    const cue = courseHoldCue(hold.note, elapsed, hold.progress, hold.paused);
    if (cue) hold.progress = cue.progress;
    return cue;
  }
}
