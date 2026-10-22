import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { get } from "node:https";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLocalRuntime,
  assertNoLink,
  digest,
  exists,
  run,
  safeDirectory,
  writeJson
} from "../runtime.ts";

export const handModel = {
  url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  sha256: "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1"
} as const;

export function capturePython(root: string): string {
  return resolve(
    root,
    ".browser-artifacts/video-capture/.venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
  );
}

async function fetchModel(url: string, redirects = 0): Promise<Buffer> {
  if (!url.startsWith("https:") || redirects > 3) throw new Error("Неверный HTTPS-адрес модели.");
  return new Promise((resolveResult, reject) => {
    const request = get(url, { rejectUnauthorized: true }, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        resolveResult(fetchModel(new URL(response.headers.location, url).href, redirects + 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Не удалось скачать модель рук: HTTP ${String(response.statusCode)}.`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 32 * 1024 * 1024)
          request.destroy(new Error("Модель превышает допустимый размер."));
        else chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => {
        resolveResult(Buffer.concat(chunks));
      });
    });
    request.once("error", reject);
    request.setTimeout(60_000, () =>
      request.destroy(new Error("Истекло время скачивания модели."))
    );
  });
}

export async function setupCapture(root: string, options: { python: string }): Promise<void> {
  const directory = resolve(root, ".browser-artifacts/video-capture");
  const python = capturePython(root);
  await assertLocalRuntime(root, directory, python);
  if (!(await exists(python))) {
    const version = (
      await run(
        options.python,
        ["-c", "import sys; print('.'.join(map(str,sys.version_info[:2])))"],
        true
      )
    ).trim();
    if (version !== "3.11")
      throw new Error("Для захвата нужен Python 3.11; укажите его путь через --python.");
    await run(options.python, ["-m", "venv", resolve(directory, ".venv")]);
  }
  await assertLocalRuntime(root, directory, python);
  const check = JSON.parse(
    await run(
      python,
      [
        "-c",
        "import json,sys; print(json.dumps({'prefix':sys.prefix,'version':list(sys.version_info[:2])}))"
      ],
      true
    )
  ) as { prefix: string; version: number[] };
  if (resolve(check.prefix) !== resolve(directory, ".venv") || check.version.join(".") !== "3.11")
    throw new Error("Установка отменена: Python должен принадлежать локальной venv версии 3.11.");
  const cache = resolve(directory, "cache"),
    models = resolve(directory, "models"),
    matplotlib = resolve(directory, "matplotlib");
  await safeDirectory(root, cache);
  await safeDirectory(root, models);
  await safeDirectory(root, matplotlib);
  const requirements = fileURLToPath(
    new URL("../../../tools/video-capture/requirements.txt", import.meta.url)
  );
  if (
    (
      await run(
        python,
        ["-c", "import importlib.util; print(importlib.util.find_spec('pip') is not None)"],
        true
      )
    ).trim() !== "True"
  )
    await run(python, ["-m", "ensurepip"]);
  await run(python, ["-m", "pip", "install", "--cache-dir", cache, "--requirement", requirements]);
  const modelPath = resolve(models, "hand_landmarker.task");
  await assertNoLink(modelPath);
  if (await exists(modelPath)) {
    if ((await digest(modelPath)) !== handModel.sha256)
      throw new Error("Контрольная сумма модели рук неверна; существующий файл сохранён.");
  } else {
    const bytes = await fetchModel(handModel.url);
    if (createHash("sha256").update(bytes).digest("hex") !== handModel.sha256)
      throw new Error("Скачанная модель рук имеет неверную контрольную сумму.");
    await writeFile(modelPath, bytes, { flag: "wx" });
  }
  const packages = JSON.parse(
    await run(python, ["-m", "pip", "list", "--format=json"], true)
  ) as unknown;
  const capabilities = JSON.parse(
    await run(
      python,
      [
        "-c",
        "import json,sys,os; os.environ['MPLCONFIGDIR']=sys.argv[1]; import torch,torchaudio,mediapipe,av,transkun; print(json.dumps({'python':sys.version,'torch':torch.__version__,'cuda':torch.cuda.is_available(),'device':torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu'}))",
        matplotlib
      ],
      true
    )
  ) as unknown;
  const ffmpeg = (await run("ffmpeg", ["-version"], true)).split(/\r?\n/)[0];
  const ffprobe = (await run("ffprobe", ["-version"], true)).split(/\r?\n/)[0];
  await writeJson(
    resolve(directory, "environment.json"),
    {
      schemaVersion: 1,
      python,
      packages,
      capabilities,
      ffmpeg,
      ffprobe,
      handModel,
      updatedAt: new Date().toISOString()
    },
    false
  );
  console.log(`Среда распознавания готова: ${directory}`);
}
