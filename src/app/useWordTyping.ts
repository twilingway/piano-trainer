import { practiceActions } from "./practiceSlice";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardInputOptions } from "../input/computerKeyboard";
import type { ComputerKeyboard } from "../render/computerKeys";
import type { Song } from "../song/song";
import { extractLine, withAccompaniment } from "../wordTyping/extractLine";
import { inputTokenId, tokenPool } from "../wordTyping/inputTokens";
import { ALGORITHM_VERSION } from "../wordTyping/optimizer";
import { DEFAULT_CONFIG } from "../wordTyping/scoring";
import type { GeneratedToken, Language, Part, WordTypingResult } from "../wordTyping/types";
import { wordKeyPitch } from "../wordTyping/wordInput";
import { preferencesActions } from "./preferencesSlice";
import { useAppDispatch, useAppSelector } from "./storeHooks";
import { persistenceKey } from "./preferencePersistence";
import type { WordTypingPrefs } from "./wordTypingPreferences";
import { useI18n } from "./useI18n";

/** The pairs' resource, from Tatoeba's export of that day (src/wordTypingTools/prepare.ts). */
const BIGRAM_VERSION = "Tatoeba-2026-10-03-pairs-v1";
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

export function useWordTyping(song: Song, songKey: string, blocked = false, suspended = false) {
  const storedPrefs = useAppSelector((state) => state.preferences.word);
  const prefs = { ...storedPrefs, enabled: storedPrefs.enabled && !suspended };
  const dispatch = useAppDispatch();
  const saveError = useAppSelector(
    (state) => state.persistence.errors[persistenceKey("word-typing-prefs-v1", "write")]
  );
  const storageError = saveError ? "Не удалось сохранить настройки режима." : null;
  const selection = useAppSelector((state) => state.practice.wordSelection);
  const part = selection.songKey === songKey ? selection.part : "melody";
  const line = useMemo(() => extractLine(song, part), [song, part]);
  const practice = useMemo(
    () => (prefs.accompaniment ? withAccompaniment(song, line.song, part) : line.song),
    [prefs.accompaniment, song, line, part]
  );
  // A variant belongs to one line, language and layout; any change starts from the first again.
  const base = useMemo(
    () =>
      JSON.stringify({
        notes: line.notes.map(({ id, pitch, start, duration }) => [id, pitch, start, duration]),
        part,
        language: prefs.language,
        layout: prefs.layout
      }),
    [line, part, prefs.language, prefs.layout]
  );
  const [chosen, setChosen] = useState({ base, variant: 0, previousText: "" });
  // Reset during render, so a base that comes back does not bring its old variant with it.
  if (chosen.base !== base) setChosen({ base, variant: 0, previousText: "" });
  const variant = chosen.base === base ? chosen.variant : 0;
  const key = useMemo(
    () =>
      JSON.stringify({
        base,
        variant,
        pairs: BIGRAM_VERSION,
        dictionary: DICTIONARY_VERSION,
        algorithm: ALGORITHM_VERSION,
        config: DEFAULT_CONFIG
      }),
    [base, variant]
  );
  const [generation, setGeneration] = useState<Generation | null>(null);
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
      setGeneration({
        key,
        error: "Не получилось подобрать текст. Переключите режим и попробуйте ещё раз."
      });
    };
    worker.postMessage({
      notes: line.notes,
      language: prefs.language,
      layout: prefs.layout,
      variant
    });
    return () => {
      worker.terminate();
    };
  }, [prefs.enabled, prefs.language, prefs.layout, variant, key, empty, line]);

  const tokens = current?.result?.tokens ?? NO_TOKENS;
  const wordKeys = useMemo(
    () => new Set(tokenPool(prefs.language).map(inputTokenId)),
    [prefs.language]
  );
  const keyboardOptions = useMemo<KeyboardInputOptions>(() => {
    const mapping = current?.result?.tokenToPitch ?? {};
    return {
      bindings: {},
      wordPitch:
        current?.result?.mode === "word"
          ? (id, owed) => wordKeyPitch(tokens, owed, id, wordKeys)
          : (id) => mapping[id],
      blocked: blocked || pending || Boolean(error)
    };
  }, [current, tokens, wordKeys, pending, error, blocked]);
  const text = current?.result?.text;
  const notice =
    variant > 0 && text !== undefined && text === chosen.previousText
      ? "Других слов для этой партии не нашлось."
      : undefined;
  const mode = current?.result?.mode;
  const keyboard = useMemo<ComputerKeyboard | undefined>(
    () =>
      prefs.enabled
        ? {
            tokens,
            language: prefs.language,
            wordPitch:
              mode === "word" ? (id, owed) => wordKeyPitch(tokens, owed, id, wordKeys) : undefined
          }
        : undefined,
    [prefs.enabled, prefs.language, tokens, mode, wordKeys]
  );
  const followInterfaceLanguage = useCallback(
    (language: Language) => {
      dispatch(preferencesActions.wordLanguageFollowed(language));
    },
    [dispatch]
  );
  const update = (change: Partial<Omit<WordTypingPrefs, "languageManuallyChosen">>) => {
    dispatch(preferencesActions.wordChanged(change));
  };
  return {
    ...prefs,
    part,
    line,
    result: current?.result,
    /** The computer keys' inputs while the mode is on; none yet while the words are chosen. */
    keyboard,
    runtimeMs: current?.runtimeMs,
    pending,
    error,
    notice,
    storageError,
    keyboardOptions,
    update,
    followInterfaceLanguage,
    choosePart: (next: Part) => {
      dispatch(practiceActions.wordPartChosen({ songKey, part: next }));
    },
    setAccompaniment: (accompaniment: boolean) => {
      update({ accompaniment });
    },
    /** Another text for the same line; the first one comes back after any other change. */
    regenerate: () => {
      setChosen({ base, variant: variant + 1, previousText: text ?? "" });
    },
    practiceSong: prefs.enabled ? practice : song,
    practiceKey: prefs.enabled
      ? `${songKey}:word-typing:${part}${prefs.accompaniment ? ":accompaniment" : ""}`
      : songKey
  };
}
export type WordTypingControls = ReturnType<typeof useWordTyping>;

/** Apply automatic text changes only when the current take is paused or stopped. */
export function useWordTypingInterfaceLanguage(
  word: Pick<WordTypingControls, "followInterfaceLanguage">,
  playing: boolean
): void {
  const { locale } = useI18n();
  const { followInterfaceLanguage } = word;
  useEffect(() => {
    if (!playing) followInterfaceLanguage(locale);
  }, [locale, playing, followInterfaceLanguage]);
}
