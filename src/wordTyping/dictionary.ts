import type { DictionaryEntry, DictionarySize, Language } from "./types";

export function normalizeWords(raw: readonly string[], language: Language): DictionaryEntry[] {
  const pattern = language === "en" ? /^[a-z]+$/u : /^[а-яё]+$/u;
  const seen = new Set<string>();
  const entries: DictionaryEntry[] = [];
  for (const item of raw) {
    const word = item.normalize("NFC").trim().toLowerCase();
    if (!pattern.test(word) || word.length > 24 || seen.has(word)) continue;
    seen.add(word);
    entries.push({ word, rank: entries.length + 1 });
  }
  return entries;
}

export interface TrieNode {
  readonly children: Map<string, TrieNode>;
  entry?: DictionaryEntry;
}

export function buildTrie(entries: readonly DictionaryEntry[]): TrieNode {
  const root: TrieNode = { children: new Map() };
  for (const entry of entries) {
    let node = root;
    for (const letter of entry.word) {
      let next = node.children.get(letter);
      if (!next) {
        next = { children: new Map() };
        node.children.set(letter, next);
      }
      node = next;
    }
    if (!node.entry || entry.rank < node.entry.rank) node.entry = entry;
  }
  return root;
}

/** Words in the small resource; 1K and 3K are its slices, 10K has a file of its own. */
export const SMALL_DICTIONARY = 3000;

/**
 * The resource a dictionary size loads from `public/word-typing/`: the small one is one file
 * for 1K and 3K, so the common sizes never fetch the 10K list.
 */
export function dictionaryFile(language: Language, size: DictionarySize): string {
  return size > SMALL_DICTIONARY ? `${language}-10k.json` : `${language}.json`;
}
