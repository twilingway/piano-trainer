import { decodeBigrams } from "../wordTyping/bigrams";
import { generateWordTyping } from "../wordTyping/optimizer";
import type { DictionaryEntry, Language } from "../wordTyping/types";
import type { SongNote } from "../song/song";

interface Request {
  readonly notes: readonly SongNote[];
  readonly language: Language;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const { notes, language } = event.data;
    const base = `${import.meta.env.BASE_URL}word-typing/${language}`;
    const [response, pairsResponse] = await Promise.all([
      fetch(`${base}.json`),
      fetch(`${base}-bigrams.json`)
    ]);
    if (!response.ok || !pairsResponse.ok) {
      throw new Error("Не удалось загрузить словарь. Подготовьте ресурсы режима.");
    }
    const dictionary = (await response.json()) as {
      version: string;
      entries: DictionaryEntry[];
    };
    const { pairs } = (await pairsResponse.json()) as { pairs: number[] };
    const started = performance.now();
    const result = generateWordTyping(
      notes,
      dictionary.entries,
      language,
      {},
      decodeBigrams(pairs, dictionary.entries.length)
    );
    self.postMessage({
      result,
      runtimeMs: performance.now() - started,
      version: dictionary.version
    });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
