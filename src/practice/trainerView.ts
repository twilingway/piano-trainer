import type { FallingNotesView } from "../render/FallingNotesView";
import { quartersAt, type SongNote } from "../song/song";
import type { PracticeSession } from "./session";
import type { PracticeEvent } from "./practiceTypes";
import type { ComboBoard, ComboCounter, GradedStrike } from "./combo";
import { trainerGuidance } from "./readingPolicy";
import type { TrainerCourse } from "./trainerCourse";

const NOTHING: ReadonlySet<number> = new Set();

interface GuidedScene {
  readonly playing: boolean;
  readonly effectEpoch?: number;
  readonly performance: boolean;
  readonly visualOffsetMs: number;
  readonly course: TrainerCourse | null;
  readonly pressed: ReadonlySet<number>;
  readonly sounding: ReadonlySet<number>;
  readonly colorOf: ((note: SongNote) => number | undefined) | undefined;
  readonly board: ComboBoard;
  readonly graded: readonly GradedStrike[];
  readonly onLights: ((pitches: readonly number[]) => void) | undefined;
}

export function drawGuidedTrainerScene(
  view: FallingNotesView,
  session: PracticeSession,
  scene: GuidedScene,
  now: number
): void {
  const { course } = scene;
  const guidance = course
    ? course.guidance(session, scene.playing, scene.performance)
    : trainerGuidance(session, null, scene.playing, scene.performance);
  scene.onLights?.(guidance.lights);
  drawTrainerScene(
    view,
    session,
    scene.visualOffsetMs,
    {
      ...guidance.frame,
      playing: scene.playing,
      effectEpoch: scene.effectEpoch ?? 0,
      pressed: scene.pressed,
      sounding: scene.sounding,
      colorOf: scene.colorOf,
      board: scene.board,
      graded: course?.ownsInput ? [] : scene.graded
    },
    course?.statusOf
  );
  course?.cuePresented(guidance.lights, now);
}

type TrainerDraw = Parameters<FallingNotesView["draw"]>[0];
type SceneOverrides = Omit<
  TrainerDraw,
  "time" | "hintTime" | "hintSpeed" | "lookAhead" | "statusOf" | "owedNoteId" | "hands" | "owns"
>;

export function drawTrainerScene(
  view: FallingNotesView,
  session: PracticeSession,
  visualOffsetMs: number,
  overrides: SceneOverrides,
  statusOf?: (id: string) => ReturnType<PracticeSession["statusOf"]>
): void {
  view.draw({
    time: session.time - (visualOffsetMs / 1000) * session.options.speed,
    hintTime: session.time,
    hintSpeed: session.options.speed,
    ...overrides,
    lookAhead: 2,
    statusOf: statusOf ?? ((id) => session.statusOf(id)),
    owedNoteId: session.owedNote()?.id,
    hands: session.options.hands,
    owns: session.owns
  });
}

export function trainerGrade(
  event: Extract<PracticeEvent, { type: "hit" | "miss" | "wrong" }>,
  combo: ComboCounter,
  pitchOf: ReadonlyMap<string, number>
): GradedStrike | undefined {
  const grade = combo.record(event);
  const pitch = event.type === "wrong" ? event.pitch : pitchOf.get(event.noteId);
  return grade && pitch !== undefined
    ? {
        grade,
        pitch,
        ...(event.type === "hit" ? { offsetMs: event.offset * 1000, assisted: event.assisted } : {})
      }
    : undefined;
}

export function trainerQuarters(
  session: PracticeSession | undefined,
  visualOffsetMs: number,
  clampEnd: boolean
): number {
  return session
    ? quartersAt(
        session.song,
        Math.min(session.time, clampEnd ? session.song.duration : Infinity) -
          (visualOffsetMs / 1000) * session.options.speed
      )
    : 0;
}

export function drawTrainerMirror(
  mirror:
    | { readonly view: FallingNotesView; readonly colorOf: (note: SongNote) => number | undefined }
    | undefined,
  session: PracticeSession
): void {
  mirror?.view.draw({
    time: session.time,
    hintTime: session.time,
    hintSpeed: session.options.speed,
    hintNotes: [],
    lookAhead: 2,
    statusOf: () => undefined,
    pressed: NOTHING,
    sounding: NOTHING,
    due: [],
    hands: session.options.hands,
    owns: session.owns,
    colorOf: mirror.colorOf
  });
}
