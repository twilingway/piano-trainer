import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type DictionaryLanguage = "en" | "ru";

export interface FrequencyEntry {
  readonly word: string;
  readonly rank: number;
  readonly frequency: number;
}

export interface DictionaryResource {
  readonly language: DictionaryLanguage;
  readonly version: string;
  readonly source: string;
  readonly license: "CC BY-SA 4.0";
  readonly entries: readonly FrequencyEntry[];
}

export const SOURCE_REVISION = "525f9b560de45753a5ea01069454e72e9aa541c6";
export const DICTIONARY_VERSION = `FrequencyWords-2018-${SOURCE_REVISION}-filtered-v1`;
const ONE_LETTER_WORDS = { en: new Set(["a", "i"]), ru: new Set("ияавскуо") };
const ALPHABETS = { en: /^[a-z]+$/, ru: /^[а-яё]+$/ };
const PROFANITY = {
  en: /(?:fuck|shit|bitch|cunt|motherfuck|cock|dick|asshole|bastard|whore|piss)/,
  ru: /(?:ху[йеяию]|пизд|[её]б[аоу]|бля[дт]|муд[ао]к|залуп|^сук[аи]$)/
};

/** Re-rank a filtered frequency list without changing upstream order. */
export function normalizeFrequencyList(
  text: string,
  language: DictionaryLanguage,
  limit = 3000
): FrequencyEntry[] {
  const entries: FrequencyEntry[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const [sourceWord = "", frequencyText = ""] = line.trim().split(/\s+/);
    const word = sourceWord.normalize("NFC").toLocaleLowerCase(language);
    const frequency = Number(frequencyText);
    if (
      !ALPHABETS[language].test(word) ||
      (word.length === 1 && !ONE_LETTER_WORDS[language].has(word)) ||
      !Number.isSafeInteger(frequency) ||
      frequency <= 0 ||
      PROFANITY[language].test(word) ||
      seen.has(word)
    ) {
      continue;
    }
    seen.add(word);
    entries.push({ word, rank: entries.length + 1, frequency });
    if (entries.length === limit) break;
  }
  if (entries.length < limit) {
    throw new Error(
      `Словарь ${language}: найдено ${String(entries.length)} слов вместо ${String(limit)}`
    );
  }
  return entries;
}

async function readCachedSource(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    return undefined;
  }
}

/** Cache is keyed by the immutable upstream Git revision. */
export async function prepareDictionary(
  projectRoot: string,
  language: DictionaryLanguage,
  limit = 3000
): Promise<DictionaryResource> {
  const source = `https://raw.githubusercontent.com/hermitdave/FrequencyWords/${SOURCE_REVISION}/content/2018/${language}/${language}_50k.txt`;
  const cacheDirectory = resolve(
    projectRoot,
    ".browser-artifacts/word-typing/dictionary-cache",
    SOURCE_REVISION
  );
  const cachePath = resolve(cacheDirectory, `${language}_50k.txt`);
  let raw = await readCachedSource(cachePath);
  if (raw === undefined) {
    const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok)
      throw new Error(`Не удалось загрузить ${language}: HTTP ${String(response.status)}`);
    raw = await response.text();
    normalizeFrequencyList(raw, language);
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(cachePath, raw, "utf8");
  }
  return {
    language,
    version: DICTIONARY_VERSION,
    source,
    license: "CC BY-SA 4.0",
    entries: normalizeFrequencyList(raw, language, limit)
  };
}
