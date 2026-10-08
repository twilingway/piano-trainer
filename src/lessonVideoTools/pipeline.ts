import { stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  analysisDirectory,
  frameTimes,
  reusableAudio,
  sameSource,
  type AudioMetadata,
  type VideoOptions,
  type VideoSource
} from "./options.ts";
import { pythonSource } from "./pythonSource.ts";
import { buildTimeline } from "./timeline.ts";
import {
  assertNoLink,
  assertLocalRuntime,
  digest,
  duration,
  exists,
  readJson,
  run,
  safeDirectory,
  videoSource,
  writeJson
} from "./runtime.ts";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function runtimePaths(root: string) {
  const directory = resolve(root, ".browser-artifacts/lesson-analysis");
  return {
    directory,
    helper: resolve(directory, "transcribe.py"),
    python: resolve(
      directory,
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
    )
  };
}
async function helper(root: string): Promise<ReturnType<typeof runtimePaths>> {
  const paths = runtimePaths(root);
  await safeDirectory(root, paths.directory);
  await assertLocalRuntime(root, paths.directory, paths.python);
  await assertNoLink(paths.helper);
  await writeFile(paths.helper, pythonSource, "utf8");
  return paths;
}

export async function setup(root: string, options: VideoOptions): Promise<void> {
  const paths = await helper(root);
  if (!(await exists(paths.python))) {
    await run(options.python, [
      "-m",
      "venv",
      "--system-site-packages",
      resolve(paths.directory, ".venv")
    ]);
  }
  await assertLocalRuntime(root, paths.directory, paths.python);
  const prefix = (await run(paths.python, ["-c", "import sys; print(sys.prefix)"], true)).trim();
  if (resolve(prefix) !== resolve(paths.directory, ".venv"))
    throw new Error("Python не использует локальную venv; установка отменена.");
  await run(paths.python, ["-m", "pip", "install", "faster-whisper==1.2.1", "ctranslate2==4.8.2"]);
  let cudaAvailable = false;
  try {
    cudaAvailable =
      (
        await run(paths.python, ["-c", "import torch; print(torch.cuda.is_available())"], true)
      ).trim() === "True";
  } catch {
    /* Install CUDA torch only inside the local venv when its base lacks it. */
  }
  if (!cudaAvailable) {
    await run(paths.python, [
      "-m",
      "pip",
      "install",
      "torch==2.7.0",
      "--index-url",
      "https://download.pytorch.org/whl/cu126"
    ]);
  }
  await run(paths.python, [
    paths.helper,
    "--model",
    options.model,
    options.noDownload ? "--probe-only" : "--model-only"
  ]);
  console.log(`Среда готова: ${paths.directory}`);
}

async function bindSource(root: string, directory: string, source: VideoSource): Promise<void> {
  await safeDirectory(root, directory);
  const path = resolve(directory, "source.json");
  if (await exists(path)) {
    if (!sameSource(await readJson(path), source))
      throw new Error(
        "Этот --id относится к другому или изменённому видео. Используйте новый --id."
      );
  } else await writeJson(path, source);
}

async function validateAudio(audio: string, metadata: AudioMetadata): Promise<void> {
  await assertNoLink(audio);
  const raw = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate,channels:format=duration",
      "-of",
      "json",
      audio
    ],
    true
  );
  const probe = object(JSON.parse(raw) as unknown);
  const stream = object(Array.isArray(probe.streams) ? probe.streams[0] : null);
  const actual = Number(object(probe.format).duration);
  if (
    stream.codec_name !== "pcm_s16le" ||
    stream.sample_rate !== "16000" ||
    stream.channels !== 1 ||
    !Number.isFinite(actual) ||
    Math.abs(actual - (metadata.end - metadata.start)) > 0.15
  )
    throw new Error(
      "Аудио неполное или имеет другой формат. Используйте новый --id; старые файлы сохранены."
    );
}

