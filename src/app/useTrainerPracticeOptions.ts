import { useMemo } from "react";
import type { Hand } from "../fingering/fingering";
import type { PracticeMode, PracticeOptions } from "../practice/session";
import { INDEPENDENT_RHYTHM_PRACTICE_OPTIONS } from "../practice/independentRhythmPolicy";
import { RHYTHM_PRACTICE_OPTIONS } from "../practice/rhythmPolicy";
import { TWO_HAND_PRACTICE_OPTIONS } from "../practice/twoHandPolicy";
import { BASS_READING_PRACTICE_OPTIONS, READING_PRACTICE_OPTIONS } from "../practice/readingPolicy";
import { ROLE_HAND, type PartRole } from "../song/midiParts";
import type { Song } from "../song/song";
import type { HandChoice } from "./playerPrefs";

const HANDS: Readonly<Record<HandChoice, readonly Hand[]>> = {
  right: ["right"],
  left: ["left"],
  both: ["right", "left"],
  listen: []
};
interface Options {
  readonly music: PracticeOptions | undefined;
  readonly independentRhythm: boolean;
  readonly rhythm: boolean;
  readonly reading: boolean;
  readonly readingHand: Hand | "both";
  readonly listening: boolean;
  readonly partRole: PartRole | null;
  readonly song: Song;
  readonly mode: PracticeMode;
  readonly speed: number;
  readonly accompaniment: boolean;
  readonly gameOptions:
    Pick<PracticeOptions, "difficulty" | "learningWindow" | "from" | "to" | "playable"> | undefined;
  readonly wordTyping: boolean;
  readonly handChoice: HandChoice;
}

export function useTrainerPracticeOptions({
  music,
  independentRhythm,
  rhythm,
  reading,
  readingHand,
  listening,
  partRole,
  song,
  mode,
  speed,
  accompaniment,
  gameOptions,
  wordTyping,
  handChoice
}: Options): PracticeOptions {
  return useMemo(() => {
    if (music) return music;
    if (independentRhythm) return INDEPENDENT_RHYTHM_PRACTICE_OPTIONS;
    if (rhythm) return RHYTHM_PRACTICE_OPTIONS;
    if (reading)
      return readingHand === "both"
        ? TWO_HAND_PRACTICE_OPTIONS
        : readingHand === "left"
          ? BASS_READING_PRACTICE_OPTIONS
          : READING_PRACTICE_OPTIONS;
    if (listening) return { mode: "tempo", hands: new Set<Hand>(), speed };
    if (partRole) {
      const parts = (song.parts ?? []).filter((part) => part.role === partRole);
      return {
        mode,
        hands: new Set([ROLE_HAND[partRole]]),
        parts: new Set(parts.map((part) => part.id)),
        speed,
        accompaniment,
        ...gameOptions
      };
    }
    const hands = new Set(HANDS[wordTyping ? "right" : handChoice]);
    return { mode, hands, speed, accompaniment, ...gameOptions, noteResult: !wordTyping };
  }, [
    music,
    independentRhythm,
    rhythm,
    reading,
    readingHand,
    listening,
    partRole,
    song.parts,
    mode,
    speed,
    accompaniment,
    gameOptions,
    wordTyping,
    handChoice
  ]);
}
