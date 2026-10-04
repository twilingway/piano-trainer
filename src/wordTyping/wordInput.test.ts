import { describe, expect, it } from "vitest";
import { inputTokenId, tokenPool } from "./inputTokens";
import type { GeneratedToken } from "./types";
import { wordKeyPitch } from "./wordInput";

const keyboard = new Set(tokenPool("ru").map(inputTokenId));

// «мама» on 60 62 60 62, then «мак» on 64 65 67: М moves from 60 to 64 between the words.
const tokens: GeneratedToken[] = [
  ["KeyV", "м", 60, 0],
  ["KeyF", "а", 62, 0],
  ["KeyV", "м", 60, 0],
  ["KeyF", "а", 62, 0],
  ["KeyV", "м", 64, 1],
  ["KeyF", "а", 65, 1],
  ["KeyR", "к", 67, 1]
].map(([physicalKey, display, pitch, wordIndex], index) => ({
  noteIndex: index,
  noteId: `n${String(index)}`,
  pitch: pitch as number,
  start: index,
  duration: 0.5,
  input: { physicalKey: physicalKey as string, modifier: "none", display: display as string },
  wordIndex: wordIndex as number,
  isFallback: false,
  word: wordIndex === 0 ? "мама" : "мак"
}));

describe("per-word key input", () => {
  it("plays the owed word's pitch for one of its letters", () => {
    expect(wordKeyPitch(tokens, "n0", "none:KeyV", keyboard)).toBe(60);
    expect(wordKeyPitch(tokens, "n2", "none:KeyF", keyboard)).toBe(62);
  });

  it("plays a semitone below the owed note for a letter the word lacks", () => {
    expect(wordKeyPitch(tokens, "n1", "none:KeyR", keyboard)).toBe(61);
  });

  it("moves a letter to the next word's pitch once that word is owed", () => {
    expect(wordKeyPitch(tokens, "n4", "none:KeyV", keyboard)).toBe(64);
    expect(wordKeyPitch(tokens, "n6", "none:KeyR", keyboard)).toBe(67);
  });

  it("keeps the last word after the line ends and ignores keys off the mode's keyboard", () => {
    expect(wordKeyPitch(tokens, undefined, "none:KeyF", keyboard)).toBe(65);
    expect(wordKeyPitch(tokens, "n0", "none:Space", keyboard)).toBeUndefined();
    expect(wordKeyPitch([], "n0", "none:KeyV", keyboard)).toBeUndefined();
  });

  it("skips a pitch a nearby note has, so a stray key never hits it", () => {
    const close = tokens.map((token) => (token.noteId === "n2" ? { ...token, pitch: 61 } : token));
    expect(wordKeyPitch(close, "n1", "none:KeyR", keyboard)).toBe(63);
    // Far notes do not count: n6 (67) is 5 s from n1.
    const far = tokens.map((token) => (token.noteId === "n6" ? { ...token, pitch: 61 } : token));
    expect(wordKeyPitch(far, "n1", "none:KeyR", keyboard)).toBe(61);
  });

  it("goes a semitone up from the lowest pitch", () => {
    const low = tokens.map((token) => ({ ...token, pitch: 0 }));
    expect(wordKeyPitch(low, "n0", "none:KeyR", keyboard)).toBe(1);
  });
});
