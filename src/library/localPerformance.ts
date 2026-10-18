import { bindSourcePerformance, readSourcePerformance } from "../song/sourcePerformance";
import type { SourcePerformancePackage } from "../song/sourcePerformance";
import type { Song } from "../song/song";

// Kept outside public/: Vite copies public files into production even when the loader is DEV-only.
const FOUND: Record<string, () => Promise<string>> = import.meta.env.DEV
  ? import.meta.glob<string>("/local-models/local-performance.json", {
      query: "?raw",
      import: "default"
    })
  : {};

async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Optional local data must never prevent a MIDI file from opening. */
export function createLocalPerformanceLoader(
  load: (() => Promise<unknown>) | undefined,
  digest: (data: ArrayBuffer) => Promise<string> = sha256
): (song: Song, data: ArrayBuffer) => Promise<Song> {
  let cached: Promise<SourcePerformancePackage> | undefined;
  return async (song, data) => {
    if (!load || song.source !== "midi") return song;
    try {
      cached ??= load().then(readSourcePerformance);
      const performance = await cached;
      return bindSourcePerformance(song, performance, await digest(data));
    } catch (error) {
      console.warn("Local source performance did not load; using the ordinary song", error);
      return song;
    }
  };
}

const load = FOUND["/local-models/local-performance.json"];
export const loadLocalPerformance = createLocalPerformanceLoader(
  load ? async () => JSON.parse(await load()) as unknown : undefined
);
