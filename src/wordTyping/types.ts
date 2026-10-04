export type Language = "en" | "ru";
export type Part = "melody" | "bass";
export type Modifier = "none" | "shift" | "alt";
/** A letter plays one pitch in the whole song, or only inside its word. */
export type Layout = "song" | "word";

export interface InputToken {
  readonly physicalKey: string;
  readonly modifier: Modifier;
  readonly display: string;
}

export interface DictionaryEntry {
  readonly word: string;
  readonly rank: number;
  readonly frequency?: number;
}

export interface GeneratedToken {
  readonly noteIndex: number;
  readonly noteId: string;
  readonly pitch: number;
  readonly start: number;
  readonly duration: number;
  readonly input: InputToken;
  readonly word?: string;
  readonly wordIndex: number;
  readonly isFallback: boolean;
}

export interface QualityMetrics {
  readonly totalNotes: number;
  readonly uniquePitches: number;
  readonly dictionaryCoveredNotes: number;
  readonly dictionaryCoveragePercent: number;
  readonly fallbackPercent: number;
  readonly normalLetterCount: number;
  readonly topRowCount: number;
  readonly shiftCount: number;
  readonly altCount: number;
  readonly wordCount: number;
  readonly averageWordLength: number;
  readonly longestWordLength: number;
  readonly averageWordRank: number;
  /** Of the pairs of neighbouring words, the share seen together in real sentences. */
  readonly linkedPairsPercent: number;
  readonly readabilityScore: number;
  readonly typingComfortScore: number;
  readonly totalScore: number;
  readonly stars: number;
}

export interface WordTypingResult {
  readonly language: Language;
  /** "strict": one mapping for the whole song; "word": each word has its own, see the tokens. */
  readonly mode: "strict" | "word";
  readonly text: string;
  readonly tokens: readonly GeneratedToken[];
  readonly tokenToPitch: Readonly<Record<string, number>>;
  readonly pitchToTokens: Readonly<Record<number, string[]>>;
  readonly metrics: QualityMetrics;
}

export interface OptimizerConfig {
  readonly beamWidth: number;
  readonly maxWordLength: number;
  readonly maxCandidatesPerState: number;
  readonly coverageWeight: number;
  readonly frequencyWeight: number;
  readonly longWordWeight: number;
  readonly shortWordPenalty: number;
  readonly fallbackPenalty: number;
  readonly topRowPenalty: number;
  readonly shiftPenalty: number;
  readonly altPenalty: number;
  readonly homeRowBonus: number;
  readonly phraseBoundaryBonus: number;
  /** The bonus a letter for a word that commonly follows the one before it, at full strength. */
  readonly bigramWeight: number;
  /** Per letter, for a word already among the recent words of the text. */
  readonly repeatPenalty: number;
  /** Per letter, the largest random bonus a variant other than the first gives a word. */
  readonly variantNoise: number;
}
