import type { FallingNotesView } from "../render/FallingNotesView";
import { quartersAt, type SongNote } from "../song/song";
import type { PracticeSession } from "./session";
import type { PracticeEvent } from "./practiceTypes";
import type { ComboBoard, ComboCounter, GradedStrike } from "./combo";
import { trainerGuidance, type TrainerReadingPolicy } from "./readingPolicy";
import { pairGuidance, type TrainerPairPolicy } from "./twoHandPolicy";
import type { TrainerHeldBassPolicy } from "./heldBassPolicy";
import {
  independentRhythmGuidance,
  type TrainerIndependentRhythmPolicy
} from "./independentRhythmPolicy";

const NOTHING: ReadonlySet<number> = new Set();

interface GuidedScene {
  readonly playing: boolean;
  readonly performance: boolean;
  readonly visualOffsetMs: number;
  readonly reading: TrainerReadingPolicy | null;
  readonly scoped: TrainerPairPolicy | TrainerHeldBassPolicy | null;
  readonly rhythm: boolean;
  readonly independentRhythm: TrainerIndependentRhythmPolicy | null;
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
  const { independentRhythm, scoped, reading } = scene;
  const guidance = independentRhythm
    ? independentRhythmGuidance(independentRhythm)
    : scoped
      ? pairGuidance(session, scoped, scene.playing)
      : trainerGuidance(session, reading, scene.playing, scene.performance);
  scene.onLights?.(guidance.lights);
  drawTrainerScene(
    view,
    session,
    scene.visualOffsetMs,
    {
      ...guidance.frame,
      pressed: scene.pressed,
      sounding: scene.sounding,
      colorOf: scene.colorOf,
      board: scene.board,
      graded: scene.rhythm || scoped || independentRhythm ? [] : scene.graded
    },
    independentRhythm?.statusOf
  );
  const cue = guidance.lights[0];
  if (cue !== undefined) reading?.onCuePresented?.(cue, now);
  if (guidance.lights.length > 0) {
    scoped?.onCuePresented?.(guidance.lights, now);
    independentRhythm?.onCuePresented?.(guidance.lights, now);
  }
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