async function prepareAudio(directory: string, metadata: AudioMetadata): Promise<string> {
  const metadataPath = resolve(directory, "metadata.json");
  if (await exists(metadataPath)) {
    if (!reusableAudio(await readJson(metadataPath), metadata))
      throw new Error(
        "Аудио этого --id связано с другим источником или диапазоном. Используйте новый --id."
      );
  } else await writeJson(metadataPath, metadata);
  const audio = resolve(directory, "audio.wav"),
    receipt = resolve(directory, "audio-receipt.json");
  await assertNoLink(audio);
  if (await exists(audio)) {
    if (!(await exists(receipt)))
      throw new Error("Аудио не имеет подтверждения успешного извлечения. Используйте новый --id.");
    const previous = object(await readJson(receipt));
    if (previous.sha256 !== (await digest(audio)))
      throw new Error("Аудио изменено после извлечения. Используйте новый --id.");
  } else {
    if (await exists(receipt))
      throw new Error("Подтверждение аудио есть, а файл отсутствует. Используйте новый --id.");
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-n",
      "-ss",
      String(metadata.start),
      "-i",
      metadata.source.path,
      "-t",
      String(metadata.end - metadata.start),
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      audio
    ]);
    await validateAudio(audio, metadata);
    if (!sameSource(await videoSource(metadata.source.path), metadata.source))
      throw new Error("Исходное видео изменилось во время извлечения. Используйте новый --id.");
    await writeJson(receipt, { sha256: await digest(audio) });
  }
  await validateAudio(audio, metadata);
  return audio;
}

export async function prepare(root: string, options: VideoOptions): Promise<void> {
  const source = await videoSource(options.video);
  const total = await duration(source.path),
    end = options.end ?? total;
  if (options.start >= total || end > total)
    throw new Error("Диапазон аудио выходит за длительность видео.");
  const paths = runtimePaths(root);
  await assertLocalRuntime(root, paths.directory, paths.python);
  if (!(await exists(paths.python))) throw new Error("Сначала выполните pnpm lesson-video:setup.");
  const directory = analysisDirectory(root, options.id);
  await bindSource(root, directory, source);
  const metadata: AudioMetadata = {
    source,
    start: options.start,
    end,
    videoDuration: total,
    format: "mono-pcm16-16000"
  };
  const audio = await prepareAudio(directory, metadata);
  const transcriptPath = resolve(directory, "transcript.json");
  const transcriptFiles = [
    transcriptPath,
    resolve(directory, "transcript.txt"),
    resolve(directory, "transcript.srt")
  ];
  const present = await Promise.all(transcriptFiles.map(exists));
  await Promise.all(transcriptFiles.map(assertNoLink));
  if (present.some(Boolean)) {
    if (!present.every(Boolean))
      throw new Error("Расшифровка не завершена. Используйте новый --id.");
    const previous = object(await readJson(transcriptPath));
    if (
      previous.video !== source.path ||
      previous.sourceStart !== options.start ||
      previous.sourceEnd !== end ||
      previous.model !== options.model
    )
      throw new Error(
        "Этот --id содержит расшифровку другого диапазона или модели. Используйте новый --id."
      );
    console.log("Повторно используем проверенные аудио и расшифровку.");
  } else {
    const generated = await helper(root);
    await run(generated.python, [
      generated.helper,
      "--audio",
      audio,
      "--video",
      source.path,
      "--start",
      String(options.start),
      "--end",
      String(end),
      "--out",
      directory,
      "--model",
      options.model
    ]);
  }
  await writeJson(
    resolve(directory, "timeline-draft.json"),
    buildTimeline(await readJson(transcriptPath), options.start, end),
    false
  );
  console.log(`Расшифровка и черновик этапов: ${directory}`);
}

export async function frames(root: string, options: VideoOptions): Promise<void> {
  const source = await videoSource(options.video);
  const times = frameTimes(options, await duration(source.path));
  const directory = analysisDirectory(root, options.id);
  await bindSource(root, directory, source);
  const frameDirectory = resolve(directory, "frames");
  await safeDirectory(root, frameDirectory);
  const indexPath = resolve(directory, "frames.json");
  const previous = (await exists(indexPath)) ? object(await readJson(indexPath)) : {};
  const index = object(previous.frames);
  if (previous.source !== undefined && !sameSource(previous.source, source))
    throw new Error("Каталог кадров относится к другому видео. Используйте новый --id.");
  for (const at of times) {
    const filename = `frame-${at.toFixed(3).replace(".", "-")}.jpg`;
    const path = resolve(frameDirectory, filename);
    await assertNoLink(path);
    if (await exists(path)) {
      if (index[filename] !== at)
        throw new Error("Кадр уже существует без совпадающего тайминга. Используйте новый --id.");
    } else {
      await run("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-n",
        "-ss",
        String(at),
        "-i",
        source.path,
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-update",
        "1",
        path
      ]);
      if (!(await exists(path)) || (await stat(path)).size === 0)
        throw new Error("FFmpeg не сохранил кадр.");
      index[filename] = at;
      await writeJson(
        indexPath,
        { source, timebase: "absolute-video-seconds", frames: index },
        false
      );
    }
  }
  console.log(`Кадры (${String(times.length)} временных точек): ${frameDirectory}`);
}
