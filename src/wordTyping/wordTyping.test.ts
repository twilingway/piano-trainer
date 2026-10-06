import { describe, expect, it } from "vitest";
import type { Song, SongNote } from "../song/song";
import { buildTrie, normalizeWords } from "./dictionary";
import { extractLine, withAccompaniment } from "./extractLine";
import { OVERDRIVE_KEY, inputTokenId, languageTokens, tokenPool } from "./inputTokens";
import { generateWordTyping } from "./optimizer";
import { DEFAULT_CONFIG, inputPenalty, wordScore } from "./scoring";
import type { Language } from "./types";

function line(pitches: readonly number[]): SongNote[] {
  return pitches.map((pitch, index) => ({
    id: `n${String(index)}`,
    pitch,
    start: index,
    startBeat: index * 2,
    duration: 0.8,
    hand: "right"
  }));
}

function song(notes: readonly SongNote[]): Song {
  return { title: "Тест", source: "midi", notes, beats: [], measures: [], duration: 20 };
}

function noteAt(notes: readonly SongNote[], index: number): SongNote {
  const note = notes[index];
  if (!note) throw new Error("Missing test note");
  return note;
}

describe("word typing dictionaries and physical tokens", () => {
  it("normalizes language, NFC, duplicates and ranks without destroying ё", () => {
    expect(normalizeWords(["HELLO", " hello ", "12", "can't", "a", "музыка"], "en")).toEqual([
      { word: "hello", rank: 1 },
      { word: "a", rank: 2 }
    ]);
    expect(normalizeWords(["ЁЖ", "ЕЖ", "е\u0308ж", "Музыка", "два-слова", "abc"], "ru")).toEqual([
      { word: "ёж", rank: 1 },
      { word: "еж", rank: 2 },
      { word: "музыка", rank: 3 }
    ]);
  });

  it("builds a Trie with prefix continuations and complete ranks", () => {
    const trie = buildTrie(normalizeWords(["a", "at", "as"], "en"));
    const a = trie.children.get("a");
    expect(a?.entry?.rank).toBe(1);
    expect([...(a?.children.keys() ?? [])]).toEqual(["t", "s"]);
    expect(a?.children.get("t")?.entry?.word).toBe("at");
  });

  it.each(["en", "ru"] as const)("makes unique finite tiered input tokens for %s", (language) => {
    const pool = tokenPool(language);
    expect(new Set(pool.map(inputTokenId)).size).toBe(pool.length);
    const firstShift = pool.findIndex((token) => token.modifier === "shift");
    const firstAlt = pool.findIndex((token) => token.modifier === "alt");
    expect(pool.slice(0, firstShift).every((token) => token.modifier === "none")).toBe(true);
    expect(pool.slice(firstShift, firstAlt).every((token) => token.modifier === "shift")).toBe(
      true
    );
    expect(pool.slice(firstAlt).every((token) => token.modifier === "alt")).toBe(true);
    expect(pool.length).toBeGreaterThanOrEqual(128);
    expect(pool.filter((token) => token.physicalKey === OVERDRIVE_KEY)).toEqual([]);
  });

  it("uses physical codes for Cyrillic letters including Russian punctuation positions", () => {
    const ru = languageTokens("ru");
    expect(ru).toContainEqual({ physicalKey: "KeyQ", modifier: "none", display: "й" });
    expect(ru).toContainEqual({ physicalKey: "Backquote", modifier: "none", display: "ё" });
    expect(ru).toHaveLength(33);
  });
});

