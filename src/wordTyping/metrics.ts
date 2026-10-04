import { languageTokens } from "./inputTokens";
import type { DictionaryEntry, GeneratedToken, Language, QualityMetrics } from "./types";

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function qualityMetrics(
  tokens: readonly GeneratedToken[],
  words: readonly DictionaryEntry[],
  language: Language
): QualityMetrics {
  const totalNotes = tokens.length;
  const letters = new Set(languageTokens(language).map((token) => token.physicalKey));
  const dictionaryCoveredNotes = tokens.filter((token) => !token.isFallback).length;
  const normalLetterCount = tokens.filter(
    ({ input }) => input.modifier === "none" && letters.has(input.physicalKey)
  ).length;
  const shiftCount = tokens.filter(({ input }) => input.modifier === "shift").length;
  const altCount = tokens.filter(({ input }) => input.modifier === "alt").length;
  const topRowCount = totalNotes - normalLetterCount - shiftCount - altCount;
  const wordCount = words.length;
  const averageWordLength = wordCount ? dictionaryCoveredNotes / wordCount : 0;
  const longestWordLength = Math.max(0, ...words.map((entry) => entry.word.length));
  const averageWordRank = wordCount
    ? words.reduce((sum, entry) => sum + entry.rank, 0) / wordCount
    : 0;
  const dictionaryCoveragePercent = totalNotes ? (100 * dictionaryCoveredNotes) / totalNotes : 0;
  const fallbackPercent = totalNotes ? 100 - dictionaryCoveragePercent : 0;
  const frequencyQuality = wordCount
    ? words.reduce((sum, entry) => sum + 1 / Math.log2(entry.rank + 1), 0) / wordCount
    : 0;
  const lengthQuality = Math.min(1, averageWordLength / 6);
  const readabilityScore = clamp(
    dictionaryCoveragePercent * (0.75 + 0.15 * frequencyQuality + 0.1 * lengthQuality)
  );
  const typingComfortScore = totalNotes
    ? clamp(100 - (topRowCount * 15 + shiftCount * 45 + altCount * 75) / totalNotes)
    : 0;
  const totalScore = clamp(readabilityScore * 0.9 + typingComfortScore * 0.1);
  const stars =
    totalScore >= 95 ? 5 : totalScore >= 85 ? 4 : totalScore >= 70 ? 3 : totalScore >= 50 ? 2 : 1;
  return {
    totalNotes,
    uniquePitches: new Set(tokens.map((token) => token.pitch)).size,
    dictionaryCoveredNotes,
    dictionaryCoveragePercent,
    fallbackPercent,
    normalLetterCount,
    topRowCount,
    shiftCount,
    altCount,
    wordCount,
    averageWordLength,
    longestWordLength,
    averageWordRank,
    readabilityScore,
    typingComfortScore,
    totalScore,
    stars
  };
}
