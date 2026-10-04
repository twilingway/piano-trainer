import { describe, expect, it } from "vitest";

import { normalizeFrequencyList } from "./dictionarySource";

describe("frequency resource preparation", () => {
  it("preserves source order and frequency while re-ranking accepted English words", () => {
    const entries = normalizeFrequencyList(
      "THE 900\nthe 899\ndon't 850\nx 800\nshit 750\na 700\nhello 650\ninvalid 1.5\nworld 0\ni 600",
      "en",
      4
    );
    expect(entries).toEqual([
      { word: "the", rank: 1, frequency: 900 },
      { word: "a", rank: 2, frequency: 700 },
      { word: "hello", rank: 3, frequency: 650 },
      { word: "i", rank: 4, frequency: 600 }
    ]);
  });

  it("accepts Russian letter whitelist and NFC ё while rejecting obscene entries", () => {
    const entries = normalizeFrequencyList(
      "И 900\nЯ 850\nе\u0308ж 800\nЁЖ 750\nж 700\nхуй 650\nмузыка 600",
      "ru",
      4
    );
    expect(entries.map((entry) => entry.word)).toEqual(["и", "я", "ёж", "музыка"]);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
  });

  it("does not replace an incomplete source with a miniature fallback", () => {
    expect(() => normalizeFrequencyList("music 100\na 80", "en", 3000)).toThrow(
      "найдено 2 слов вместо 3000"
    );
  });
});
