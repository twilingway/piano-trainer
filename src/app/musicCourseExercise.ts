import { generateDictation } from "../musicLearning/dictation";
import type { DictationExercise } from "../musicLearning/dictation";
import {
  buildTriad,
  createHarmonyAccompaniment,
  createHarmonyTriadExercise,
  harmonyFunctionChord,
  harmonyProgression,
  smoothHarmonyVoicing,
  harmonyKeyFifths
} from "../musicLearning/harmony";
import type { HarmonyDegree, HarmonyTarget, TriadPitches } from "../musicLearning/harmony";
import type { IntegratedActivity } from "../musicLearning/integratedPlan";
import { createMusicExercise } from "../musicLearning/material";
import { musicChoice, musicRandom } from "../musicLearning/random";
import { createHarmonyToneMaterial, type HarmonyToneRecipe } from "../musicLearning/harmonyTone";
import { generateSightReading } from "../musicLearning/sightReading";
import type { SightReadingExercise } from "../musicLearning/sightReading";
import type { MusicExercise, MusicPurpose } from "../musicLearning/types";
import type { MusicCourseChoice, MusicTaskKind } from "../ui/musicCourseTypes";
import type { MusicPersistentState } from "./musicPersistence";

export interface MusicChordStep {
  readonly startBeat: number;
  readonly target: HarmonyTarget;
  readonly carry: readonly number[];
}
export interface MusicActivity {
  readonly exercise: MusicExercise;
  readonly taskKind: MusicTaskKind;
  readonly purpose: MusicPurpose;
  readonly auditory: boolean;
  readonly noveltyRequired: boolean;
  readonly choices: readonly MusicCourseChoice[];
  readonly expectedChoice?: string;
  readonly toneRecipe?: HarmonyToneRecipe;
  readonly sight?: SightReadingExercise;
  readonly dictation?: DictationExercise;
  readonly chords?: readonly MusicChordStep[];
  readonly previousVoicing?: TriadPitches;
  readonly integrated?: IntegratedActivity;
}
const QUALITY_CHOICES: readonly MusicCourseChoice[] = [
  { value: "major", labelKey: "Мажорное трезвучие" },
  { value: "minor", labelKey: "Минорное трезвучие" }
];
const FUNCTION_CHOICES: readonly MusicCourseChoice[] = [
  { value: "I", labelKey: "Тоника · I" },
  { value: "IV", labelKey: "Субдоминанта · IV" },
  { value: "V", labelKey: "Доминанта · V" }
];
const PROGRESSION_CHOICES: readonly MusicCourseChoice[] = [
  ...FUNCTION_CHOICES,
  { value: "vi", labelKey: "Шестая ступень · vi" }
];
const EMPTY_CHOICES: readonly MusicCourseChoice[] = [];

