import { generateWordTyping } from "../wordTyping/optimizer";
import type { DictionaryEntry, Language } from "../wordTyping/types";
import type { SongNote } from "../song/song";

interface Request {
  readonly notes: readonly SongNote[];
  readonly language: Language;
  readonly dictionarySize: number;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const { notes, language, dictionarySize } = event.data;
    const response = await fetch(`${import.meta.env.BASE_URL}word-typing/${language}.json`);
    if (!response.ok) throw new Error("Не удалось загрузить словарь. Подготовьте ресурсы режима.");
    const dictionary = (await response.json()) as {
      version: string;
      entries: DictionaryEntry[];
    };
    if (dictionary.entries.length < dictionarySize) throw new Error("Словарь неполон.");
    const started = performance.now();
    const result = generateWordTyping(notes, dictionary.entries.slice(0, dictionarySize), language);
    self.postMessage({
      result,
      runtimeMs: performance.now() - started,
      version: dictionary.version
    });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