describe("mono line extraction", () => {
  it("uses chosen hand, selects extremum at simultaneous onset and caps overlapping holds", () => {
    const notes = line([60, 72, 65, 48, 40]);
    const original = song([
      { ...noteAt(notes, 0), start: 0, duration: 5 },
      { ...noteAt(notes, 1), start: 0.0000005, duration: 3 },
      { ...noteAt(notes, 2), start: 1, duration: 2 },
      { ...noteAt(notes, 3), start: 0, hand: "left" },
      { ...noteAt(notes, 4), start: 0, hand: "left" }
    ]);
    const melody = extractLine(original, "melody");
    expect(melody.notes.map((note) => note.pitch)).toEqual([72, 65]);
    expect(melody.notes[0]?.start).toBe(0);
    expect(melody.notes[0]?.duration).toBe(1);
    expect(melody.discardedNotes).toBe(1);
    expect(melody.song.duration).toBe(3);
    expect(extractLine(original, "bass").notes.map((note) => [note.pitch, note.hand])).toEqual([
      [40, "right"]
    ]);
    expect(original.notes[1]?.duration).toBe(3);
    expect(original.notes[4]?.hand).toBe("left");
  });

  it("does not manufacture a missing hand", () => {
    const bass = extractLine(song(line([60, 62])), "bass");
    expect(bass.notes).toEqual([]);
    expect(bass.song.duration).toBe(0);
  });

  it("adds the other hand as the session's own accompaniment", () => {
    const notes = line([72, 74, 48, 50]);
    const original = song([
      noteAt(notes, 0),
      noteAt(notes, 1),
      { ...noteAt(notes, 2), start: 0.5, duration: 4, hand: "left" },
      { ...noteAt(notes, 3), start: 1, hand: "left" }
    ]);
    const melody = extractLine(original, "melody");
    const full = withAccompaniment(original, melody.song, "melody");
    expect(full.notes.map((note) => [note.pitch, note.hand])).toEqual([
      [72, "right"],
      [48, "left"],
      [50, "left"],
      [74, "right"]
    ]);
    expect(full.duration).toBe(4.5);
    const bass = extractLine(original, "bass");
    expect(
      withAccompaniment(original, bass.song, "bass").notes.map((note) => [note.pitch, note.hand])
    ).toEqual([
      [72, "left"],
      [48, "right"],
      [50, "right"],
      [74, "left"]
    ]);
    expect(withAccompaniment(song(line([60])), melody.song, "melody")).toBe(melody.song);
  });
});