/** One descriptor covers all new courses without a new branch at every runtime call site. */
export function makeMusicActivity(selection: MusicPersistentState): MusicActivity {
  const { seed, purpose } = selection;
  const id = `music-${selection.course ?? "none"}-${String(seed)}`;
  const base = {
    purpose,
    auditory: false,
    noveltyRequired: purpose === "control",
    choices: EMPTY_CHOICES
  };
  if (selection.course === "sight-reading") {
    const sight = generateSightReading({ seed, level: selection.sightLevel, purpose });
    return { ...base, exercise: sight, sight, taskKind: "sight-reading" };
  }
  if (selection.course === "dictation") {
    const dictation = generateDictation({
      seed,
      length: selection.dictationLength,
      bpm: 72,
      startMode: selection.dictationStartMode,
      studiedPitches: [60, 62, 64, 65, 67],
      studiedDurations: selection.dictationLength <= 3 ? [1] : [0.5, 1, 2]
    });
    return { ...base, exercise: dictation, dictation, taskKind: "dictation", auditory: true };
  }
  if (selection.course !== "harmony")
    throw new RangeError("Integrated activities require their lesson plan");
  const random = musicRandom(seed);
  const root = selection.harmonyRoot;
  const bpm = 72;
  if (selection.harmonyLesson === "tone-semitone") {
    const { interval, notes, toneRecipe } = createHarmonyToneMaterial(
      seed,
      selection.harmonyTonePitchSet,
      root
    );
    const exercise = createMusicExercise({
      id,
      seed,
      bpm,
      fifths: toneRecipe.notationFifths,
      notes
    });
    return {
      ...base,
      noveltyRequired: false,
      exercise,
      taskKind: "tone-semitone",
      toneRecipe,
      choices: [
        { value: "1", labelKey: "Полутон" },
        { value: "2", labelKey: "Тон" }
      ],
      expectedChoice: String(interval)
    };
  }
  if (selection.harmonyLesson === "functions") {
    const degree = musicChoice(["I", "IV", "V"] as const, random);
    const chord = harmonyFunctionChord(degree);
    const { exercise } = createHarmonyTriadExercise({ id, seed, bpm, ...chord });
    return {
      ...base,
      noveltyRequired: false,
      exercise,
      taskKind: "function",
      choices: FUNCTION_CHOICES,
      expectedChoice: degree
    };
  }
  if (selection.harmonyLesson === "progressions") {
    const progression = harmonyProgression(selection.harmonyProgression, root);
    const exercise = createMusicExercise({
      id,
      seed,
      bpm,
      fifths: harmonyKeyFifths(root, "major"),
      notes: progression.flatMap((chord, index) =>
        chord.pitches.map((pitch) => ({
          pitch,
          startBeat: index * 2,
          durationBeats: 2,
          hand: "right"
        }))
      )
    });
    const last = progression.at(-1);
    if (!last) throw new RangeError("Empty harmony progression");
    return {
      ...base,
      noveltyRequired: false,
      exercise,
      taskKind: "progression",
      ...(selection.harmonyMode === "complete-progression"
        ? { choices: PROGRESSION_CHOICES, expectedChoice: last.degree }
        : {
            chords: [
              { startBeat: 6, target: { mode: "exact" as const, pitches: last.pitches }, carry: [] }
            ]
          })
    };
  }
  if (selection.harmonyLesson === "accompaniment") {
    const melody = [60, 64, 65, 69, 67, 62, 64, 60].map((pitch, index) => ({
      pitch: pitch + root - 60,
      startBeat: index * 2,
      durationBeats: 2,
      hand: "right" as const
    }));
    const { exercise, chords } = createHarmonyAccompaniment({
      id,
      seed,
      bpm,
      progression: selection.harmonyProgression,
      tonic: root - 12,
      melody
    });
    return {
      ...base,
      noveltyRequired: false,
      exercise,
      taskKind: "accompaniment",
      chords: chords.map((chord, index) => ({
        startBeat: index * 4,
        target: { mode: "exact", pitches: chord.pitches },
        carry: []
      }))
    };
  }
  if (selection.harmonyLesson === "voice-leading") {
    const previous = buildTriad(root, "major").pitches;
    const destination = buildTriad(root + 5, "major");
    const next = smoothHarmonyVoicing(previous, destination, { low: root - 12, high: root + 16 });
    if (!next) throw new RangeError("No bounded harmony transition");
    const notes = [previous, next.pitches].flatMap((pitches, index) =>
      pitches.map((pitch) => ({
        pitch,
        startBeat: index * 4,
        durationBeats: 4,
        hand: "right" as const
      }))
    );
    return {
      ...base,
      noveltyRequired: false,
      taskKind: "voice-leading",
      exercise: createMusicExercise({
        id,
        seed,
        bpm,
        notes,
        fifths: harmonyKeyFifths(root, "major")
      }),
      previousVoicing: previous,
      chords: [
        { startBeat: 0, target: { mode: "exact", pitches: previous }, carry: [] },
        {
          startBeat: 4,
          target: { mode: "pitch-class", pitches: next.pitches, allowOctaveDoubling: false },
          carry: next.commonPitches
        }
      ]
    };
  }
  const quality =
    selection.harmonyMode === "name-chord"
      ? musicChoice(["major", "minor"] as const, random)
      : selection.harmonyQuality;
  const inversion =
    selection.harmonyLesson === "inversions" || selection.harmonyMode === "invert-chord"
      ? selection.harmonyInversion
      : 0;
  const { exercise, chord } = createHarmonyTriadExercise({
    id,
    seed,
    bpm,
    root,
    quality,
    inversion
  });
  if (selection.harmonyMode === "name-chord")
    return {
      ...base,
      noveltyRequired: false,
      exercise,
      taskKind: "name-chord",
      auditory: selection.harmonyAural,
      choices: QUALITY_CHOICES,
      expectedChoice: quality
    };
  return {
    ...base,
    noveltyRequired: false,
    exercise,
    taskKind: inversion ? "invert-chord" : "build-chord",
    chords: [
      {
        startBeat: 0,
        target:
          selection.harmonyLesson === "inversions" || selection.harmonyMode === "invert-chord"
            ? { mode: "pitch-class", pitches: chord.pitches, bassPitchClass: chord.pitches[0] % 12 }
            : { mode: "exact", pitches: chord.pitches },
        carry: []
      }
    ]
  };
}

