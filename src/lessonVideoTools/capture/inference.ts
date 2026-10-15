import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { captureDirectory, readCapture } from "./acquire.ts";
import { capturePython } from "./environment.ts";
import type { CaptureOptions } from "./options.ts";
import { calibrationFrom, parseFrames, predictionFrom, record } from "./validate.ts";
import {
  assertNoLink,
  digest,
  exists,
  readJson,
  run,
  safeDirectory,
  writeJson
} from "../runtime.ts";

export interface StageReceipt {
  readonly schemaVersion: 1;
  readonly sourceSha256: string;
  readonly stage: "music" | "hands";
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, string>>;
}

export async function inferenceFingerprint(
  root: string,
  stage: "music" | "hands"
): Promise<Readonly<Record<string, unknown>>> {
  const files =
    stage === "music" ? ["capture.py", "music.py"] : ["capture.py", "hands.py", "tracking.py"];
  const adapters: Record<string, string> = {};
  for (const file of files)
    adapters[file] = await digest(resolve(root, "tools/video-capture", file));
  const packages =
    stage === "music"
      ? ["transkun", "torch", "torchaudio", "numpy", "soxr"]
      : ["mediapipe", "av", "numpy", "pillow"];
  const probe =
    "import sys,json,hashlib,importlib.metadata as m,importlib.util;from pathlib import Path;result={'packages':{p:m.version(p) for p in sys.argv[2:]}};" +
    (stage === "music"
      ? "base=Path(importlib.util.find_spec('transkun').origin).parent/'pretrained';result['weights']=hashlib.sha256((base/'2.0.pt').read_bytes()).hexdigest();result['config']=hashlib.sha256((base/'2.0.conf').read_bytes()).hexdigest();"
      : "") +
    "print(json.dumps(result))";
  const environment = record(
    JSON.parse(await run(capturePython(root), ["-c", probe, stage, ...packages], true)) as unknown
  );
  return { adapters, environment };
}
export async function readStage(
  directory: string,
  stage: "music" | "hands",
  sourceSha256: string
): Promise<StageReceipt | null> {
  const receiptPath = resolve(directory, `${stage}.receipt.json`);
  if (!(await exists(receiptPath))) return null;
  const value = record(await readJson(receiptPath));
  if (value.schemaVersion !== 1 || value.sourceSha256 !== sourceSha256 || value.stage !== stage)
    throw new Error(`Этап ${stage} относится к другому источнику.`);
  const files = record(value.files);
  const expected =
    stage === "music" ? ["music.raw.json"] : ["hands.raw.jsonl", "hands.summary.json"];
  if (
    Object.keys(files).length !== expected.length ||
    expected.some((file) => typeof files[file] !== "string")
  )
    throw new Error("Неверный receipt этапа.");
  for (const file of expected) {
    const path = resolve(directory, file);
    await assertNoLink(path);
    if ((await digest(path)) !== files[file]) throw new Error(`Изменён результат этапа: ${file}`);
  }
  record(value.parameters);
  return value as unknown as StageReceipt;
}

export async function infer(root: string, options: CaptureOptions): Promise<void> {
  if (options.command !== "music" && options.command !== "hands")
    throw new Error("Ожидается этап music или hands.");
  const stage = options.command;
  const source = await readCapture(root, options.id);
  const directory = captureDirectory(root, options.id);
  const python = capturePython(root);
  if (!(await exists(python))) throw new Error("Сначала выполните lesson-video:setup-capture.");
  const fingerprint = await inferenceFingerprint(root, stage);
  const calibration = options.calibration
    ? calibrationFrom(await readJson(resolve(options.calibration)), source.video.sha256)
    : null;
  const model = options.handModel
    ? resolve(options.handModel)
    : resolve(root, ".browser-artifacts/video-capture/models/hand_landmarker.task");
  const parameters =
    stage === "music"
      ? { audioSha256: source.audio.sha256, sourceOffset: source.audio.sourceOffset, fingerprint }
      : {
          start: options.start,
          end: options.end,
          calibration,
          modelSha256: await digest(model),
          fingerprint
        };
  const previous = await readStage(directory, stage, source.video.sha256);
  if (previous) {
    if (JSON.stringify(previous.parameters) !== JSON.stringify(parameters))
      throw new Error("Этот этап уже выполнен с другими параметрами. Используйте другой --id.");
    console.log(`Повторно использован совместимый draft этапа ${stage}.`);
    return;
  }
  const outputs =
    stage === "music" ? ["music.raw.json"] : ["hands.raw.jsonl", "hands.summary.json"];
  for (const name of outputs)
    if (await exists(resolve(directory, name)))
      throw new Error("Неполный прошлый запуск. Сохраните результаты и используйте новый --id.");
  await safeDirectory(root, resolve(directory, "overlays"));
  const args = [resolve(root, "tools/video-capture/capture.py"), stage];
  if (stage === "music")
    args.push(
      "--audio",
      resolve(directory, source.audio.file),
      "--output",
      resolve(directory, "music.raw.json"),
      "--device",
      "cuda",
      "--source-offset",
      String(source.audio.sourceOffset)
    );
  else {
    args.push(
      "--video",
      resolve(directory, source.video.file),
      "--model",
      model,
      "--output",
      resolve(directory, "hands.raw.jsonl"),
      "--summary",
      resolve(directory, "hands.summary.json"),
      "--start",
      String(options.start),
      "--overlay-dir",
      resolve(directory, "overlays"),
      "--overlay-every",
      "150"
    );
    if (options.end !== null) args.push("--end", String(options.end));
    if (options.calibration) args.push("--calibration", resolve(options.calibration));
  }
  await run(python, args);
  if (stage === "hands" && (await digest(model)) !== parameters.modelSha256)
    throw new Error("Модель рук изменилась во время анализа. Используйте новый id.");
  if (JSON.stringify(await inferenceFingerprint(root, stage)) !== JSON.stringify(fingerprint))
    throw new Error(
      "Адаптер или модель изменились во время анализа. Результат не подтверждён receipt."
    );
  if (stage === "music") predictionFrom(await readJson(resolve(directory, "music.raw.json")));
  else parseFrames(await readFile(resolve(directory, "hands.raw.jsonl"), "utf8"));
  const files: Record<string, string> = {};
  for (const file of outputs) files[file] = await digest(resolve(directory, file));
  await writeJson(resolve(directory, `${stage}.receipt.json`), {
    schemaVersion: 1,
    stage,
    sourceSha256: source.video.sha256,
    parameters,
    files
  } satisfies StageReceipt);
  console.log(`Готов ${stage}; результат остаётся непроверенным до сверки.`);
}
