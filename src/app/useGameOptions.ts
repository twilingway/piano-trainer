import { useEffect, useMemo, useState } from "react";
import type { Difficulty } from "../practice/gameRules";

interface Preferences {
  difficulty: Difficulty;
  performance: boolean;
  stopOnError: boolean;
  ranked: boolean;
}
const DEFAULTS: Preferences = {
  difficulty: "normal",
  performance: false,
  stopOnError: false,
  ranked: false
};
function load(): Preferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("game-options-v1") ?? "null");
    if (!value || typeof value !== "object") return DEFAULTS;
    const raw = value as Record<string, unknown>;
    return {
      difficulty: ["easy", "normal", "hard", "expert"].includes(String(raw.difficulty))
        ? (raw.difficulty as Difficulty)
        : "normal",
      performance: raw.performance === true,
      stopOnError: raw.stopOnError === true,
      ranked: raw.ranked === true
    };
  } catch {
    return DEFAULTS;
  }
}
export function useGameOptions(songKey: string, duration: number, practiceOnly = false) {
  const [preferences, setPreferences] = useState(load);
  const ranked = preferences.ranked && !practiceOnly;
  const [storedRange, setRange] = useState({ songKey, from: 0, to: duration, loop: false });
  const range =
    storedRange.songKey === songKey ? storedRange : { songKey, from: 0, to: duration, loop: false };
  useEffect(() => {
    try {
      localStorage.setItem("game-options-v1", JSON.stringify(preferences));
    } catch {
      /* Storage is optional. */
    }
  }, [preferences]);
  const update = (change: Partial<Preferences>) => {
    setPreferences((current) => ({ ...current, ...change }));
  };
  const updateRange = (change: Partial<typeof range>) => {
    const next = { ...range, ...change };
    next.from = Math.max(0, Math.min(next.from, Math.max(0, duration - 0.01)));
    next.to = Math.max(next.from + 0.01, Math.min(next.to, duration));
    setRange(next);
  };
  const options = useMemo(
    () => ({
      difficulty: preferences.difficulty,
      from: ranked ? 0 : range.from,
      to: ranked ? duration : range.to
    }),
    [preferences.difficulty, ranked, range.from, range.to, duration]
  );
  return { ...preferences, ranked, range, options, update, updateRange };
}
