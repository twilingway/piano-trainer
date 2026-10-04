import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

import type * as BigramsModule from "../wordTyping/bigrams";
import type { DictionaryLanguage, DictionaryResource } from "./dictionarySource";

// A URL keeps Node strip-types imports explicit without changing compiler settings.
const { countBigrams, encodeBigrams } = (await import(
  new URL("../wordTyping/bigrams.ts", import.meta.url).href
)) as typeof BigramsModule;

export interface BigramResource {
  readonly language: DictionaryLanguage;
  readonly version: string;
  readonly source: string;
  readonly license: "CC BY 2.0 FR";
  /** The dictionary whose ranks the pairs name. */
  readonly dictionaryVersion: string;
  /** [previous rank, next rank, count, …], the most common pair first. */
  readonly pairs: readonly number[];
}

/** The pairs kept, and how often a pair must occur to be kept. */
const PAIR_LIMIT = 40_000;
const PAIR_MINIMUM = 2;
const TATOEBA_CODE = { en: "eng", ru: "rus" } as const;

interface CacheMeta {
  readonly exported: string;
}

/**
 * Tatoeba's sentences of a language, downloaded once and kept with the date of the export: a
 * later run reads the same sentences without the network. The export is a bzip2 file, opened
 * with the system's `bzip2` (Git Bash on Windows has it).
 */
async function cachedSentences(
  projectRoot: string,
  language: DictionaryLanguage
): Promise<{ readonly path: string; readonly exported: string; readonly source: string }> {
  const code = TATOEBA_CODE[language];
  const source = `https://downloads.tatoeba.org/exports/per_language/${code}/${code}_sentences.tsv.bz2`;
  const directory = resolve(projectRoot, ".browser-artifacts/word-typing/tatoeba-cache");
  const path = resolve(directory, `${code}_sentences.tsv.bz2`);
  const metaPath = `${path}.json`;
  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as CacheMeta;
    return { path, exported: meta.exported, source };
  } catch {
    // Not cached yet: download below.
  }
  const response = await fetch(source, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить Tatoeba ${language}: HTTP ${String(response.status)}`);
  }
  const modified = response.headers.get("last-modified");
  const exported = modified ? new Date(modified).toISOString().slice(0, 10) : "unknown";
  await mkdir(directory, { recursive: true });
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  await writeFile(metaPath, JSON.stringify({ exported } satisfies CacheMeta), "utf8");
  return { path, exported, source };
}

/** The sentences of a Tatoeba export (id, language, text a line), read through `bzip2 -dc`. */
async function* readSentences(path: string): AsyncGenerator<string> {
  const unzip = spawn("bzip2", ["-dc", path], { stdio: ["ignore", "pipe", "inherit"] });
  const failed = new Promise<never>((_, reject) => {
    unzip.on("error", () => {
      reject(new Error("Для подготовки биграмм нужен bzip2 в PATH (есть в Git Bash)"));
    });
  });
  const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  for (;;) {
    const next = await Promise.race([iterator.next(), failed]);
    if (next.done) break;
    const text = next.value.split("\t")[2];
    if (text) yield text;
  }
  const code = await new Promise<number | null>((done) => {
    if (unzip.exitCode !== null) done(unzip.exitCode);
    else unzip.on("close", done);
  });
  if (code !== 0) throw new Error(`bzip2 завершился с кодом ${String(code)}`);
}

/** The word pairs of `dictionary` as Tatoeba's sentences of its language use them. */
export async function prepareBigrams(
  projectRoot: string,
  dictionary: DictionaryResource
): Promise<BigramResource> {
  const { path, exported, source } = await cachedSentences(projectRoot, dictionary.language);
  const sentences: string[] = [];
  for await (const sentence of readSentences(path)) sentences.push(sentence);
  if (sentences.length === 0) throw new Error(`Tatoeba ${dictionary.language}: нет предложений`);
  const counts = countBigrams(sentences, dictionary.language, dictionary.entries);
  return {
    language: dictionary.language,
    version: `Tatoeba-${exported}-pairs-v1`,
    source,
    license: "CC BY 2.0 FR",
    dictionaryVersion: dictionary.version,
    pairs: encodeBigrams(counts, PAIR_LIMIT, PAIR_MINIMUM)
  };
}
