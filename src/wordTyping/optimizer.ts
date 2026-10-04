import type { SongNote } from "../song/song";
import { NO_BIGRAMS } from "./bigrams";
import type { BigramTable } from "./bigrams";
import { buildTrie } from "./dictionary";
import type { TrieNode } from "./dictionary";
import { inputTokenId, languageTokens, tokenPool } from "./inputTokens";
import { qualityMetrics } from "./metrics";
import { comfortBonus, inputPenalty, resolveConfig, wordScore } from "./scoring";
import type {
  DictionaryEntry,
  GeneratedToken,
  InputToken,
  Language,
  Layout,
  OptimizerConfig,
  WordTypingResult
} from "./types";

export { DEFAULT_CONFIG } from "./scoring";
export const ALGORITHM_VERSION = "word-typing-v4";
/** How many of the latest words a repeated word is looked for among. */
const RECENT_WORDS = 16;

export interface GenerationOptions {
  readonly layout?: Layout;
  /** 0 is the best text; another number gives another, equally reproducible, text. */
  readonly variant?: number;
}

interface Segment {
  readonly start: number;
  readonly indexes: readonly number[];
  readonly entry?: DictionaryEntry;
}

interface State {
  readonly mapping: readonly number[];
  readonly score: number;
  readonly previous?: State;
  readonly segment?: Segment;
}

interface Candidate {
  readonly mapping: number[];
  readonly entry: DictionaryEntry;
  readonly indexes: readonly number[];
  readonly score: number;
}

function requiredAt<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error("Ошибка построения словесной раскладки");
  return value;
}

function prune(states: readonly State[], width: number, layout: Layout): State[] {
  const ordered = [...states].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const result: State[] = [];
  for (const state of ordered) {
    // Every word starts from an empty mapping, so only the word before tells states apart.
    const key =
      layout === "word" ? String(state.segment?.entry?.rank ?? -1) : state.mapping.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(state);
    if (result.length === width) break;
  }
  return result;
}

