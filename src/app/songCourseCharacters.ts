import type { KeyEvent } from "../input/midiInput";
import type { MusicInputTimes } from "../practice/musicPolicy";
import type { PracticeEvent, PracticeSession } from "../practice/session";
import {
  courseCharacterPresentation,
  type CourseCharacterPresentation,
  type CourseCharacterExpression
} from "../songCourse/characterPresentation";
import type { CourseMaterial } from "../songCourse/model";
import type { SongCourseFeedbackSource, SongCourseFaceSnapshot } from "../staff/songCourseFeedback";
import { courseInputKey } from "./songCourseGuidance";

export interface SongCourseCharacterContext {
  readonly material: CourseMaterial | null;
  readonly phase: string;
  readonly presentationId: string;
  readonly runId: string | null;
}
export function songCourseCharacterContext(
  view: Pick<SongCourseCharacterContext, "material" | "phase">,
  presentationId: string,
  runId: string | null
): SongCourseCharacterContext {
  return { material: view.material, phase: view.phase, presentationId, runId };
}
export interface SongCourseCharacterSnapshot extends CourseCharacterPresentation {
  readonly presentationId: string | null;
  readonly runId: string | null;
  readonly sourceHash: string | null;
  readonly visible: boolean;
}
interface PhysicalPosition {
  readonly raw: number;
  readonly ordinal: number;
  readonly sourceNoteId: string | null;
}
const EMPTY: SongCourseCharacterSnapshot = {
  presentationId: null,
  runId: null,
  sourceHash: null,
  targetSourceNoteId: null,
  companion: null,
  expression: "neutral",
  teacherPose: "idle",
  visible: true
};

/** A visual event tap. It owns no musical time, scoring evidence or persistent state. */
export class SongCourseCharacters {
  private context: SongCourseCharacterContext | null = null;
  private current = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly physical = new Map<string, PhysicalPosition>();
  private boundSession: PracticeSession | null = null;
  private feedbackSnapshot: SongCourseFaceSnapshot | null = null;
  private visible = true;
  private playing = false;
  private time = 0;
  private ordinal = 0;
  private target: string | null = null;
  private expression: CourseCharacterExpression = "neutral";

  constructor(
    private readonly readContext: () => SongCourseCharacterContext,
    private readonly feedback: SongCourseFeedbackSource
  ) {}

  readonly read = (): SongCourseCharacterSnapshot => this.current;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  syncContext(): void {
    const next = this.readContext();
    const previous = this.context;
    const changed =
      previous?.material !== next.material ||
      previous.presentationId !== next.presentationId ||
      previous.runId !== next.runId;
    this.context = next;
    if (changed) {
      this.physical.clear();
      this.boundSession = null;
      this.ordinal = 0;
      this.time = 0;
      this.playing = false;
      this.target = next.material?.expected[0]?.sourceNoteId ?? null;
      this.expression = "neutral";
      this.feedbackSnapshot = this.feedback.read();
    }
    if (!["playing", "demo", "awaiting-release"].includes(next.phase)) {
      this.physical.clear();
      this.playing = false;
      this.expression = "neutral";
    }
    this.publish();
  }

  bind(session: PracticeSession): void {
    this.syncContext();
    const context = this.context;
    if (session.song !== context?.material?.song) return;
    if (this.boundSession !== session) this.physical.clear();
    this.boundSession = session;
    this.time = session.time;
    this.playing = true;
    this.publish();
  }

  frame(session: PracticeSession, playing: boolean): void {
    this.syncContext();
    if (!this.isCurrent(session)) return;
    this.time = session.time;
    this.playing = playing;
    if (this.context?.phase === "demo") {
      const expected = this.context.material?.expected;
      const sounding = expected?.find(
        (note) => session.time >= note.start && session.time < note.start + note.duration
      );
      if (sounding && sounding.sourceNoteId !== this.target) {
        this.target = sounding.sourceNoteId;
        this.expression = "neutral";
      }
    }
    this.publish();
  }

