import { describe, expect, it } from "vitest";
import type { SongNote } from "../song/song";
import { NO_BIGRAMS, countBigrams, decodeBigrams, encodeBigrams } from "./bigrams";
import { normalizeWords } from "./dictionary";
import { generateWordTyping } from "./optimizer";

const dictionary = normalizeWords(["я", "не", "знаю", "что", "он", "она"], "ru");
const rank = (word: string) => dictionary.find((entry) => entry.word === word)?.rank ?? -1;

describe("bigrams", () => {
  it("counts neighbouring dictionary words within a phrase only", () => {
    const counts = countBigrams(
      ["Я не знаю.", "Я не знаю, что он…", "Не-знаю 5 я", "я не"],
      "ru",
      dictionary
    );
    const pairs = encodeBigrams(counts, 10, 1);
    const table = new Map<string, number>();
    for (let index = 0; index < pairs.length; index += 3) {
      table.set(`${String(pairs[index])}-${String(pairs[index + 1])}`, pairs[index + 2] ?? 0);
    }
    expect(table.get(`${String(rank("я"))}-${String(rank("не"))}`)).toBe(3);
    expect(table.get(`${String(rank("не"))}-${String(rank("знаю"))}`)).toBe(2);
    expect(table.get(`${String(rank("что"))}-${String(rank("он"))}`)).toBe(1);
    // A comma, a hyphen and a digit break the chain.
    expect(table.has(`${String(rank("знаю"))}-${String(rank("что"))}`)).toBe(false);
    expect(table.has(`${String(rank("знаю"))}-${String(rank("я"))}`)).toBe(false);
  });

  it("keeps the most common pairs seen often enough, and reads them back by strength", () => {
    const counts = new Map([
      [1 * 65536 + 2, 8],
      [2 * 65536 + 3, 1],
      [3 * 65536 + 9000, 4]
    ]);
    const flat = encodeBigrams(counts, 10, 2);
    expect(flat).toEqual([1, 2, 8, 3, 9000, 4]);
    const table = decodeBigrams(flat, 1000);
    expect(table.strength(1, 2)).toBe(1);
    expect(table.strength(2, 3)).toBe(0);
    // A word beyond the dictionary in use: no pair.
    expect(table.strength(3, 9000)).toBe(0);
    expect(NO_BIGRAMS.strength(1, 2)).toBe(0);
  });

  it("makes the generator pick the word that commonly follows", () => {
    // "я" then a two-letter word: "он" and "не" fit the same notes, "не" follows "я" in speech.
    const notes: SongNote[] = [60, 62, 64].map((pitch, index) => ({
      id: `n${String(index)}`,
      pitch,
      start: index,
      startBeat: index,
      duration: 0.5,
      hand: "right"
    }));
    const words = normalizeWords(["я", "он", "не"], "ru");
    const ranks = (word: string) => words.find((entry) => entry.word === word)?.rank ?? -1;
    const linked = decodeBigrams([ranks("я"), ranks("не"), 50], words.length);
    const plain = generateWordTyping(notes, words, "ru");
    const joined = generateWordTyping(notes, words, "ru", {}, linked);
    expect(plain.text).toBe("я он");
    expect(joined.text).toBe("я не");
    expect(joined.metrics.linkedPairsPercent).toBe(100);
    expect(plain.metrics.linkedPairsPercent).toBe(0);
  });
});
