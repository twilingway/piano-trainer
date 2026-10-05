import { EXERCISES } from "../song/exercises";
import type { LessonChoice } from "./lessons";

/** Localize bundled labels without mutating Song.title, history or fingering keys. */
export function lessonDisplayTitle(
  title: string,
  lesson: LessonChoice | null,
  t: (message: string) => string
): string {
  const exercise = EXERCISES.find((item) => item.id === lesson?.exerciseId);
  const level = exercise?.levels.find((item) => item.id === lesson?.levelId);
  if (!exercise || !level) return title;
  const original = `${exercise.title} · ${level.title}`;
  if (!title.startsWith(original)) return title;
  return `${t(exercise.title)} · ${t(level.title)}${title.slice(original.length)}`;
}
