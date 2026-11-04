import { physicalCourseOrder } from "../songCourse/hold";
import type { CourseNoteFeedback } from "../songCourse/provisional";
import type { KeyEvent } from "../input/midiInput";
import type { Trainer } from "../practice/Trainer";
import type { PracticeEvent, PracticeSession } from "../practice/session";
import type { MusicInputTimes } from "../practice/musicPolicy";
import type { SongCourseAttempt } from "../songCourse/attempt";
import type { CourseMaterial } from "../songCourse/model";
import { courseInputKey, courseInputSource } from "./songCourseGuidance";

interface InputOwner {
  readonly attempt: SongCourseAttempt | null;
  readonly material: CourseMaterial | null;
  readonly trainer: Trainer | null;
  readonly demo: boolean;
}
const NO_EVENTS: readonly PracticeEvent[] = [];
/** Physical evidence survives an intentional transport pause; cleanup never masquerades as key-up. */
export class SongCourseInput {
  private ordinal = 0;
  private presented = new Set<string>();
  private physical = new Map<
    string,
    { type: KeyEvent["type"]; performanceMs: number; stableOrdinal: number }
  >();
  private physicalOrdinal = 0;
  constructor(
    private readonly read: () => InputOwner,
    private readonly publish: () => void,
    private readonly preheld: () => void,
    private readonly feedback: (
      notes: readonly CourseNoteFeedback[],
      ordinal: number
    ) => void = () => undefined
  ) {}
  reset(): void {
    this.ordinal = 0;
    this.presented.clear();
  }
  clear(): void {
    this.physical.clear();
  }
  nextOrdinal(): number {
    return ++this.ordinal;
  }
  seed(held: readonly KeyEvent[]): void {
    this.physical = new Map(
      held.map((event) => [
        courseInputKey(event),
        {
          type: event.type,
          performanceMs: event.timestamp ?? -Infinity,
          stableOrdinal: ++this.physicalOrdinal
        }
      ])
    );
  }
  start(session: PracticeSession, atMs: number, held: readonly KeyEvent[]): boolean {
    const { attempt, demo } = this.read();
    if (demo) return true;
    if (!attempt) return false;
    if (attempt.phase === "paused" || attempt.phase === "awaiting-keys-up") {
      const resume = attempt.requestResume(atMs, this.nextOrdinal());
      this.publish();
      return resume;
    }
    if (["awaiting-rehold", "awaiting-release"].includes(attempt.phase)) return false;
    if (held.length && !attempt.rawInputs.length) {
      attempt.abort("preheld");
      this.preheld();
      return false;
    }
    if (attempt.phase === "playing") {
      this.present(session, atMs);
      return true;
    }
    return false;
  }
  key(
    event: KeyEvent,
    session: PracticeSession,
    playing: boolean,
    times: MusicInputTimes
  ): readonly PracticeEvent[] {
    const key = courseInputKey(event),
      previous = this.physical.get(key),
      held = previous?.type === "down";
    const position = {
      type: event.type,
      performanceMs: times.raw,
      stableOrdinal: ++this.physicalOrdinal
    };
    if (!previous || physicalCourseOrder(position, previous) > 0) this.physical.set(key, position);
    const { attempt, demo, trainer, material } = this.read();
    if (!attempt || demo || attempt.phase === "complete" || attempt.phase === "aborted")
      return NO_EVENTS;
    this.present(session, times.received);
    const songTime = session.songTimeAt(times.corrected) ?? session.time;
    const decision = attempt.input({
      type: event.type,
      source: courseInputSource(event),
      pitch: event.pitch,
      performanceMs: times.corrected,
      rawPerformanceMs: times.raw,
      stableOrdinal: ++this.ordinal,
      songTime,
      admitted: times.admitted
    });
    if (decision.feedback?.length) this.feedback(decision.feedback, this.ordinal);
    if (decision.resumeTransport) trainer?.setPlaying(true);
    if (decision.controlRehold) {
      this.publish();
      return NO_EVENTS;
    }
    let events = NO_EVENTS;
    if (event.type === "up")
      events = session.releaseKeyAt(event.pitch, times.corrected, courseInputSource(event));
    else if (
      !held &&
      playing &&
      times.admitted &&
      attempt.phase === "playing" &&
      (attempt.config.mode !== "wait" ||
        (decision.matchedSourceNoteId !== undefined &&
          decision.matchedSourceNoteId ===
            material?.runtimeToSource.get(session.owedNote()?.id ?? "")))
    )
      events = session.pressKeyAt(
        event.pitch,
        times.corrected,
        times.received,
        courseInputSource(event)
      );
    this.publish();
    return events;
  }
  present(session: PracticeSession, atMs: number): void {
    const { attempt, material } = this.read();
    if (attempt?.config.mode !== "wait" || !session.waiting) return;
    const runtimeId = session.owedNote()?.id,
      sourceId = runtimeId && material?.runtimeToSource.get(runtimeId);
    if (sourceId && !this.presented.has(sourceId)) {
      this.presented.add(sourceId);
      attempt.present(sourceId, atMs, ++this.ordinal);
    }
  }
}
