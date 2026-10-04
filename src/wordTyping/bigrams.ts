import type { DictionaryEntry, Language } from "./types";

/** Word pairs as they follow each other in real sentences, by the words' dictionary ranks. */
export interface BigramTable {
  /** How strongly `next` follows `previous`, 0 (never seen) to 1 (the most common pair). */
  strength(previous: number, next: number): number;
}

/** Ranks up to this fit a numeric key: previous × KEY_BASE + next. */
const KEY_BASE = 1 << 16;
const WORD = { en: /^[a-z]+$/u, ru: /^[а-яё]+$/u } as const;
/** Punctuation ends a phrase: words across it are not a pair. */
const PHRASE_BREAK = /[.,!?;:…()"«»„“”—–\-[\]]/u;

export const NO_BIGRAMS: BigramTable = { strength: () => 0 };

/**
 * Counts the pairs of dictionary words that follow each other within a phrase. A word outside
 * the dictionary, a digit, an apostrophe or punctuation breaks the chain.
 */
export function countBigrams(
  sentences: Iterable<string>,
  language: Language,
  dictionary: readonly DictionaryEntry[]
): Map<number, number> {
  const rankOf = new Map(dictionary.map((entry) => [entry.word, entry.rank]));
  const counts = new Map<number, number>();
  for (const sentence of sentences) {
    for (const phrase of sentence
      .normalize("NFC")
      .toLocaleLowerCase(language)
      .split(PHRASE_BREAK)) {
      let previous: number | undefined;
      for (const word of phrase.split(/\s+/u)) {
        if (!word) continue;
        const rank = WORD[language].test(word) ? rankOf.get(word) : undefined;
        if (previous !== undefined && rank !== undefined) {
          const key = previous * KEY_BASE + rank;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        previous = rank;
      }
    }
  }
  return counts;
}

/**
 * The `limit` most common pairs seen at least `minimum` times, flat as
 * [previous rank, next rank, count, …], the most common first.
 */
export function encodeBigrams(
  counts: ReadonlyMap<number, number>,
  limit: number,
  minimum = 2
): number[] {
  return [...counts]
    .filter(([, count]) => count >= minimum)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .flatMap(([key, count]) => [Math.floor(key / KEY_BASE), key % KEY_BASE, count]);
}

/**
 * The table for a dictionary of `dictionarySize` words: pairs with a word beyond it are left out.
 * Strength grows with the logarithm of the count, so common pairs do not drown the rest.
 */
export function decodeBigrams(flat: readonly number[], dictionarySize: number): BigramTable {
  const counts = new Map<number, number>();
  let most = 0;
  for (let index = 0; index + 2 < flat.length; index += 3) {
    const previous = flat[index] ?? 0;
    const next = flat[index + 1] ?? 0;
    const count = flat[index + 2] ?? 0;
    if (previous > dictionarySize || next > dictionarySize || count <= 0) continue;
    counts.set(previous * KEY_BASE + next, count);
    most = Math.max(most, count);
  }
  if (most === 0) return NO_BIGRAMS;
  const scale = Math.log1p(most);
  return {
    strength: (previous, next) => Math.log1p(counts.get(previous * KEY_BASE + next) ?? 0) / scale
  };
}
