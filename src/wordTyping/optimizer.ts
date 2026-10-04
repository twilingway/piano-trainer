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
  OptimizerConfig,
  WordTypingResult
} from "./types";

export { DEFAULT_CONFIG } from "./scoring";
export const ALGORITHM_VERSION = "word-typing-v2";

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

function prune(states: readonly State[], width: number): State[] {
  const ordered = [...states].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const result: State[] = [];
  for (const state of ordered) {
    const key = state.mapping.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(state);
    if (result.length === width) break;
  }
  return result;
}

function wordCandidates(
  trie: TrieNode,
  notes: readonly SongNote[],
  position: number,
  state: State,
  letterIndexes: ReadonlyMap<string, number>,
  pool: readonly InputToken[],
  dictionarySize: number,
  totalPitches: number,
  config: OptimizerConfig,
  bigrams: BigramTable
): Candidate[] {
  // A word after a word: a pair that real sentences use reads as a phrase.
  const previous = state.segment?.entry;
  const mapping = [...state.mapping];
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
      candidates.push({
        mapping: [...mapping],
        entry: node.entry,
        indexes: [...indexes],
        score:
          wordScore(node.entry, dictionarySize, config) +
          boundary +
          comfort +
          (previous ? config.bigramWeight * bigrams.strength(previous.rank, node.entry.rank) : 0)
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
  return candidates
    .sort((a, b) => b.score - a.score || a.entry.rank - b.entry.rank)
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
  bigrams: BigramTable
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
    mode: "strict",
    text: blocks.join(" "),
    tokens,
    tokenToPitch,
    pitchToTokens,
    metrics: qualityMetrics(tokens, words, language, pairs)
  };
}

/**
 * Bounded word-boundary beam search; mapping is permanent for the entire line. `bigrams` favour
 * words that commonly follow the word before them.
 */
export function generateWordTyping(
  notes: readonly SongNote[],
  dictionary: readonly DictionaryEntry[],
  language: Language,
  overrides: Partial<OptimizerConfig> = {},
  bigrams: BigramTable = NO_BIGRAMS
): WordTypingResult {
  const config = resolveConfig(overrides);
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
  const letters = languageTokens(language);
  const letterIndexes = new Map(letters.map((token, index) => [token.display, index]));
  const validEntries = dictionary.filter(
    (entry) =>
      entry.word.length > 0 &&
      Number.isFinite(entry.rank) &&
      entry.rank >= 1 &&
      Array.from(entry.word).every((letter) => letterIndexes.has(letter))
  );
  const trie = buildTrie(validEntries);
  const beams: State[][] = Array.from({ length: notes.length + 1 }, () => []);
  requiredAt(beams, 0).push({ mapping: pool.map(() => -1), score: 0 });
  for (let position = 0; position < notes.length; position++) {
    const states = prune(beams[position] ?? [], config.beamWidth);
    beams[position] = [];
    const note = requiredAt(notes, position);
    for (const state of states) {
      for (const candidate of wordCandidates(
        trie,
        notes,
        position,
        state,
        letterIndexes,
        pool,
        validEntries.length,
        totalPitches,
        config,
        bigrams
      )) {
        const target = position + candidate.indexes.length;
        const bucket = requiredAt(beams, target);
        bucket.push({
          mapping: candidate.mapping,
          score: state.score + candidate.score,
          previous: state,
          segment: { start: position, indexes: candidate.indexes, entry: candidate.entry }
        });
        if (bucket.length > config.beamWidth * 8)
          beams[target] = prune(bucket, config.beamWidth * 2);
      }
      requiredAt(beams, position + 1).push(
        fallbackState(state, position, note, pool, letters.length, config)
      );
    }
  }
  const final = prune(beams[notes.length] ?? [], 1)[0];
  if (!final) throw new Error("Не удалось построить текст для партии");
  return renderResult(final, notes, pool, language, bigrams);
}
