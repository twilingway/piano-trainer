import { useEffect, useMemo, useState } from "react";
import type { KeyboardInputOptions } from "../input/computerKeyboard";
import type { Song } from "../song/song";
import { extractLine, withAccompaniment } from "../wordTyping/extractLine";
import { ALGORITHM_VERSION } from "../wordTyping/optimizer";
import { DEFAULT_CONFIG } from "../wordTyping/scoring";
import type { GeneratedToken, Part, WordTypingResult } from "../wordTyping/types";
import { loadWordTypingPrefs, saveWordTypingPrefs } from "./wordTypingPreferences";
import type { WordTypingPrefs } from "./wordTypingPreferences";

const DICTIONARY_VERSION =
  "FrequencyWords-2018-525f9b560de45753a5ea01069454e72e9aa541c6-filtered-v1";
interface Generation {
  readonly key: string;
  readonly result?: WordTypingResult;
  readonly runtimeMs?: number;
  readonly error?: string;
}
const cache = new Map<string, Generation>();
const NO_TOKENS: readonly GeneratedToken[] = [];

export function useWordTyping(song: Song, songKey: string, blocked = false) {
  const [prefs, setPrefs] = useState(loadWordTypingPrefs);
  const [selection, setSelection] = useState<{ songKey: string; part: Part }>({
    songKey,
    part: "melody"
  });
  const part = selection.songKey === songKey ? selection.part : "melody";
  const line = useMemo(() => extractLine(song, part), [song, part]);
  const practice = useMemo(
    () => (prefs.accompaniment ? withAccompaniment(song, line.song, part) : line.song),
    [prefs.accompaniment, song, line, part]
  );
  const key = useMemo(
    () =>
      JSON.stringify({
        notes: line.notes.map(({ id, pitch, start, duration }) => [id, pitch, start, duration]),
        part,
        language: prefs.language,
        size: prefs.dictionarySize,
        dictionary: DICTIONARY_VERSION,
        algorithm: ALGORITHM_VERSION,
        scope: "strict",
        config: DEFAULT_CONFIG
      }),
    [line, part, prefs.language, prefs.dictionarySize]
  );
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const current = generation?.key === key ? generation : cache.get(key);
  const empty = line.notes.length === 0;
  const error = empty
    ? "В выбранной партии нет нот. Выберите другую партию или песню."
    : current?.error;
  const pending = prefs.enabled && !empty && !current;

  useEffect(() => {
    if (!prefs.enabled || empty || cache.has(key)) return;
    const worker = new Worker(new URL("./wordTyping.worker.ts", import.meta.url), {
      type: "module"
    });
    worker.onmessage = (event: MessageEvent<Omit<Generation, "key">>) => {
      const next = { ...event.data, key };
      if (!next.error) {
        if (cache.size >= 12) cache.delete(cache.keys().next().value ?? "");
        cache.set(key, next);
      }
      setGeneration(next);
    };
    worker.onerror = () => {
      setGeneration({ key, error: "Ошибка генерации текста. Переключите режим и повторите." });
    };
    worker.postMessage({
      notes: line.notes,
      language: prefs.language,
      dictionarySize: prefs.dictionarySize
    });
    return () => {
      worker.terminate();
    };
  }, [prefs.enabled, prefs.language, prefs.dictionarySize, key, empty, line]);

  const keyboardOptions = useMemo<KeyboardInputOptions>(
    () => ({
      bindings: {},
      wordMapping: current?.result?.tokenToPitch ?? {},
      blocked: blocked || pending || Boolean(error)
    }),
    [current, pending, error, blocked]
  );
  const update = (change: Partial<WordTypingPrefs>) => {
    const next = { ...prefs, ...change };
    setPrefs(next);
    setStorageError(saveWordTypingPrefs(next) ? null : "Не удалось сохранить настройки режима.");
  };
  return {
    ...prefs,
    part,
    line,
    result: current?.result,
    /** The computer keys' inputs while the mode is on; none yet while the words are chosen. */
    keyTokens: prefs.enabled ? (current?.result?.tokens ?? NO_TOKENS) : undefined,
    runtimeMs: current?.runtimeMs,
    pending,
    error,
    storageError,
    keyboardOptions,
    update,
    choosePart: (next: Part) => {
      setSelection({ songKey, part: next });
    },
    setAccompaniment: (accompaniment: boolean) => {
      update({ accompaniment });
    },
    practiceSong: prefs.enabled ? practice : song,
    practiceKey: prefs.enabled
      ? `${songKey}:word-typing:${part}${prefs.accompaniment ? ":accompaniment" : ""}`
      : songKey
  };
}
export type WordTypingControls = ReturnType<typeof useWordTyping>;
