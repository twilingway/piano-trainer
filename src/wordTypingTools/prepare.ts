import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type * as DictionarySource from "./dictionarySource";

// A URL keeps Node strip-types imports explicit without changing compiler settings.
const { prepareDictionary } = (await import(
  new URL("./dictionarySource.ts", import.meta.url).href
)) as typeof DictionarySource;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function main(): Promise<void> {
  const directory = resolve(projectRoot, "public/word-typing");
  await mkdir(directory, { recursive: true });
  for (const language of ["en", "ru"] as const) {
    const dictionary = await prepareDictionary(projectRoot, language);
    await writeFile(
      resolve(directory, `${language}.json`),
      `${JSON.stringify(dictionary, null, 2)}\n`,
      "utf8"
    );
    console.log(`${language}: ${String(dictionary.entries.length)} слов, ${dictionary.version}`);
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
