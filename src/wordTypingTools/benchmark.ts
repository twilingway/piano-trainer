import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Window } from "happy-dom";
import { createServer } from "vite";

import type * as ExercisesModule from "../song/exercises";
import type * as MidiModule from "../song/midi";
import type * as MusicXmlModule from "../song/musicxml";
import type { Song } from "../song/song";
import type * as ExtractLineModule from "../wordTyping/extractLine";
import type * as OptimizerModule from "../wordTyping/optimizer";
import type * as DictionaryModule from "../wordTyping/dictionary";
import type { DictionarySize, WordTypingResult } from "../wordTyping/types";
import type { DictionaryResource } from "./dictionarySource";

interface Arguments {
  readonly input: string;
  readonly beamWidth: number;
  readonly output: string;
}

interface BenchmarkRow {
  readonly language: "en" | "ru";
  readonly dictionarySize: DictionarySize;
  readonly dictionaryVersion: string;
  readonly part: "melody" | "bass";
  readonly discardedNotes: number;
  readonly runtimeMs: number;
  readonly result: WordTypingResult;
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function parseArguments(args: readonly string[]): Arguments {
  let input = "";
  let beamWidth = 64;
  let output = resolve(projectRoot, ".browser-artifacts/word-typing/benchmark");
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--beam" || argument === "--output") {
      const value = args[++index];
      if (!value) throw new Error(`Не задано значение ${argument}`);
      if (argument === "--beam") beamWidth = Number(value);
      else output = resolve(value).replace(/\.(md|json)$/i, "");
    } else if (argument && (argument === "--builtin-anthem" || !argument.startsWith("--"))) {
      if (input) throw new Error("Укажите один музыкальный файл или --builtin-anthem");
      input = argument;
    } else {
      throw new Error(`Неизвестный аргумент ${argument ?? ""}`);
    }
  }
  if (!input) {
    throw new Error(
      "Запуск: node --experimental-strip-types src/wordTypingTools/benchmark.ts <файл | --builtin-anthem> [--beam 64] [--output путь]"
    );
  }
  if (!Number.isSafeInteger(beamWidth) || beamWidth < 1 || beamWidth > 512) {
    throw new Error("--beam должен быть целым числом от 1 до 512");
  }
  return { input, beamWidth, output };
}

function validateDictionary(
  value: unknown,
  language: "en" | "ru",
  size: DictionarySize
): DictionaryResource {
  if (
    typeof value !== "object" ||
    value === null ||
    !("language" in value) ||
    value.language !== language ||
    !("version" in value) ||
    typeof value.version !== "string" ||
    !("license" in value) ||
    value.license !== "CC BY-SA 4.0" ||
    !("source" in value) ||
    typeof value.source !== "string" ||
    !("entries" in value) ||
    !Array.isArray(value.entries) ||
    value.entries.length < size
  ) {
    throw new Error(
      `Неверный ресурс ${language}; сначала запустите src/wordTypingTools/prepare.ts`
    );
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.entries.length; index++) {
    const entry: unknown = value.entries[index];
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("word" in entry) ||
      typeof entry.word !== "string" ||
      !("rank" in entry) ||
      entry.rank !== index + 1 ||
      !("frequency" in entry) ||
      typeof entry.frequency !== "number" ||
      !Number.isSafeInteger(entry.frequency) ||
      entry.frequency <= 0 ||
      seen.has(entry.word) ||
      !(language === "en" ? /^[a-z]+$/ : /^[а-яё]+$/).test(entry.word)
    ) {
      throw new Error(`Некорректная запись ${String(index + 1)} в словаре ${language}`);
    }
    seen.add(entry.word);
  }
  return value as DictionaryResource;
}

function percent(count: number, total: number): string {
  return `${(total === 0 ? 0 : (100 * count) / total).toFixed(1)}%`;
}

