import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:piano-sample-sizes";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** Sizes describe decoded HTTP response bodies, not compressed wire traffic. */
export function pianoSampleSizes(publicDir: string): Record<string, number> {
  const directory = join(publicDir, "audio/salamander-v1");
  return Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith(".mp3"))
      .sort()
      .map((name) => [name, statSync(join(directory, name)).size])
  );
}

/** The same virtual module supplies actual published sample sizes in dev and production. */
export function pianoSampleManifest(): Plugin {
  let publicDir = "public";
  return {
    name: "piano-sample-manifest",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      return id === RESOLVED_ID
        ? `export default ${JSON.stringify(pianoSampleSizes(publicDir))};`
        : undefined;
    }
  };
}

export default pianoSampleManifest;
