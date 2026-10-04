import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type * as DictionarySource from "./dictionarySource";

// A URL keeps Node strip-types imports explicit without changing compiler settings.
const { prepareDictionary } = (await import(
  new URL("./dictionarySource.ts", import.meta.url).href
)) as typeof DictionarySource;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The large list; the small resource is its first 3000 words, so 1K, 3K and 10K agree. */
const LARGE = 10000;
const SMALL = 3000;

async function main(): Promise<void> {
  const directory = resolve(projectRoot, "public/word-typing");
  await mkdir(directory, { recursive: true });
  for (const language of ["en", "ru"] as const) {
    const large = await prepareDictionary(projectRoot, language, LARGE);
    const small = { ...large, entries: large.entries.slice(0, SMALL) };
    // Without indentation: the browser loads these, and spaces were 40 % of the bytes.
    for (const [file, dictionary] of [
      [`${language}.json`, small],
      [`${language}-10k.json`, large]
    ] as const) {
      await writeFile(resolve(directory, file), `${JSON.stringify(dictionary)}\n`, "utf8");
      console.log(`${file}: ${String(dictionary.entries.length)} слов, ${dictionary.version}`);
    }
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