export function musicActivityFromIntegrated(activity: IntegratedActivity): MusicActivity {
  const base = {
    exercise: activity.exercise,
    purpose: activity.purpose,
    auditory: activity.auditory,
    noveltyRequired: activity.noveltyRequired,
    choices: EMPTY_CHOICES,
    integrated: activity
  };
  switch (activity.kind) {
    case "find-key":
      return { ...base, taskKind: "sight-reading" };
    case "sight-reading":
      return { ...base, sight: activity.exercise, taskKind: "sight-reading" };
    case "rhythm":
      return { ...base, dictation: activity.exercise, taskKind: "dictation" };
    case "interval":
      return {
        ...base,
        taskKind: "auditory-interval",
        choices: [
          { value: "3", labelKey: "Терция" },
          { value: "5", labelKey: "Квинта" }
        ],
        expectedChoice: String(activity.intervalNumber)
      };
    case "harmony":
      return {
        ...base,
        taskKind: "build-chord",
        chords: activity.roots.map((root, index) => ({
          startBeat:
            [...new Set(activity.exercise.notes.map((note) => note.startBeat))].sort(
              (a, b) => a - b
            )[index] ?? index,
          target: { mode: "exact", pitches: buildTriad(root, "major").pitches },
          carry: []
        }))
      };
    case "piece":
      return { ...base, taskKind: "sight-reading" };
  }
}

/** Hide the missing final chord in the prompt, keeping the source Song unchanged. */
export function musicProgressionPrompt(activity: MusicActivity): string {
  if (activity.taskKind !== "progression") return activity.exercise.musicXml;
  const last = Math.max(...activity.exercise.notes.map((note) => note.startBeat));
  const hidden = new Set(
    activity.exercise.song.notes
      .filter((note) => note.startBeat === last)
      .flatMap((note) => (note.sourceIndex === undefined ? [] : [note.sourceIndex]))
  );
  const document = new DOMParser().parseFromString(activity.exercise.musicXml, "application/xml");
  Array.from(document.querySelectorAll("note")).forEach((note, index) => {
    if (hidden.has(index)) note.setAttribute("print-object", "no");
  });
  return new XMLSerializer().serializeToString(document);
}

export function musicDegreeChoice(value: string): value is HarmonyDegree {
  return ["I", "IV", "V", "vi"].includes(value);
}

/** The continuation answer is neither printed nor played before the learner supplies it. */
export function musicReferenceMaterial(
  activity: MusicActivity
): Pick<MusicExercise, "notes" | "bpm"> {
  if (activity.taskKind !== "progression") return activity.exercise;
  const last = Math.max(...activity.exercise.notes.map((note) => note.startBeat));
  return {
    bpm: activity.exercise.bpm,
    notes: activity.exercise.notes.filter((note) => note.startBeat < last)
  };
}
