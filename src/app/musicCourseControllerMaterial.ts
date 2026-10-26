import { generateSightReadingMaterial } from "../musicLearning/sightReading";
import { generateDictationMaterial } from "../musicLearning/dictation";
import { findNewMusicMaterial, MUSIC_NOVELTY_CANDIDATES } from "../musicLearning/novelty";
import { regenerateIntegratedActivity } from "../musicLearning/integratedPlan";
import type { IntegratedLesson } from "../musicLearning/integrated";
import type { MusicMaterialCandidate } from "../musicLearning/novelty";
import {
  makeMusicActivity,
  musicActivityFromIntegrated,
  type MusicActivity
} from "./musicCourseExercise";
import type { MusicPersistentState } from "./musicPersistence";
import type { MusicCourseCallbacks } from "./musicCourseContracts";
import { musicChoice, musicRandom } from "../musicLearning/random";
import { buildTriad } from "../musicLearning/harmony";

/** Same version-one harmony recipe; the claimed score is rebuilt and fingerprint-checked below. */
function harmonyCandidate(seed: number): MusicMaterialCandidate {
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
  return {
    notes: roots.flatMap((root) => {
      const durationBeats = musicChoice([0.5, 1, 2], random);
      const notes = buildTriad(root, "major").pitches.map((pitch) => ({
        pitch,
        startBeat,
        durationBeats,
        hand: "right" as const
      }));
      startBeat += durationBeats;
      return notes;
    })
  };
}

function candidate(
  saved: MusicPersistentState,
  activity: MusicActivity,
  seed: number
): MusicMaterialCandidate {
  const child = activity.integrated;
  if (child?.kind === "harmony") return harmonyCandidate(seed);
  if (child?.kind === "sight-reading" || (!child && saved.course === "sight-reading"))
    return generateSightReadingMaterial({
      seed,
      level: child?.kind === "sight-reading" ? child.exercise.level : saved.sightLevel,
      purpose: activity.purpose,
      bpm: activity.exercise.bpm,
      ...(activity.sight ? { learnedIntervals: activity.sight.learnedIntervals } : {})
    });
  if (child?.kind === "rhythm" || (!child && saved.course === "dictation"))
    return generateDictationMaterial({
      seed,
      length: child?.kind === "rhythm" ? child.exercise.notes.length : saved.dictationLength,
      bpm: activity.exercise.bpm,
      startMode: child?.kind === "rhythm" ? child.exercise.startMode : saved.dictationStartMode,
      studiedPitches: child ? [60] : [60, 62, 64, 65, 67],
      studiedDurations: child || saved.dictationLength > 3 ? [0.5, 1, 2] : [1]
    });
  return child
    ? regenerateIntegratedActivity(child, seed).exercise
    : makeMusicActivity({ ...saved, seed }).exercise;
}

export async function reserveMusicActivity(
  saved: MusicPersistentState,
  lesson: IntegratedLesson | null,
  callbacks: MusicCourseCallbacks,
  current: () => boolean
): Promise<{ readonly activity: MusicActivity; readonly newMaterial: boolean } | null> {
  await callbacks.persistenceReady();
  if (!current()) return null;
  let activity = lesson
    ? musicActivityFromIntegrated(lesson.snapshot().activity)
    : makeMusicActivity(saved);
  const seen = new Set(await callbacks.known());
  if (!current()) return null;
  if (!activity.noveltyRequired) {
    const fresh = await callbacks.claim(activity.exercise.fingerprint);
    return current() ? { activity, newMaterial: fresh } : null;
  }
  let seed = activity.exercise.seed;
  let budget = MUSIC_NOVELTY_CANDIDATES;
  while (budget > 0 && current()) {
    const found = findNewMusicMaterial(
      seed,
      (next) => candidate(saved, activity, next),
      seen,
      budget
    );
    if (found.status === "exhausted") throw new Error("music-novelty-exhausted");
    budget -= found.checked;
    const claimed = await callbacks.claim(found.fingerprint);
    if (!current()) return null;
    if (claimed) {
      if (lesson) {
        const identity = lesson.snapshot().identity;
        if (
          found.seed !== activity.exercise.seed &&
          !lesson.replaceNovelActivity(identity, found.seed)
        )
          throw new Error("music-novelty-stale");
        activity = musicActivityFromIntegrated(lesson.snapshot().activity);
      } else {
        activity = makeMusicActivity({ ...saved, seed: found.seed });
        callbacks.rememberSeed(found.seed);
      }
      if (activity.exercise.fingerprint !== found.fingerprint)
        throw new Error("music-novelty-material-mismatch");
      return { activity, newMaterial: true };
    }
    seen.add(found.fingerprint);
    seed = (found.seed + 1) >>> 0;
  }
  throw new Error("music-novelty-exhausted");
}