  key(
    event: KeyEvent,
    session: PracticeSession,
    playing: boolean,
    times: MusicInputTimes,
    events: readonly PracticeEvent[]
  ): void {
    this.syncContext();
    if (!this.isCurrent(session) || !Number.isFinite(times.raw)) return;
    const key = courseInputKey(event);
    const previous = this.physical.get(key);
    const ordinal = ++this.ordinal;
    if (
      previous &&
      (times.raw < previous.raw || (times.raw === previous.raw && ordinal <= previous.ordinal))
    ) {
      this.feedbackSnapshot = this.feedback.read();
      return;
    }
    this.time = session.time;
    this.playing = playing;
    let sourceNoteId: string | null = null;
    if (event.type === "down" && times.admitted && playing) {
      const hit = events.find((item) => item.type === "hit");
      const matched =
        hit?.type === "hit"
          ? this.context?.material?.expected.find(
              (note) => note.runtimeNoteId === hit.noteId && note.pitch === event.pitch
            )
          : undefined;
      sourceNoteId = matched?.sourceNoteId ?? null;
      if (sourceNoteId && sourceNoteId !== this.target) {
        this.target = sourceNoteId;
        this.expression = "neutral";
      }
    }
    if (event.type === "down" && previous?.sourceNoteId && !sourceNoteId)
      sourceNoteId = previous.sourceNoteId;
    this.physical.set(key, { raw: times.raw, ordinal, sourceNoteId });
    this.refreshFeedback();
    this.publish();
  }

  cancel(): void {
    this.physical.clear();
    this.playing = false;
    this.expression = "neutral";
    this.publish();
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.physical.clear();
    this.expression = "neutral";
    this.publish();
  }

  dispose(): void {
    this.physical.clear();
    this.boundSession = null;
    this.listeners.clear();
    this.context = null;
    this.current = EMPTY;
  }

  private isCurrent(session: PracticeSession): boolean {
    return this.boundSession === session && session.song === this.context?.material?.song;
  }

  private refreshFeedback(): void {
    const after = this.feedback.read();
    const before = this.feedbackSnapshot;
    this.feedbackSnapshot = after;
    const context = this.context;
    if (
      !after ||
      !context?.material ||
      after.presentationId !== context.presentationId ||
      after.runId !== context.runId ||
      after.sourceHash !== context.material.source.sourceHash
    )
      return;
    let selected = null as (typeof after.notes)[number] | null;
    for (const note of after.notes) {
      const old = before?.notes.find((value) => value.sourceNoteId === note.sourceNoteId);
      if (old?.state === note.state && old.reason === note.reason) continue;
      if (note.sourceNoteId === this.target) {
        selected = note;
        break;
      }
      selected = note;
    }
    if (!selected) return;
    if (selected.sourceNoteId !== this.target) {
      this.target = selected.sourceNoteId;
      this.expression = "neutral";
    }
    this.expression = selected.state;
  }

  private publish(): void {
    const context = this.context;
    let heldSourceNoteId: string | null = null;
    for (const position of this.physical.values()) {
      if (!position.sourceNoteId) continue;
      if (heldSourceNoteId !== null) {
        heldSourceNoteId = null;
        break;
      }
      heldSourceNoteId = position.sourceNoteId;
    }
    const presentation = courseCharacterPresentation({
      material: context?.material ?? null,
      phase: context?.phase ?? "ready",
      visible: this.visible,
      playing: this.playing,
      songTime: this.time,
      targetSourceNoteId: this.target,
      heldSourceNoteId,
      expression: this.expression
    });
    const next: SongCourseCharacterSnapshot = {
      ...presentation,
      presentationId: context?.material ? context.presentationId : null,
      runId: context?.runId ?? null,
      sourceHash: context?.material?.source.sourceHash ?? null,
      visible: this.visible
    };
    if (
      (Object.keys(next) as (keyof SongCourseCharacterSnapshot)[]).every(
        (key) => next[key] === this.current[key]
      )
    )
      return;
    this.current = next;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Decoration cannot interrupt input or grading. */
      }
    }
  }
}
