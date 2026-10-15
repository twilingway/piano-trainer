import { constants } from "node:fs";
import { copyFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { analysisDirectory, withinDirectory } from "../options.ts";
import {
  assertNoLink,
  digest,
  exists,
  readJson,
  run,
  safeDirectory,
  writeJson
} from "../runtime.ts";
import { capturePython } from "./environment.ts";

export interface CaptureFrame {
  frameIndex: number;
  pts: string;
  timeBase: string;
  time: number;
  duration?: number;
}
interface CaptureFile {
  file: string;
  sha256: string;
  size: number;
}
interface CaptureRequest {
  kind: "youtube" | "local";
  locator: string;
  sha256?: string;
}
export interface CaptureSource {
  schemaVersion: 1;
  createdAt: string;
  source: CaptureRequest;
  video: CaptureFile;
  audio: CaptureFile & {
    format: "pcm_s16le";
    sampleRate: number;
    channels: number;
    sourceOffset: number;
  };
  probe: Record<string, unknown>;
  frames: CaptureFrame[];
  timelineOriginSeconds: number;
  timelineEndSeconds: number;
  tools: { ffmpeg: string; ffprobe: string; ytDlp?: string };
  metadata?: Record<string, unknown>;
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function captureDirectory(root: string, id: string): string {
  return resolve(analysisDirectory(root, id), "capture");
}

/** Only the video identity is retained; shared links can contain tracking or private tokens. */
export function canonicalYoutubeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Используйте обычную HTTPS-ссылку YouTube без учётных данных.");
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else id = /^\/(?:shorts|embed)\/([^/]+)$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id))
    throw new Error("Нужна ссылка на один ролик YouTube, а не плейлист или другой сайт.");
  return `https://www.youtube.com/watch?v=${id}`;
}

export function parseFrameTimeline(raw: string, timeBase: string): CaptureFrame[] {
  const match = /^(\d+)\/(\d+)$/.exec(timeBase);
  const scale = match ? Number(match[1]) / Number(match[2]) : NaN;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Неверная шкала времени видео.");
  const frames: CaptureFrame[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = Object.fromEntries(
      line.split("|").map((field) => {
        const equals = field.indexOf("=");
        return [field.slice(0, equals), field.slice(equals + 1)];
      })
    );
    const pts = fields.best_effort_timestamp ?? fields.pts;
    if (!pts || !/^-?\d+$/.test(pts)) throw new Error("FFprobe не вернул PTS кадра.");
    const time = Number(pts) * scale;
    if (!Number.isFinite(time) || (frames.at(-1)?.time ?? -Infinity) >= time)
      throw new Error("Кадры не имеют строго возрастающих PTS.");
    const duration = Number(fields.duration_time ?? fields.pkt_duration_time);
    frames.push({
      frameIndex: frames.length,
      pts,
      timeBase,
      time,
      ...(Number.isFinite(duration) && duration > 0 ? { duration } : {})
    });
  }
  if (!frames.length) throw new Error("В источнике не найдено видеокадров.");
  return frames;
}

async function describe(directory: string, file: string): Promise<CaptureFile> {
  if (file !== basename(file) || !/^[a-zA-Z0-9_.-]+$/.test(file))
    throw new Error("Небезопасное имя файла захвата.");
  const path = resolve(directory, file);
  await assertNoLink(path);
  const info = await stat(path);
  if (!info.isFile() || info.size === 0) throw new Error("Файл захвата пуст или отсутствует.");
  return { file, size: info.size, sha256: await digest(path) };
}

async function verifiedFile(directory: string, value: unknown): Promise<CaptureFile> {
  const record = object(value);
  if (typeof record.file !== "string") throw new Error("Повреждён манифест захвата.");
  const actual = await describe(directory, record.file);
  if (record.sha256 !== actual.sha256 || record.size !== actual.size)
    throw new Error("Файл захвата изменён. Используйте новый --id; исходные артефакты сохранены.");
  return actual;
}

