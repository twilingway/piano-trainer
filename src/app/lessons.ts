import { EXERCISES } from "../song/exercises";
import type { LevelId } from "../song/exercises";
import { LOCAL_LESSONS } from "../song/localLessons";
import { songFromMusicXml } from "../song/musicxml";
import type { Song } from "../song/song";

export interface LessonChoice {
  readonly exerciseId: string;
  readonly levelId: LevelId;
}

export const LESSONS = [...EXERCISES, ...LOCAL_LESSONS];

/** What a first visit opens: the anthem, or the first lesson should it be missing. */
const DEFAULT_LESSON_ID = "anthem-ru";

export const FIRST_LESSON: LessonChoice = {
  exerciseId: LESSONS.some((item) => item.id === DEFAULT_LESSON_ID)
    ? DEFAULT_LESSON_ID
    : (LESSONS[0]?.id ?? ""),
  levelId: "easy"
};

/** A built-in lesson at one level; the level is part of the title, so corrections stay per level. */
export function lessonSong(choice: LessonChoice): Song {
  const exercise = LESSONS.find((item) => item.id === choice.exerciseId);
  const level = exercise?.levels.find((item) => item.id === choice.levelId) ?? exercise?.levels[0];
  if (!exercise || !level) throw new Error(`No lesson ${choice.exerciseId}`);
  const song = songFromMusicXml(level.musicXml, exercise.title);
  return { ...song, title: `${exercise.title} · ${level.title}` };
}
