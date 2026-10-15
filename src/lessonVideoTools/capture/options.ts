import { analysisDirectory, seconds } from "../options.ts";

export const CAPTURE_COMMANDS = ["setup-capture", "download", "music", "hands", "export"] as const;
export type CaptureCommand = (typeof CAPTURE_COMMANDS)[number];
export interface CaptureOptions {
  readonly command: CaptureCommand;
  readonly help: boolean;
  readonly id: string;
  readonly source: string;
  readonly python: string;
  readonly calibration: string | null;
  readonly review: string | null;
  readonly handModel: string | null;
  readonly start: number;
  readonly end: number | null;
  readonly bundle: string;
}
export function isCaptureCommand(value: string | undefined): value is CaptureCommand {
  return CAPTURE_COMMANDS.some((command) => command === value);
}
export function captureOptions(args: readonly string[]): CaptureOptions {
  const command = args[0];
  if (!isCaptureCommand(command)) throw new Error("Неизвестная capture-команда.");
  const allowed = {
    "setup-capture": ["python"],
    download: ["id", "url", "video"],
    music: ["id"],
    hands: ["id", "calibration", "hand-model", "start", "end"],
    export: ["id", "calibration", "review", "bundle"]
  }[command];
  const flags = new Map<string, string>();
  for (let i = 1; i < args.length; i++) {
    const flag = (args[i] ?? "").replace(/^--/, "");
    if (
      !(args[i] ?? "").startsWith("--") ||
      (flag !== "help" && !allowed.includes(flag)) ||
      flags.has(flag)
    )
      throw new Error(`Неизвестный или повторный аргумент: ${args[i] ?? ""}`);
    if (flag === "help") flags.set(flag, "true");
    else {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Укажите --${flag}.`);
      flags.set(flag, value);
    }
  }
  const help = flags.has("help");
  const id = flags.get("id") ?? "";
  if (command !== "setup-capture" && !help) analysisDirectory(".", id);
  const source = flags.get("url") ?? flags.get("video") ?? "";
  if (command === "download" && !help && (!source || (flags.has("url") && flags.has("video"))))
    throw new Error("Укажите ровно один источник: --url или --video.");
  const start = seconds(flags.get("start") ?? "0");
  const end = flags.has("end") ? seconds(flags.get("end") ?? "") : null;
  if (end !== null && end <= start) throw new Error("--end должен быть позже --start.");
  const bundle = flags.get("bundle") ?? "bundle";
  analysisDirectory(".", bundle);
  return {
    command,
    help,
    id,
    source,
    python: flags.get("python") ?? "python",
    calibration: flags.get("calibration") ?? null,
    review: flags.get("review") ?? null,
    handModel: flags.get("hand-model") ?? null,
    start,
    end,
    bundle
  };
}
