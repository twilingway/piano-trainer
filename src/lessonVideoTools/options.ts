import { isAbsolute, relative, resolve } from "node:path";

export type VideoCommand = "setup" | "prepare" | "frames";
export interface VideoOptions {
  command: VideoCommand;
  help: boolean;
  id: string;
  video: string;
  python: string;
  model: "turbo" | "large-v3";
  start: number;
  end: number | null;
  at: readonly number[];
  every: number | null;
  maxFrames: number;
  noDownload: boolean;
}

export function seconds(value: string): number {
  const parts = value.split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part)))
    throw new Error(`Неверное время: ${value}. Используйте секунды, мм:сс или чч:мм:сс.`);
  if (parts.slice(0, -1).some((part) => !/^\d+$/.test(part)))
    throw new Error("Дробная часть допустима только у секунд.");
  if (parts.length > 1 && parts.slice(1).some((part) => Number(part) >= 60))
    throw new Error(`Неверное время: ${value}. Минуты и секунды должны быть меньше 60.`);
  const result = parts.reduce((total, part) => total * 60 + Number(part), 0);
  if (!Number.isFinite(result)) throw new Error("Время должно быть конечным числом.");
  return result;
}

export function analysisDirectory(root: string, id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))
    throw new Error("--id: 1–80 латинских букв, цифр, дефисов или подчёркиваний; без путей.");
  return resolve(root, "local-lessons/.analysis", id);
}

export function withinDirectory(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith("../") && !path.startsWith("..\\") && !isAbsolute(path);
}

export function parseOptions(args: readonly string[]): VideoOptions {
  const command = args[0];
  if (command !== "setup" && command !== "prepare" && command !== "frames")
    throw new Error("Выберите setup, prepare или frames.");
  const flags = new Map<string, string>();
  const booleans = new Set(["help", "no-download"]);
  const permitted = {
    setup: ["help", "python", "model", "no-download"],
    prepare: ["help", "id", "video", "start", "end", "model"],
    frames: ["help", "id", "video", "start", "end", "at", "every", "max-frames"]
  }[command];
  for (let index = 1; index < args.length; index++) {
    const argument = args[index] ?? "";
    const name = argument.startsWith("--") ? argument.slice(2) : "";
    if (!permitted.includes(name) || flags.has(name))
      throw new Error(`Неизвестный или повторный аргумент: ${argument}`);
    if (booleans.has(name)) flags.set(name, "true");
    else {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Укажите значение --${name}.`);
      flags.set(name, value);
    }
  }
  const help = flags.has("help");
  const model = flags.get("model") ?? "turbo";
  if (model !== "turbo" && model !== "large-v3") throw new Error("--model: turbo или large-v3.");
  const start = seconds(flags.get("start") ?? "0");
  const end = flags.has("end") ? seconds(flags.get("end") ?? "") : null;
  if (end !== null && end <= start) throw new Error("--end должен быть позже --start.");
  const every = flags.has("every") ? seconds(flags.get("every") ?? "") : null;
  if (every !== null && every <= 0) throw new Error("--every должен быть больше нуля.");
  const at = flags.has("at") ? (flags.get("at") ?? "").split(",").map(seconds) : [];
  if (command === "frames" && !help && at.length > 0 === (every !== null))
    throw new Error("Укажите ровно один режим: --at или --every.");
  const maxFrames = Number(flags.get("max-frames") ?? "80");
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 200)
    throw new Error("--max-frames: целое число от 1 до 200.");
  const id = flags.get("id") ?? "";
  const video = flags.get("video") ?? "";
  if (command !== "setup" && !help && (!id || !video)) throw new Error("Укажите --id и --video.");
  if (id) analysisDirectory(".", id);
  return {
    command,
    help,
    id,
    video,
    model,
    start,
    end,
    at,
    every,
    maxFrames,
    python: flags.get("python") ?? "python",
    noDownload: flags.has("no-download")
  };
}

export interface VideoSource {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}
export interface AudioMetadata {
  readonly source: VideoSource;
  readonly start: number;
  readonly end: number;
  readonly videoDuration: number;
  readonly format: "mono-pcm16-16000";
}
export function sameSource(value: unknown, expected: VideoSource): boolean {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<VideoSource>;
  return (
    source.path === expected.path &&
    source.size === expected.size &&
    source.mtimeMs === expected.mtimeMs
  );
}
export function reusableAudio(value: unknown, expected: AudioMetadata): boolean {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<AudioMetadata>;
  return (
    sameSource(metadata.source, expected.source) &&
    metadata.start === expected.start &&
    metadata.end === expected.end &&
    metadata.videoDuration === expected.videoDuration &&
    metadata.format === expected.format
  );
}

export function frameTimes(options: VideoOptions, duration: number): number[] {
  const end = options.end ?? duration;
  if (options.start >= duration || end > duration)
    throw new Error("Диапазон кадров выходит за длительность видео.");
  let requested = [...options.at];
  if (options.every !== null) {
    const count = Math.ceil((end - options.start) / options.every);
    if (count > options.maxFrames)
      throw new Error("Слишком много кадров: увеличьте --every или сократите диапазон.");
    requested = Array.from(
      { length: count },
      (_, index) => options.start + index * (options.every ?? 1)
    );
  }
  const times = [...new Set(requested.map((time) => Math.round(time * 1000) / 1000))];
  if (times.length > options.maxFrames) throw new Error("Слишком много временных точек --at.");
  if (times.some((time) => time < options.start || time >= end))
    throw new Error(
      "Все кадры --at должны находиться внутри [--start, --end), по времени исходного видео."
    );
  return times.sort((a, b) => a - b);
}