export async function readCapture(root: string, id: string): Promise<CaptureSource> {
  const directory = captureDirectory(root, id);
  await safeDirectory(root, directory);
  const raw = object(await readJson(resolve(directory, "source.json")));
  const source = object(raw.source),
    audio = object(raw.audio);
  if (
    raw.schemaVersion !== 1 ||
    !["local", "youtube"].includes(String(source.kind)) ||
    typeof source.locator !== "string" ||
    !Array.isArray(raw.frames) ||
    !raw.frames.length ||
    audio.format !== "pcm_s16le" ||
    !Number.isFinite(audio.sourceOffset) ||
    !Number.isFinite(audio.sampleRate) ||
    !Number.isFinite(audio.channels)
  )
    throw new Error("Повреждён или несовместим манифест захвата.");
  await verifiedFile(directory, raw.video);
  await verifiedFile(directory, raw.audio);
  let last = -Infinity;
  for (const [index, row] of raw.frames.entries()) {
    const frame = object(row);
    if (
      frame.frameIndex !== index ||
      typeof frame.pts !== "string" ||
      !/^-?\d+$/.test(frame.pts) ||
      typeof frame.timeBase !== "string" ||
      typeof frame.time !== "number" ||
      !Number.isFinite(frame.time) ||
      frame.time <= last
    )
      throw new Error("Повреждена временная шкала кадров.");
    const rebuilt = parseFrameTimeline(`best_effort_timestamp=${frame.pts}`, frame.timeBase)[0];
    if (rebuilt?.time !== frame.time)
      throw new Error("PTS кадра не соответствует времени исходника.");
    last = frame.time;
  }
  const first = object(raw.frames[0]);
  if (
    raw.timelineOriginSeconds !== first.time ||
    typeof raw.timelineEndSeconds !== "number" ||
    !Number.isFinite(raw.timelineEndSeconds) ||
    raw.timelineEndSeconds < last
  )
    throw new Error("Повреждён диапазон временной шкалы.");
  return raw as unknown as CaptureSource;
}

async function probe(path: string): Promise<Record<string, unknown>> {
  return object(
    JSON.parse(
      await run(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
        true
      )
    ) as unknown
  );
}

async function youtube(directory: string, url: string, python: string): Promise<string> {
  for (const name of await readdir(directory)) await assertNoLink(resolve(directory, name));
  const printed = await run(
    python,
    [
      "-m",
      "yt_dlp",
      "--ignore-config",
      "--no-plugin-dirs",
      "--no-playlist",
      "--no-cookies",
      "--no-cookies-from-browser",
      "--no-cache-dir",
      "--no-js-runtimes",
      "--js-runtimes",
      `node:${process.execPath}`,
      "--no-overwrites",
      "--continue",
      "--write-info-json",
      "--no-write-playlist-metafiles",
      "--format",
      "bestvideo*+bestaudio/best",
      "--merge-output-format",
      "mkv",
      "--output",
      resolve(directory, "input.%(ext)s"),
      "--print",
      "after_move:%(filepath)j",
      "--",
      url
    ],
    true
  );
  const path: unknown = JSON.parse(printed.trim().split(/\r?\n/).at(-1) ?? "null");
  if (
    typeof path !== "string" ||
    !withinDirectory(directory, resolve(path)) ||
    !/^input\.[a-z0-9]+$/i.test(basename(path))
  )
    throw new Error("Загрузчик вернул неверный путь исходника.");
  return basename(path);
}

