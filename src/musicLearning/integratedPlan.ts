import { normalizeReadingSeed } from "../reading/generator";
import { generateDictation } from "./dictation";
import type { DictationExercise } from "./dictation";
import { buildTriad, createHarmonyTriadExercise } from "./harmony";
import { createMusicExercise } from "./material";
import { musicChoice, musicRandom } from "./random";
import { generateSightReading } from "./sightReading";
import type { SightReadingExercise } from "./sightReading";
import type { MusicExercise, MusicNote, MusicPurpose } from "./types";

export const INTEGRATED_PLAN_VERSION = 1;
export const INTEGRATED_PHASE_IDS = [
  "find-keys",
  "read-melody",
  "heard-rhythm",
  "heard-intervals",
  "build-chords",
  "play-piece",
  "final-control"
] as const;
export type IntegratedPhaseId = (typeof INTEGRATED_PHASE_IDS)[number];
export type IntegratedSkill =
  "keyboard" | "reading" | "rhythm" | "interval" | "harmony" | "coordination";

interface ActivityBase {
  readonly id: string;
  readonly skill: IntegratedSkill;
  readonly purpose: MusicPurpose;
  readonly noveltyRequired: boolean;
  readonly auditory: boolean;
  readonly expectedUnits: number;
  readonly exercise: MusicExercise;
}
export type IntegratedActivity = ActivityBase &
  (
    | { readonly kind: "find-key"; readonly targetPitch: number }
    | { readonly kind: "sight-reading"; readonly exercise: SightReadingExercise }
    | { readonly kind: "rhythm"; readonly exercise: DictationExercise }
    | {
        readonly kind: "interval";
        readonly anchorPitch: number;
        readonly semitones: 4 | 7;
        readonly intervalNumber: 3 | 5;
      }
    | { readonly kind: "harmony"; readonly roots: readonly number[] }
    | { readonly kind: "piece" }
  );
export interface IntegratedPhase {
  readonly id: IntegratedPhaseId;
  readonly activities: readonly IntegratedActivity[];
}
export interface IntegratedPlan {
  readonly id: string;
  readonly theme: "c-major";
  readonly version: 1;
  readonly seed: number;
  readonly bpm: number;
  readonly phases: readonly IntegratedPhase[];
}
export interface IntegratedPlanOptions {
  readonly seed: number;
  readonly theme?: "c-major";
  readonly version?: number;
  readonly bpm?: number;
}

