import { songFromMusicXml } from "../song/musicxml";
import type { CourseLesson, CoursePhrase, CourseStage, CourseTask } from "./model";

const STAGES: readonly CourseStage[] = ["right", "left", "both"];
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Only exact, relative score paths from the local glob are allowed. */
function localScore(path: unknown, files: Readonly<Record<string, string>>): string | null {
  if (!text(path) || /[\\:]/.test(path) || !path.startsWith(".course/")) return null;
  if (path.split("/").some((part) => part === ".." || part === "." || part === "")) return null;
  if (!/\.(musicxml|xml)$/i.test(path)) return null;
  return files[`/local-lessons/${path}`] ?? null;
}

function parseTasks(
  value: unknown,
  stages: readonly CourseStage[],
  phraseIds: readonly string[]
): readonly CourseTask[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const tasks: CourseTask[] = [];
  const pairs = new Set<string>();
  for (const item of value) {
    const task = object(item);
    if (
      !task ||
      !text(task.phraseId) ||
      !phraseIds.includes(task.phraseId) ||
      !stages.includes(task.stage as CourseStage)
    )
      return null;
    const pair = JSON.stringify([task.stage, task.phraseId]);
    if (pairs.has(pair)) return null;
    pairs.add(pair);
    tasks.push({ phraseId: task.phraseId, stage: task.stage as CourseStage });
  }
  return stages.every((stage) => tasks.some((task) => task.stage === stage)) &&
    phraseIds.every((phraseId) => tasks.some((task) => task.phraseId === phraseId))
    ? tasks
    : null;
}

function parseLesson(value: unknown, files: Readonly<Record<string, string>>): CourseLesson | null {
  const row = object(value);
  if (
    row?.reviewed !== true ||
    !text(row.id) ||
    !text(row.title) ||
    !text(row.goal) ||
    typeof row.number !== "number" ||
    !Number.isInteger(row.number) ||
    row.number < 1 ||
    row.number > 10 ||
    !Array.isArray(row.stages) ||
    row.stages.length === 0 ||
    !Array.isArray(row.phrases) ||
    row.phrases.length === 0
  )
    return null;
  const stages = row.stages.filter((stage): stage is CourseStage =>
    STAGES.includes(stage as CourseStage)
  );
  if (stages.length !== row.stages.length || new Set(stages).size !== stages.length) return null;
  if (
    stages.some(
      (stage, index) =>
        index > 0 && STAGES.indexOf(stage) <= STAGES.indexOf(stages[index - 1] ?? "right")
    )
  )
    return null;
  const phraseIds = row.phrases.map((item) => object(item)?.id);
  if (!phraseIds.every(text) || new Set(phraseIds).size !== phraseIds.length) return null;
  const tasks = Object.hasOwn(row, "tasks") ? parseTasks(row.tasks, stages, phraseIds) : undefined;
  if (tasks === null) return null;
  const final = object(row.finalTask);
  if (
    Object.hasOwn(row, "finalTask") &&
    (final?.stage !== "both" ||
      !stages.includes("both") ||
      !text(final.phraseId) ||
      !phraseIds.includes(final.phraseId) ||
      (tasks && !tasks.some((task) => task.stage === "both" && task.phraseId === final.phraseId)))
  )
    return null;
  const phrases: CoursePhrase[] = [];
  for (const item of row.phrases) {
    const phrase = object(item);
    if (
      !phrase ||
      !text(phrase.id) ||
      !text(phrase.version) ||
      (Object.hasOwn(phrase, "title") && !text(phrase.title))
    )
      return null;
    const musicXml = localScore(phrase.musicXml, files);
    if (!musicXml) return null;
    try {
      const song = songFromMusicXml(musicXml, row.title);
      if (song.notes.length === 0 || !Number.isFinite(song.duration) || song.duration <= 0)
        return null;
      if (
        song.notes.some(
          (note) =>
            !Number.isInteger(note.pitch) ||
            note.pitch < 0 ||
            note.pitch > 127 ||
            !Number.isFinite(note.start) ||
            !Number.isFinite(note.duration) ||
            note.duration <= 0
        )
      )
        return null;
      if (
        (tasks
          ? tasks.filter((task) => task.phraseId === phrase.id).map((task) => task.stage)
          : stages
        ).some((stage) =>
          stage === "both"
            ? !["right", "left"].every((hand) => song.notes.some((note) => note.hand === hand))
            : !song.notes.some((note) => note.hand === stage)
        )
      )
        return null;
    } catch {
      return null;
    }
    phrases.push({
      id: phrase.id,
      version: phrase.version,
      musicXml,
      ...(text(phrase.title) ? { title: phrase.title } : {})
    });
  }
  if (new Set(phrases.map((phrase) => phrase.id)).size !== phrases.length) return null;
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    goal: row.goal,
    stages,
    phrases,
    ...(tasks ? { tasks } : {}),
    ...(final ? { finalTask: { stage: "both" as const, phraseId: String(final.phraseId) } } : {})
  };
}

/** Bad or absent content never makes an unreviewed course playable. */
export function buildCourseCatalog(
  manifest: string | null,
  files: Readonly<Record<string, string>>,
  legacyTitles: Readonly<Record<number, string>> = {}
): readonly CourseLesson[] {
  let root: Record<string, unknown> | null;
  try {
    root = object(manifest === null ? null : JSON.parse(manifest));
  } catch {
    root = null;
  }
  const titles = object(root?.lessonTitles);
  const placeholders: CourseLesson[] = Array.from({ length: 10 }, (_, index) => ({
    id: `course-lesson-${String(index + 1).padStart(2, "0")}`,
    number: index + 1,
    title: text(titles?.[String(index + 1)])
      ? String(titles[String(index + 1)]).trim()
      : (legacyTitles[index + 1] ?? "Урок {number}"),
    goal: "Разучите фразы по одной руке, затем соедините их.",
    stages: STAGES,
    phrases: []
  }));
  const rows: unknown[] = Array.isArray(root?.lessons) ? root.lessons : [];
  const lessons = rows
    .map((row) => parseLesson(row, files))
    .filter((lesson): lesson is CourseLesson => lesson !== null);
  for (const lesson of lessons) {
    if (
      lessons.filter((other) => other.id === lesson.id || other.number === lesson.number).length > 1
    )
      continue;
    placeholders[lesson.number - 1] = lesson;
  }
  return placeholders;
}
