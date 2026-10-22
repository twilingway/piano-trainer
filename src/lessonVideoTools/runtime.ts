import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { withinDirectory, type VideoSource } from "./options.ts";

/** No shell interpolation or detached children; the CLI owns every subprocess. */
export function run(command: string, args: readonly string[], capture = false): Promise<string> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, [...args], {
      shell: false,
      windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit"
    });
    let output = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      output += chunk;
    });
    const stop = () => {
      child.kill("SIGTERM");
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    const cleanup = () => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("close", (code, signal) => {
      cleanup();
      if (code === 0) resolveResult(output);
      else
        reject(
          new Error(
            `${command}: завершение ${String(code ?? signal)}. См. сообщение процесса выше.`
          )
        );
    });
  });
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

/** Check resolved ancestors before creation: a junction must not redirect outputs outside the repo. */
export async function safeDirectory(root: string, directory: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  const target = resolve(directory);
  if (!withinDirectory(canonicalRoot, target))
    throw new Error("Выходной путь находится вне репозитория.");
  let ancestor = target;
  while (!(await exists(ancestor))) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error("Не найден родитель выходной папки.");
    ancestor = parent;
  }
  if (!withinDirectory(canonicalRoot, await realpath(ancestor)))
    throw new Error("Выходной путь перенаправлен junction/symlink за пределы репозитория.");
  await mkdir(target, { recursive: true });
  if (!withinDirectory(canonicalRoot, await realpath(target)))
    throw new Error("Выходной путь перенаправлен за пределы репозитория.");
}

export async function videoSource(path: string): Promise<VideoSource> {
  const canonical = await realpath(resolve(path));
  const info = await stat(canonical);
  if (!info.isFile()) throw new Error("--video должен указывать на существующий файл.");
  return { path: canonical, size: info.size, mtimeMs: info.mtimeMs };
}

export async function readJson(path: string): Promise<unknown> {
  await assertNoLink(path);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
export async function writeJson(path: string, value: unknown, exclusive = true): Promise<void> {
  await assertNoLink(path);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: exclusive ? "wx" : "w"
  });
}
export async function assertNoLink(path: string): Promise<void> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error("Файл артефакта не должен быть symlink/junction.");
}

export async function assertLocalRuntime(
  root: string,
  directory: string,
  python: string
): Promise<void> {
  await safeDirectory(root, directory);
  for (const name of [".venv", "cache", "models"]) {
    const path = resolve(directory, name);
    await assertNoLink(path);
    if (await exists(path)) {
      await safeDirectory(root, path);
      await assertConfinedTree(root, path);
    }
  }
  if (await exists(python)) {
    const canonical = await realpath(python);
    if (!withinDirectory(await realpath(root), canonical))
      throw new Error("Python окружения находится вне репозитория.");
  }
}

async function assertConfinedTree(root: string, directory: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (!withinDirectory(canonicalRoot, await realpath(path)))
        throw new Error("Локальная среда содержит ссылку за пределы репозитория.");
    } else if (entry.isDirectory()) await assertConfinedTree(root, path);
  }
}
export async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
export async function duration(path: string): Promise<number> {
  const raw = await run(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path
    ],
    true
  );
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value <= 0)
    throw new Error("FFprobe не смог определить длительность видео.");
  return value;
}