/** Receipts are exclusive: an interrupted run can only resume the same source. */
export async function download(
  root: string,
  options: { id: string; source: string; python?: string }
): Promise<CaptureSource> {
  const remote = /^https?:\/\//i.test(options.source);
  const locator = remote
    ? canonicalYoutubeUrl(options.source)
    : await realpath(resolve(options.source));
  const request: CaptureRequest = remote
    ? { kind: "youtube", locator }
    : { kind: "local", locator, sha256: await digest(locator) };
  const directory = captureDirectory(root, options.id);
  await safeDirectory(root, directory);
  const requestPath = resolve(directory, "request.json");
  if (await exists(requestPath)) {
    if (JSON.stringify(await readJson(requestPath)) !== JSON.stringify(request))
      throw new Error("Этот --id уже связан с другим или изменённым источником.");
  } else {
    if ((await readdir(directory)).length)
      throw new Error("Каталог захвата не имеет квитанции источника.");
    await writeJson(requestPath, request);
  }
  if (await exists(resolve(directory, "source.json"))) return readCapture(root, options.id);
  const python = options.python ?? capturePython(root);
  const tools: CaptureSource["tools"] = {
    ffmpeg: (await run("ffmpeg", ["-version"], true)).split(/\r?\n/)[0] ?? "",
    ffprobe: (await run("ffprobe", ["-version"], true)).split(/\r?\n/)[0] ?? "",
    ...(remote ? { ytDlp: (await run(python, ["-m", "yt_dlp", "--version"], true)).trim() } : {})
  };
  let file: string;
  if (remote) file = await youtube(directory, locator, python);
  else {
    const extension = extname(locator).toLowerCase();
    if (!/^\.[a-z0-9]{1,10}$/.test(extension))
      throw new Error("У видео должно быть обычное расширение файла.");
    file = `input${extension}`;
    await assertNoLink(resolve(directory, file));
    if (!(await exists(resolve(directory, file))))
      await copyFile(locator, resolve(directory, file), constants.COPYFILE_EXCL);
    if ((await digest(resolve(directory, file))) !== request.sha256)
      throw new Error("Локальный источник изменился во время копирования или файл повреждён.");
  }
  const video = await describe(directory, file),
    videoPath = resolve(directory, file);
  const media = await probe(videoPath);
  const streams = Array.isArray(media.streams) ? media.streams.map(object) : [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  if (!videoStream || !audioStream || typeof videoStream.time_base !== "string")
    throw new Error("Для анализа нужны видеодорожка и аудиодорожка.");
  const frames = parseFrameTimeline(
    await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_frames",
        "-show_entries",
        "frame=best_effort_timestamp,pts,duration_time,pkt_duration_time",
        "-of",
        "compact=p=0:nk=0",
        videoPath
      ],
      true
    ),
    videoStream.time_base
  );
  const audioPath = resolve(directory, "audio.wav"),
    receiptPath = resolve(directory, "audio-receipt.json");
  await assertNoLink(audioPath);
  if (await exists(audioPath)) {
    if (!(await exists(receiptPath)))
      throw new Error("Незавершённое аудио: используйте новый --id.");
    await verifiedFile(directory, await readJson(receiptPath));
  } else {
    if (await exists(receiptPath)) throw new Error("Аудио из квитанции отсутствует.");
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-n",
      "-i",
      videoPath,
      "-map",
      "0:a:0",
      "-vn",
      "-c:a",
      "pcm_s16le",
      audioPath
    ]);
    await writeJson(receiptPath, await describe(directory, "audio.wav"));
  }
  const audioProbe = await probe(audioPath);
  const wav = object(Array.isArray(audioProbe.streams) ? audioProbe.streams[0] : null);
  const sampleRate = Number(wav.sample_rate),
    channels = Number(wav.channels);
  const sourceOffset = Number(audioStream.start_time ?? 0);
  const audioDuration = Number(object(audioProbe.format).duration);
  const sourceDuration = Number(audioStream.duration);
  if (
    wav.codec_name !== "pcm_s16le" ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isInteger(channels) ||
    channels < 1 ||
    !Number.isFinite(sourceOffset) ||
    !Number.isFinite(audioDuration) ||
    audioDuration <= 0 ||
    (Number.isFinite(sourceDuration) &&
      sourceDuration > 0 &&
      Math.abs(audioDuration - sourceDuration) > 0.25)
  )
    throw new Error("Извлечённое аудио имеет неверный формат.");
  const metadataPath = resolve(directory, "input.info.json");
  const metadata =
    remote && (await exists(metadataPath)) ? object(await readJson(metadataPath)) : {};
  const sanitized = Object.fromEntries(
    [
      "id",
      "title",
      "webpage_url",
      "duration",
      "uploader",
      "upload_date",
      "format_id",
      "width",
      "height",
      "fps",
      "acodec",
      "vcodec"
    ]
      .filter((key) => metadata[key] !== undefined)
      .map((key) => [key, metadata[key]])
  );
  const last = frames.at(-1);
  if (!last) throw new Error("Нет кадров.");
  const result: CaptureSource = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    source: request,
    video,
    audio: {
      ...(await describe(directory, "audio.wav")),
      format: "pcm_s16le",
      sampleRate,
      channels,
      sourceOffset
    },
    probe: media,
    frames,
    timelineOriginSeconds: frames[0]?.time ?? 0,
    timelineEndSeconds:
      last.time + (last.duration ?? Math.max(0, last.time - (frames.at(-2)?.time ?? last.time))),
    tools,
    ...(remote ? { metadata: sanitized } : {})
  };
  if ((await digest(videoPath)) !== video.sha256)
    throw new Error("Видео изменилось во время анализа.");
  await writeJson(resolve(directory, "source.json"), result);
  return result;
}
