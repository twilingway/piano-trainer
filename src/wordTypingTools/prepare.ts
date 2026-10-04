import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type * as BigramSource from "./bigramSource";
import type * as DictionarySource from "./dictionarySource";

// A URL keeps Node strip-types imports explicit without changing compiler settings.
const { prepareDictionary } = (await import(
  new URL("./dictionarySource.ts", import.meta.url).href
)) as typeof DictionarySource;

const { prepareBigrams } = (await import(
  new URL("./bigramSource.ts", import.meta.url).href
)) as typeof BigramSource;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The large list; the small resource is its first 3000 words, so 1K, 3K and 10K agree. */
/** Words a dictionary: the generator always chooses from all of them. */
const WORDS = 10000;

async function main(): Promise<void> {
  const directory = resolve(projectRoot, "public/word-typing");
  await mkdir(directory, { recursive: true });
  for (const language of ["en", "ru"] as const) {
    const dictionary = await prepareDictionary(projectRoot, language, WORDS);
    // Without indentation: the browser loads these, and spaces were 40 % of the bytes.
    await writeFile(
      resolve(directory, `${language}.json`),
      `${JSON.stringify(dictionary)}\n`,
      "utf8"
    );
    console.log(
      `${language}.json: ${String(dictionary.entries.length)} слов, ${dictionary.version}`
    );
    // Pairs of the dictionary's words as real sentences use them.
    const bigrams = await prepareBigrams(projectRoot, dictionary);
    await writeFile(
      resolve(directory, `${language}-bigrams.json`),
      `${JSON.stringify(bigrams)}
`,
      "utf8"
    );
    console.log(
      `${language}-bigrams.json: ${String(bigrams.pairs.length / 3)} пар, ${bigrams.version}`
    );
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