describe("bounded generator", () => {
  it("allows multiple letters per pitch while no token changes pitch", () => {
    const notes = line([60, 60, 60, 60]);
    const result = generateWordTyping(notes, normalizeWords(["rain"], "en"), "en");
    expect(result.text).toBe("rain");
    expect(result.pitchToTokens[60]).toHaveLength(4);
    for (const token of result.tokens)
      expect(result.tokenToPitch[inputTokenId(token.input)]).toBe(token.pitch);
    expect(result.tokens.map((token) => token.noteId)).toEqual(notes.map((note) => note.id));
  });

  it("rejects inconsistent repeated letters and keeps fallback outside complete words", () => {
    const result = generateWordTyping(
      line([60, 62, 64, 65, 67]),
      normalizeWords(["hello"], "en"),
      "en"
    );
    expect(result.metrics.dictionaryCoveredNotes).toBe(0);
    expect(result.tokens.every((token) => token.isFallback)).toBe(true);
    expect(result.text).toMatch(/^\[[^\]]+\]( \[[^\]]+\])*$/u);
    expect(new Set(result.tokens.map((token) => token.wordIndex)).size).toBe(5);
  });

  it("uses full words across measure boundaries and duration never duplicates letters", () => {
    const notes = line([60, 62, 64, 64, 65]);
    notes[0] = { ...noteAt(notes, 0), duration: 12 };
    const result = generateWordTyping(notes, normalizeWords(["hello"], "en"), "en");
    expect(result.text).toBe("hello");
    expect(result.tokens).toHaveLength(5);
    expect(result.tokens[0]?.duration).toBe(12);
    expect(result.tokens.map((token) => token.wordIndex)).toEqual([0, 0, 0, 0, 0]);
    expect(result.metrics.dictionaryCoveragePercent).toBe(100);
    expect(result.metrics.averageWordLength).toBe(5);
  });

  it.each(["en", "ru"] as const)(
    "covers all 128 MIDI pitches with finite cascade for %s",
    (language: Language) => {
      const result = generateWordTyping(
        line(Array.from({ length: 128 }, (_, i) => i)),
        [],
        language
      );
      const letters = languageTokens(language).length;
      expect(result.tokens).toHaveLength(128);
      expect(new Set(result.tokens.map((token) => inputTokenId(token.input))).size).toBe(128);
      expect(result.metrics.normalLetterCount).toBe(letters);
      const mods = result.tokens.map((token) => token.input.modifier);
      const firstShift = mods.indexOf("shift");
      const firstAlt = mods.indexOf("alt");
      expect(firstShift).toBe(tokenPool(language).findIndex((token) => token.modifier === "shift"));
      // Every printable key but 0, which is Overdrive's.
      expect(firstAlt - firstShift).toBe(46);
      expect(result.metrics.shiftCount).toBe(46);
      for (const token of result.tokens)
        expect(result.tokenToPitch[inputTokenId(token.input)]).toBe(token.pitch);
    }
  );

  it("reuses an existing fallback mapping for repeated pitches without allocating more tokens", () => {
    const result = generateWordTyping(line([60, 62, 60, 62]), [], "en");
    expect(Object.keys(result.tokenToPitch)).toHaveLength(2);
    expect(result.tokens[0]?.input).toEqual(result.tokens[2]?.input);
    expect(result.tokens[1]?.input).toEqual(result.tokens[3]?.input);
  });

  it("reserves enough keys for future pitches instead of exhausting them with early aliases", () => {
    const notes = line([
      ...Array.from({ length: 26 }, () => 0),
      ...Array.from({ length: 127 }, (_, index) => index + 1)
    ]);
    const result = generateWordTyping(
      notes,
      normalizeWords(["abcdefghijklmnopqrstuvwxyz"], "en"),
      "en",
      { maxWordLength: 26 }
    );
    expect(result.tokens).toHaveLength(153);
    expect(result.metrics.uniquePitches).toBe(128);
    expect(result.metrics.dictionaryCoveredNotes).toBe(0);
    for (const token of result.tokens)
      expect(result.tokenToPitch[inputTokenId(token.input)]).toBe(token.pitch);
  });

  it("is deterministic and JSON serializable", () => {
    const notes = line([60, 62, 64, 60, 62, 64, 64, 65, 60, 62]);
    const dictionary = normalizeWords(["rain", "at", "cat", "hello", "can", "and", "a"], "en");
    const one = generateWordTyping(notes, dictionary, "en", { beamWidth: 12 });
    expect(generateWordTyping(notes, dictionary, "en", { beamWidth: 12 })).toEqual(one);
    expect(JSON.parse(JSON.stringify(one))).toEqual(one);
  });

  it("rejects empty/invalid musical lines and invalid search configuration", () => {
    expect(() => generateWordTyping([], [], "en")).toThrow("нет нот");
    expect(() => generateWordTyping(line([128]), [], "en")).toThrow("некорректная нота");
    expect(() => generateWordTyping(line([1.5]), [], "en")).toThrow("некорректная нота");
    expect(() => generateWordTyping(line([60]), [], "en", { beamWidth: 0 })).toThrow(
      "Неверная настройка"
    );
  });
});

