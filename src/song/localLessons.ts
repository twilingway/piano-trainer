import type { Exercise, ExerciseLevel } from "./exercises";
import { parseSongStage } from "./songStage";
import type { SongStage } from "./songStage";

/*
 * Lessons from the git-ignored local-lessons folder: one folder a lesson, one
 * MusicXML file a level, ordered by file name. Scores that may not be
 * published live there; the build picks up whatever the folder holds.
 */
const FILES = import.meta.glob<string>("/local-lessons/*/*.{musicxml,xml}", {
  query: "?raw",
  import: "default",
  eager: true
});
/** "<level file name without extension>.stage.json" beside a level: its performance-scene dressing. */
const STAGES = import.meta.glob<string>("/local-lessons/*/*.stage.json", {
  query: "?raw",
  import: "default",
  eager: true
});
/** "<level file name without extension>.voice.mp3" (or .ogg, .wav) beside a level: its sung voice from song time 0. */
const VOICES = import.meta.glob<string>("/local-lessons/*/*.voice.{mp3,ogg,wav}", {
  query: "?url",
  import: "default",
  eager: true
});
const VOICE_FORMATS = ["mp3", "ogg", "wav"];

/** "3 Соль мажор.musicxml" -> "Соль мажор": the leading number only orders the levels. */
function levelTitle(fileName: string): string {
  return fileName.replace(/\.(musicxml|xml)$/i, "").replace(/^\d+\s*[-.]?\s*/, "");
}

/** A stage file that is not exactly `{ "sign"?: string }` is ignored, and the lesson still opens. */
function levelStage(path: string, text: string | undefined): SongStage | undefined {
  if (text === undefined) return undefined;
  const result = parseSongStage(text);
  if ("stage" in result) return result.stage;
  console.warn(`Ignoring ${path}: ${result.error}`);
  return undefined;
}

export function buildLessons(
  files: Readonly<Record<string, string>>,
  stages: Readonly<Record<string, string>> = {},
  voices: Readonly<Record<string, string>> = {}
): Exercise[] {
  const byFolder = new Map<string, ExerciseLevel[]>();
  for (const [path, musicXml] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const [, folder = "", fileName = ""] = /^\/local-lessons\/([^/]+)\/([^/]+)$/.exec(path) ?? [];
    if (!folder) continue;
    const levels = byFolder.get(folder) ?? [];
    const stagePath = path.replace(/\.(musicxml|xml)$/i, ".stage.json");
    const stage = levelStage(stagePath, stages[stagePath]);
    const voice = VOICE_FORMATS.map(
      (format) => voices[path.replace(/\.(musicxml|xml)$/i, `.voice.${format}`)]
    ).find((url) => url !== undefined);
    levels.push({
      id: fileName,
      title: levelTitle(fileName),
      musicXml,
      ...(stage ? { stage } : {}),
      ...(voice ? { voice } : {})
    });
    byFolder.set(folder, levels);
  }
  return [...byFolder].map(([folder, levels]) => ({
    id: `local:${folder}`,
    title: folder,
    levels
  }));
}

export const LOCAL_LESSONS: readonly Exercise[] = buildLessons(FILES, STAGES, VOICES);