function renderReport(
  title: string,
  beamWidth: number,
  algorithmVersion: string,
  rows: readonly BenchmarkRow[]
): string {
  const table = [
    "| Язык | Словарь | Партия | Ноты | Высоты | Слова % | Буквы % | Верхний ряд % | Shift % | Alt % | Ср. длина | Макс. длина | Ср. ранг | Читаемость | Удобство | Качество | Звёзды | мс |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  const details: string[] = [];
  for (const row of rows) {
    const metrics = row.result.metrics;
    const longestWord = row.result.tokens.reduce(
      (longest, token) => (token.word && token.word.length > longest.length ? token.word : longest),
      ""
    );
    table.push(
      `| ${row.language.toUpperCase()} | ${String(row.dictionarySize)} | ${row.part} | ${String(metrics.totalNotes)} | ${String(metrics.uniquePitches)} | ${metrics.dictionaryCoveragePercent.toFixed(1)}% | ${percent(metrics.normalLetterCount, metrics.totalNotes)} | ${percent(metrics.topRowCount, metrics.totalNotes)} | ${percent(metrics.shiftCount, metrics.totalNotes)} | ${percent(metrics.altCount, metrics.totalNotes)} | ${metrics.averageWordLength.toFixed(2)} | ${String(metrics.longestWordLength)} | ${metrics.averageWordRank.toFixed(1)} | ${metrics.readabilityScore.toFixed(1)} | ${metrics.typingComfortScore.toFixed(1)} | ${metrics.totalScore.toFixed(1)} | ${String(metrics.stars)} | ${row.runtimeMs.toFixed(1)} |`
    );
    details.push(
      `## ${row.language.toUpperCase()} ${String(row.dictionarySize)} ${row.part}`,
      "",
      `Словарь: ${row.dictionaryVersion}. Исключено одновременных нот: ${String(row.discardedNotes)}.`,
      "",
      `Самое длинное слово: ${longestWord || "нет"}.`,
      "",
      "```text",
      row.result.text,
      "```",
      "",
      "Назначения InputToken → Pitch и Pitch → InputToken:",
      "",
      "```json",
      JSON.stringify(
        { tokenToPitch: row.result.tokenToPitch, pitchToTokens: row.result.pitchToTokens },
        null,
        2
      ),
      "```",
      "",
      "Все метрики:",
      "",
      "```json",
      JSON.stringify(metrics, null, 2),
      "```",
      ""
    );
  }
  return [
    "# Benchmark «Печатать мелодию»",
    "",
    `Песня: ${title}. Алгоритм: ${algorithmVersion}. Beam width: ${String(beamWidth)}.`,
    "",
    "Время измерено вокруг генератора; чтение ресурсов и парсинг музыки не включены. Размеры 1K/3K — срезы одного подготовленного словаря.",
    "",
    ...table,
    "",
    ...details
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const window = new Window();
  Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: window.DOMParser });
  Object.defineProperty(globalThis, "XMLSerializer", {
    configurable: true,
    value: window.XMLSerializer
  });
  const server = await createServer({
    root: projectRoot,
    cacheDir: resolve(projectRoot, ".browser-artifacts/word-typing/vite-cache/node_modules/.vite"),
    configFile: false,
    logLevel: "error",
    ssr: {
      noExternal: ["@tonejs/midi"],
      optimizeDeps: { include: ["@tonejs/midi"] }
    },
    server: { middlewareMode: true, watch: null }
  });
  try {
    const xmlModule = (await server.ssrLoadModule(
      "/src/song/musicxml.ts"
    )) as typeof MusicXmlModule;
    const core = (await server.ssrLoadModule(
      "/src/wordTyping/optimizer.ts"
    )) as typeof OptimizerModule;
    const extraction = (await server.ssrLoadModule(
      "/src/wordTyping/extractLine.ts"
    )) as typeof ExtractLineModule;
    let song: Song;
    if (args.input === "--builtin-anthem") {
      const exercises = (await server.ssrLoadModule(
        "/src/song/exercises.ts"
      )) as typeof ExercisesModule;
      const anthem = exercises.EXERCISES.find((exercise) => exercise.id === "anthem-ru");
      const level = anthem?.levels.find((item) => item.id === "easy");
      if (!level) throw new Error("Встроенный гимн не найден");
      song = xmlModule.songFromMusicXml(level.musicXml, anthem?.title ?? "Гимн России");
    } else {
      const extension = extname(args.input).toLowerCase();
      if (![".musicxml", ".xml", ".mxl", ".mid", ".midi"].includes(extension)) {
        throw new Error(`Неподдерживаемый формат ${extension}`);
      }
      const bytes = await readFile(resolve(args.input));
      const data = new Uint8Array(bytes).buffer;
      if (extension === ".mid" || extension === ".midi") {
        const midiModule = (await server.ssrLoadModule("/src/song/midi.ts")) as typeof MidiModule;
        song = midiModule.songFromMidi(data, args.input);
      } else {
        const xml = extension === ".mxl" ? xmlModule.musicXmlFromMxl(data) : bytes.toString("utf8");
        const document = new window.DOMParser().parseFromString(xml, "application/xml");
        if (
          document.querySelector("parsererror") ||
          document.documentElement.tagName !== "score-partwise"
        ) {
          throw new Error("Файл не является корректной партитурой MusicXML score-partwise");
        }
        song = xmlModule.songFromMusicXml(xml, args.input);
      }
    }
    if (song.notes.length === 0) throw new Error("В музыкальном файле не найдено нот");
    const rows: BenchmarkRow[] = [];
    const files = (await server.ssrLoadModule(
      "/src/wordTyping/dictionary.ts"
    )) as typeof DictionaryModule;
    for (const language of ["en", "ru"] as const) {
      for (const dictionarySize of [1000, 3000, 10000] as const) {
        const file = files.dictionaryFile(language, dictionarySize);
        const dictionary = validateDictionary(
          JSON.parse(
            await readFile(resolve(projectRoot, `public/word-typing/${file}`), "utf8")
          ) as unknown,
          language,
          dictionarySize
        );
        for (const part of ["melody", "bass"] as const) {
          const line = extraction.extractLine(song, part);
          const started = performance.now();
          const result = core.generateWordTyping(
            line.notes,
            dictionary.entries.slice(0, dictionarySize),
            language,
            { beamWidth: args.beamWidth }
          );
          rows.push({
            language,
            dictionarySize,
            dictionaryVersion: dictionary.version,
            part,
            discardedNotes: line.discardedNotes,
            runtimeMs: performance.now() - started,
            result
          });
        }
      }
    }
    const report = renderReport(song.title, args.beamWidth, core.ALGORITHM_VERSION, rows);
    await mkdir(dirname(args.output), { recursive: true });
    await writeFile(`${args.output}.md`, `${report}\n`, "utf8");
    await writeFile(
      `${args.output}.json`,
      `${JSON.stringify(
        {
          song: song.title,
          algorithmVersion: core.ALGORITHM_VERSION,
          config: { ...core.DEFAULT_CONFIG, beamWidth: args.beamWidth },
          beamWidth: args.beamWidth,
          rows
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.log(report);
    console.log(`Отчёты: ${args.output}.md и ${args.output}.json`);
  } finally {
    await server.close();
    await window.happyDOM.close();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