describe("per-word layout and variants", () => {
  it("keeps a letter on one pitch inside a word and lets the next word move it", () => {
    const notes = line([60, 62, 60, 62, 64, 65, 64, 65]);
    const dictionary = normalizeWords(["abab"], "en");
    const result = generateWordTyping(notes, dictionary, "en", {}, undefined, { layout: "word" });
    expect(result.mode).toBe("word");
    expect(result.text).toBe("abab abab");
    expect(result.tokenToPitch).toEqual({});
    const pitchOf = (wordIndex: number, display: string) => [
      ...new Set(
        result.tokens
          .filter((token) => token.wordIndex === wordIndex && token.input.display === display)
          .map((token) => token.pitch)
      )
    ];
    expect(pitchOf(0, "a")).toEqual([60]);
    expect(pitchOf(1, "a")).toEqual([64]);
    expect(pitchOf(1, "b")).toEqual([65]);
    const song = generateWordTyping(notes, dictionary, "en");
    expect(song.mode).toBe("strict");
    expect(song.metrics.dictionaryCoveredNotes).toBe(4);
  });

  it("types every fallback on the left index finger's home key", () => {
    const notes = line([60, 62, 64]);
    for (const language of ["en", "ru"] as const) {
      const result = generateWordTyping(notes, [], language, {}, undefined, { layout: "word" });
      expect(result.tokens.map((token) => [token.input.physicalKey, token.pitch])).toEqual([
        ["KeyF", 60],
        ["KeyF", 62],
        ["KeyF", 64]
      ]);
    }
  });

  it("prefers a word the text has not used yet", () => {
    const notes = line([60, 62, 64, 65, 60, 62, 64, 65]);
    const dictionary = normalizeWords(["rain", "cold"], "en");
    const result = generateWordTyping(notes, dictionary, "en", {}, undefined, { layout: "word" });
    expect(result.text).toBe("rain cold");
  });

  it("gives the first variant by default, repeats a variant and varies the text across them", () => {
    const notes = line([60, 62, 64, 65]);
    const dictionary = normalizeWords(["rain", "cold", "warm", "blue", "fast"], "en");
    const generate = (variant: number) =>
      generateWordTyping(notes, dictionary, "en", {}, undefined, { layout: "word", variant });
    expect(generate(0)).toEqual(
      generateWordTyping(notes, dictionary, "en", {}, undefined, { layout: "word" })
    );
    expect(generate(0).text).toBe("rain");
    // The same text for a variant whatever was generated before it: no hidden state, no randomness.
    const forward = Array.from({ length: 8 }, (_, index) => generate(index + 1).text);
    const backward = Array.from({ length: 8 }, (_, index) => generate(8 - index).text).reverse();
    expect(backward).toEqual(forward);
    expect(new Set(forward).size).toBeGreaterThan(1);
    expect(() => generate(-1)).toThrow("варианта");
    expect(() => generate(2 ** 32)).toThrow("варианта");
  });
});

describe("scoring and quality", () => {
  it("prefers frequent words and rewards long words over excessive short words", () => {
    expect(wordScore({ word: "hello", rank: 1 }, 3000, DEFAULT_CONFIG)).toBeGreaterThan(
      wordScore({ word: "hello", rank: 3000 }, 3000, DEFAULT_CONFIG)
    );
    expect(wordScore({ word: "rain", rank: 1 }, 3000, DEFAULT_CONFIG)).toBeGreaterThan(
      2 * wordScore({ word: "at", rank: 1 }, 3000, DEFAULT_CONFIG)
    );
  });

  it("makes modifier penalties configurable and strictly ordered", () => {
    const letter = { physicalKey: "KeyA", modifier: "none" as const, display: "a" };
    const top = { physicalKey: "Digit1", modifier: "none" as const, display: "1" };
    expect(inputPenalty(letter, true, DEFAULT_CONFIG)).toBe(0);
    expect(inputPenalty(top, false, DEFAULT_CONFIG)).toBeLessThan(
      inputPenalty({ ...letter, modifier: "shift" }, false, DEFAULT_CONFIG)
    );
    expect(inputPenalty({ ...letter, modifier: "shift" }, false, DEFAULT_CONFIG)).toBeLessThan(
      inputPenalty({ ...letter, modifier: "alt" }, false, DEFAULT_CONFIG)
    );
    expect(inputPenalty(top, false, { ...DEFAULT_CONFIG, topRowPenalty: 27 })).toBe(27);
  });

  it("rates readable dictionary text above the same sequence of fallback letters", () => {
    const notes = line([60, 62, 64, 65]);
    const words = generateWordTyping(notes, normalizeWords(["rain"], "en"), "en");
    const fallback = generateWordTyping(notes, [], "en");
    expect(words.metrics.totalScore).toBeGreaterThan(fallback.metrics.totalScore);
    expect(words.metrics.averageWordRank).toBe(1);
    expect(words.metrics.totalScore).toBeGreaterThanOrEqual(0);
    expect(words.metrics.totalScore).toBeLessThanOrEqual(100);
  });
});

describe("the far letter ё", () => {
  it("never asks for ё, even for the most frequent word, and leaves its key last", () => {
    // ещё would fit three notes best; еще, without ё, must take its place.
    const dictionary = normalizeWords(["ещё", "еще"], "ru");
    const result = generateWordTyping(line([60, 62, 60]), dictionary, "ru");
    expect(result.text).toBe("еще");
    expect(result.tokens.some((token) => token.input.physicalKey === "Backquote")).toBe(false);
    expect(languageTokens("ru").at(-1)?.physicalKey).toBe("Backquote");
  });
});