/** Plans contain actual source music; the shell supplies presentation and child controllers. */
export function createIntegratedPlan(options: IntegratedPlanOptions): IntegratedPlan {
  if (options.theme !== undefined && !["c-major"].includes(options.theme))
    throw new RangeError("Unsupported integrated theme");
  if (options.version !== undefined && options.version !== INTEGRATED_PLAN_VERSION)
    throw new RangeError("Unsupported integrated plan version");
  const seed = normalizeReadingSeed(options.seed);
  const bpm = options.bpm ?? 72;
  const random = musicRandom(seed);
  const nextSeed = (): number => Math.floor(random() * 4_294_967_296);
  const id = `integrated-v1-c-major-${String(seed)}-${String(bpm)}`;
  const material = (suffix: string, notes: readonly MusicNote[]): MusicExercise =>
    createMusicExercise({ id: `${id}-${suffix}`, seed: nextSeed(), bpm, notes });
  const activity = (
    suffix: string,
    skill: IntegratedSkill,
    exercise: MusicExercise,
    expectedUnits: number,
    auditory = false,
    control = false
  ): ActivityBase => ({
    id: `${id}-${suffix}`,
    skill,
    exercise,
    expectedUnits,
    auditory,
    purpose: control ? "control" : "training",
    noveltyRequired: control
  });
  const find = [60, 62, 64, 65, 67].map((pitch): IntegratedActivity => {
    const suffix = `key-${String(pitch)}`;
    const exercise = material(suffix, [{ pitch, startBeat: 0, durationBeats: 1, hand: "right" }]);
    return { ...activity(suffix, "keyboard", exercise, 1), kind: "find-key", targetPitch: pitch };
  });
  const reading = generateSightReading({
    seed: nextSeed(),
    level: "steps",
    purpose: "training",
    bpm
  });
  const heardRhythm = (): DictationExercise =>
    generateDictation({
      seed: nextSeed(),
      length: 4,
      bpm,
      startMode: "known",
      studiedPitches: [60],
      studiedDurations: [0.5, 1, 2]
    });
  const rhythm = heardRhythm();
  const intervals = ([4, 7] as const).map((semitones): IntegratedActivity => {
    const suffix = `interval-${String(semitones)}`;
    const exercise = material(
      suffix,
      [60, 60 + semitones].map((pitch, index) => ({
        pitch,
        startBeat: index,
        durationBeats: 1,
        hand: "right"
      }))
    );
    return {
      ...activity(suffix, "interval", exercise, 2, true),
      kind: "interval",
      anchorPitch: 60,
      semitones,
      intervalNumber: semitones === 4 ? 3 : 5
    };
  });
  const chords = [60, 65, 67].map((root): IntegratedActivity => {
    const suffix = `chord-${String(root)}`;
    const { exercise } = createHarmonyTriadExercise({
      id: `${id}-${suffix}`,
      seed: nextSeed(),
      bpm,
      root,
      quality: "major",
      fifths: 0
    });
    return { ...activity(suffix, "harmony", exercise, 1), kind: "harmony", roots: [root] };
  });
  const piece = generateSightReading({
    seed: nextSeed(),
    level: "two-hands",
    purpose: "training",
    bpm
  });
  let finalReading = generateSightReading({
    seed: nextSeed(),
    level: "two-hands",
    purpose: "control",
    bpm
  });
  for (
    let attempt = 0;
    [reading.fingerprint, piece.fingerprint].includes(finalReading.fingerprint);
    attempt++
  ) {
    if (attempt >= 4096) throw new RangeError("Integrated reading novelty exhausted");
    finalReading = generateSightReading({
      seed: nextSeed(),
      level: "two-hands",
      purpose: "control",
      bpm
    });
  }
  let finalRhythm = heardRhythm();
  for (let attempt = 0; finalRhythm.fingerprint === rhythm.fingerprint; attempt++) {
    if (attempt >= 4096) throw new RangeError("Integrated rhythm novelty exhausted");
    finalRhythm = heardRhythm();
  }
  const { roots: finalRoots, exercise: finalHarmony } = createIntegratedHarmonyControl(
    nextSeed(),
    bpm,
    `${id}-final-chords`
  );
  return {
    id,
    theme: "c-major",
    version: 1,
    seed,
    bpm,
    phases: [
      { id: "find-keys", activities: find },
      {
        id: "read-melody",
        activities: [
          {
            ...activity("reading", "reading", reading, reading.notes.length),
            kind: "sight-reading",
            exercise: reading,
            noveltyRequired: true
          }
        ]
      },
      {
        id: "heard-rhythm",
        activities: [
          {
            ...activity("rhythm", "rhythm", rhythm, rhythm.notes.length, true),
            kind: "rhythm",
            exercise: rhythm
          }
        ]
      },
      { id: "heard-intervals", activities: intervals },
      { id: "build-chords", activities: chords },
      {
        id: "play-piece",
        activities: [
          { ...activity("piece", "coordination", piece, piece.notes.length), kind: "piece" }
        ]
      },
      {
        id: "final-control",
        activities: [
          {
            ...activity(
              "final-reading",
              "reading",
              finalReading,
              finalReading.notes.length,
              false,
              true
            ),
            kind: "sight-reading",
            exercise: finalReading
          },
          {
            ...activity(
              "final-rhythm",
              "rhythm",
              finalRhythm,
              finalRhythm.notes.length,
              true,
              true
            ),
            kind: "rhythm",
            exercise: finalRhythm
          },
          {
            ...activity("final-harmony", "harmony", finalHarmony, finalRoots.length, false, true),
            kind: "harmony",
            roots: finalRoots
          }
        ]
      }
    ]
  };
}

/** Rebuild a not-yet-presented novel child from a small persistable seed recipe. */
export function regenerateIntegratedActivity(
  activity: IntegratedActivity,
  seed: number
): IntegratedActivity {
  if (!activity.noveltyRequired)
    throw new RangeError("Only novel integrated activities can be replaced");
  const normalizedSeed = normalizeReadingSeed(seed);
  const bpm = activity.exercise.bpm;
  if (activity.kind === "sight-reading") {
    return {
      ...activity,
      exercise: generateSightReading({
        seed: normalizedSeed,
        bpm,
        purpose: activity.purpose,
        level: activity.exercise.level,
        learnedIntervals: activity.exercise.learnedIntervals
      })
    };
  }
  if (activity.kind === "rhythm") {
    return {
      ...activity,
      exercise: generateDictation({
        seed: normalizedSeed,
        bpm,
        length: activity.exercise.notes.length,
        startMode: activity.exercise.startMode,
        studiedPitches: [60],
        studiedDurations: [0.5, 1, 2]
      })
    };
  }
  if (activity.kind === "harmony") {
    const { roots, exercise } = createIntegratedHarmonyControl(
      normalizedSeed,
      bpm,
      activity.exercise.id
    );
    return { ...activity, roots, exercise };
  }
  throw new RangeError("Unsupported integrated novelty kind");
}

function createIntegratedHarmonyControl(
  seed: number,
  bpm: number,
  id: string
): { readonly roots: readonly number[]; readonly exercise: MusicExercise } {
  const random = musicRandom(seed);
  const roots = [
    ...musicChoice(
      [
        [60, 65, 67],
        [60, 67, 65],
        [65, 60, 67],
        [65, 67, 60],
        [67, 60, 65],
        [67, 65, 60]
      ] as const,
      random
    ),
    60
  ];
  let startBeat = 0;
  const notes: MusicNote[] = roots.flatMap((root) => {
    const durationBeats = musicChoice([0.5, 1, 2], random);
    const chord = buildTriad(root, "major").pitches.map((pitch) => ({
      pitch,
      startBeat,
      durationBeats,
      hand: "right" as const
    }));
    startBeat += durationBeats;
    return chord;
  });
  return { roots, exercise: createMusicExercise({ id, seed, bpm, notes }) };
}