/** A stable number in [0, 1) for a variant and a word. */
function variantShare(variant: number, rank: number): number {
  let hash = Math.imul(variant ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(rank, 0xc2b2ae35);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32;
}

function recentWords(state: State): Set<number> {
  const ranks = new Set<number>();
  for (
    let item: State | undefined = state;
    item && ranks.size < RECENT_WORDS;
    item = item.previous
  ) {
    const rank = item.segment?.entry?.rank;
    if (rank !== undefined) ranks.add(rank);
  }
  return ranks;
}

/** The words that fit the notes from `position` under `start`, scored without the word before. */
function fittingWords(
  trie: TrieNode,
  notes: readonly SongNote[],
  position: number,
  start: readonly number[],
  letterIndexes: ReadonlyMap<string, number>,
  pool: readonly InputToken[],
  dictionarySize: number,
  totalPitches: number,
  config: OptimizerConfig,
  variant: number
): Candidate[] {
  const mapping = [...start];
  const indexes: number[] = [];
  const candidates: Candidate[] = [];
  function visit(node: TrieNode, offset: number): void {
    if (node.entry && offset > 0) {
      // Aliases must leave enough unassigned inputs for every pitch still to come.
      const assigned = mapping.filter((pitch) => pitch !== -1);
      if (mapping.length - assigned.length + new Set(assigned).size < totalPitches) return;
      const last = notes[position + offset - 1];
      const next = notes[position + offset];
      const boundary =
        last && next && next.start - last.start - last.duration > 0.15
          ? config.phraseBoundaryBonus
          : 0;
      const comfort = indexes.reduce(
        (sum, index) => sum + comfortBonus(requiredAt(pool, index), config),
        0
      );
      const noise = variant
        ? config.variantNoise * node.entry.word.length * variantShare(variant, node.entry.rank)
        : 0;
      candidates.push({
        mapping: [...mapping],
        entry: node.entry,
        indexes: [...indexes],
        score: wordScore(node.entry, dictionarySize, config) + boundary + comfort + noise
      });
    }
    if (offset >= config.maxWordLength) return;
    const note = notes[position + offset];
    if (!note) return;
    for (const [letter, child] of node.children) {
      const index = letterIndexes.get(letter);
      if (index === undefined) continue;
      const pitch = requiredAt(mapping, index);
      if (pitch !== -1 && pitch !== note.pitch) continue;
      mapping[index] = note.pitch;
      indexes.push(index);
      visit(child, offset + 1);
      indexes.pop();
      mapping[index] = pitch;
    }
  }
  visit(trie, 0);
  return candidates;
}

function byScore(a: Candidate, b: Candidate): number {
  return b.score - a.score || a.entry.rank - b.entry.rank;
}

/** The best words after this state: a pair real sentences use reads as a phrase, a repeat does not. */
function wordCandidates(
  fitting: readonly Candidate[],
  state: State,
  config: OptimizerConfig,
  bigrams: BigramTable
): Candidate[] {
  const previous = state.segment?.entry;
  const recent = recentWords(state);
  return fitting
    .map((candidate) => {
      const length = candidate.entry.word.length;
      return {
        ...candidate,
        score:
          candidate.score -
          (recent.has(candidate.entry.rank) ? config.repeatPenalty * length : 0) +
          // Per letter, so that splitting a line into many short linked pairs earns nothing.
          (previous
            ? config.bigramWeight * length * bigrams.strength(previous.rank, candidate.entry.rank)
            : 0)
      };
    })
    .sort(byScore)
    .slice(0, config.maxCandidatesPerState);
}

function fallbackState(
  state: State,
  position: number,
  note: SongNote,
  pool: readonly InputToken[],
  letterCount: number,
  config: OptimizerConfig
): State {
  let index = state.mapping.findIndex((pitch) => pitch === note.pitch);
  if (index < 0) index = state.mapping.findIndex((pitch) => pitch === -1);
  const input = pool[index];
  if (!input) throw new Error("Недостаточно клавиш для всех высот мелодии");
  const mapping = [...state.mapping];
  mapping[index] = note.pitch;
  return {
    mapping,
    score: state.score - config.fallbackPenalty - inputPenalty(input, index < letterCount, config),
    previous: state,
    segment: { start: position, indexes: [index] }
  };
}

function renderResult(
  final: State,
  notes: readonly SongNote[],
  pool: readonly InputToken[],
  language: Language,
  bigrams: BigramTable,
  layout: Layout
): WordTypingResult {
  const segments: Segment[] = [];
  for (let state = final; state.previous; state = state.previous) {
    if (state.segment) segments.push(state.segment);
  }
  segments.reverse();
  const pairs = { total: 0, linked: 0 };
  segments.forEach((segment, index) => {
    const before = segments[index - 1]?.entry;
    if (!before || !segment.entry) return;
    pairs.total++;
    if (bigrams.strength(before.rank, segment.entry.rank) > 0) pairs.linked++;
  });
  const tokens: GeneratedToken[] = [];
  const blocks: string[] = [];
  const words: DictionaryEntry[] = [];
  for (const [wordIndex, segment] of segments.entries()) {
    if (segment.entry) words.push(segment.entry);
    const inputs = segment.indexes.map((index) => requiredAt(pool, index));
    blocks.push(segment.entry?.word ?? `[${inputs[0]?.display ?? ""}]`);
    for (const [offset, input] of inputs.entries()) {
      const noteIndex = segment.start + offset;
      const note = requiredAt(notes, noteIndex);
      tokens.push({
        noteIndex,
        noteId: note.id,
        pitch: note.pitch,
        start: note.start,
        duration: note.duration,
        input,
        wordIndex,
        isFallback: !segment.entry,
        ...(segment.entry ? { word: segment.entry.word } : {})
      });
    }
  }
  const tokenToPitch: Record<string, number> = {};
  const pitchToTokens: Record<number, string[]> = {};
  final.mapping.forEach((pitch, index) => {
    if (pitch === -1) return;
    const id = inputTokenId(requiredAt(pool, index));
    tokenToPitch[id] = pitch;
    (pitchToTokens[pitch] ??= []).push(id);
  });
  return {
    language,
    mode: layout === "word" ? "word" : "strict",
    text: blocks.join(" "),
    tokens,
    tokenToPitch,
    pitchToTokens,
    metrics: qualityMetrics(tokens, words, language, pairs)
  };
}

/**
 * Bounded word-boundary beam search; mapping is permanent for the entire line, or for one word in
 * the "word" layout. `bigrams` favour words that commonly follow the word before them.
 */
export function generateWordTyping(
  notes: readonly SongNote[],
  dictionary: readonly DictionaryEntry[],
  language: Language,
  overrides: Partial<OptimizerConfig> = {},
  bigrams: BigramTable = NO_BIGRAMS,
  { layout = "song", variant = 0 }: GenerationOptions = {}
): WordTypingResult {
  const config = resolveConfig(overrides);
  if (!Number.isSafeInteger(variant) || variant < 0)
    throw new Error("Неверный номер варианта текста");
  if (!notes.length) throw new Error("Выбранная партия не содержит нот");
  for (const note of notes) {
    if (
      !Number.isInteger(note.pitch) ||
      note.pitch < 0 ||
      note.pitch > 127 ||
      !Number.isFinite(note.start) ||
      note.start < 0 ||
      !Number.isFinite(note.duration) ||
      note.duration < 0
    ) {
      throw new Error("В партии обнаружена некорректная нота");
    }
  }
  const pool = tokenPool(language);
  const totalPitches = new Set(notes.map((note) => note.pitch)).size;
  if (totalPitches > pool.length) throw new Error("Недостаточно клавиш для всех высот мелодии");
  const empty = pool.map(() => -1);
  const letters = languageTokens(language);
  const letterIndexes = new Map(letters.map((token, index) => [token.display, index]));
  // A letter on the digit row (ё) is far from the hands: no word asks for it. Nearly every such
  // word has its spelling without it (еще, все), and the key stays free for a fallback.
  const farLetters = new Set(
    letters.filter((token) => token.physicalKey === "Backquote").map((token) => token.display)
  );
  const validEntries = dictionary.filter(
    (entry) =>
      entry.word.length > 0 &&
      Number.isFinite(entry.rank) &&
      entry.rank >= 1 &&
      Array.from(entry.word).every((letter) => letterIndexes.has(letter) && !farLetters.has(letter))
  );
  const trie = buildTrie(validEntries);
  const beams: State[][] = Array.from({ length: notes.length + 1 }, () => []);
  requiredAt(beams, 0).push({ mapping: empty, score: 0 });
  for (let position = 0; position < notes.length; position++) {
    const states = prune(beams[position] ?? [], config.beamWidth, layout);
    beams[position] = [];
    const note = requiredAt(notes, position);
    const fitting = (start: readonly number[], pitches: number) =>
      fittingWords(
        trie,
        notes,
        position,
        start,
        letterIndexes,
        pool,
        validEntries.length,
        pitches,
        config,
        variant
      );
    // A word's own mapping starts empty, so the words that fit are the same after every state; a
    // pair or a repeat moves a word by less than the margin kept here.
    const shared =
      layout === "word"
        ? fitting(empty, 0)
            .sort(byScore)
            .slice(0, config.maxCandidatesPerState * 8)
        : undefined;
    for (const state of states) {
      for (const candidate of wordCandidates(
        shared ?? fitting(state.mapping, totalPitches),
        state,
        config,
        bigrams
      )) {
        const target = position + candidate.indexes.length;
        const bucket = requiredAt(beams, target);
        bucket.push({
          mapping: layout === "word" ? empty : candidate.mapping,
          score: state.score + candidate.score,
          previous: state,
          segment: { start: position, indexes: candidate.indexes, entry: candidate.entry }
        });
        if (bucket.length > config.beamWidth * 8)
          beams[target] = prune(bucket, config.beamWidth * 2, layout);
      }
      const fallback = fallbackState(state, position, note, pool, letters.length, config);
      requiredAt(beams, position + 1).push(
        layout === "word" ? { ...fallback, mapping: empty } : fallback
      );
    }
  }
  const final = prune(beams[notes.length] ?? [], 1, layout)[0];
  if (!final) throw new Error("Не удалось построить текст для партии");
  return renderResult(final, notes, pool, language, bigrams, layout);
}
