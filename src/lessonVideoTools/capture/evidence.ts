import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CaptureSource } from "./acquire.ts";
import type { CapturedNote } from "./model.ts";
import { run, safeDirectory, writeJson } from "../runtime.ts";

export interface EvidenceFrame {
  readonly id: string;
  readonly frameIndex: number;
  readonly pts: string;
  readonly timeBase: string;
  readonly time: number;
  readonly file: string;
}

/** A flat sum exceeds libavutil expression recursion limits on long performances. */
export function selectionExpression(indices: readonly number[]): string {
  if (!indices.length) return "0";
  if (indices.length === 1) return `eq(n\\,${String(indices[0])})`;
  const middle = Math.floor(indices.length / 2);
  return `(${selectionExpression(indices.slice(0, middle))}+${selectionExpression(indices.slice(middle))})`;
}
export async function evidence(
  root: string,
  directory: string,
  source: CaptureSource,
  input: string,
  notes: readonly CapturedNote[],
  references: readonly string[] = []
): Promise<EvidenceFrame[]> {
  const frames = source.frames;
  const chosen = new Set<number>();
  for (const reference of references) {
    const match = /^frame-(\d+)$/.exec(reference);
    const index = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(index) || !frames.some((frame) => frame.frameIndex === index))
      throw new Error(`Evidence не найден в источнике: ${reference}`);
    chosen.add(index);
  }
  for (const index of [0, Math.floor(frames.length / 2), frames.length - 1]) {
    const frame = frames[index];
    if (frame) chosen.add(frame.frameIndex);
  }
  for (const note of notes) {
    for (const time of [note.onset - 0.06, note.onset, note.onset + 0.06]) {
      let lo = 0,
        hi = frames.length - 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if ((frames[mid]?.time ?? Infinity) < time) lo = mid + 1;
        else hi = mid;
      }
      const a = frames[lo],
        b = frames[lo - 1];
      const nearest =
        a && b ? (Math.abs(a.time - time) < Math.abs(b.time - time) ? a : b) : (a ?? b);
      if (nearest) chosen.add(nearest.frameIndex);
    }
  }
  const selected = frames.filter((frame) => chosen.has(frame.frameIndex));
  if (selected.length === 0) return [];
  await safeDirectory(root, resolve(directory, "evidence"));
  const filter = resolve(directory, "evidence/filter.txt");
  await writeFile(
    filter,
    `select=${selectionExpression(selected.map((frame) => frame.frameIndex))},scale=960:-2`,
    { flag: "wx" }
  );
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-n",
    "-i",
    input,
    Number(/ffmpeg version (\d+)/.exec(source.tools.ffmpeg)?.[1] ?? "9") >= 8
      ? "-/filter:v"
      : "-filter_script:v",
    filter,
    "-fps_mode",
    "vfr",
    "-q:v",
    "3",
    resolve(directory, "evidence/%06d.jpg")
  ]);
  const entries = selected.map((frame, index) => ({
    id: `frame-${String(frame.frameIndex)}`,
    frameIndex: frame.frameIndex,
    pts: frame.pts,
    timeBase: frame.timeBase,
    time: frame.time,
    file: `evidence/${String(index + 1).padStart(6, "0")}.jpg`
  }));
  await writeJson(resolve(directory, "evidence/index.json"), entries);
  return entries;
}
