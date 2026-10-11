import { loadLibrarySetting, updateLibrarySetting } from "../library/myLibrary";

export const READING_DATABASE_KEY = "reading-course-v2";
export interface ReadingRepository {
  load(): Promise<unknown>;
  update(merge: (saved: unknown) => unknown): Promise<void>;
}
export const defaultReadingRepository: ReadingRepository = {
  load: () => loadLibrarySetting(READING_DATABASE_KEY),
  update: (merge) => updateLibrarySetting(READING_DATABASE_KEY, merge)
};

/** Isolated adapter for stores whose other preferences use an injected test storage. */
export function createMemoryReadingRepository(initial?: unknown): ReadingRepository {
  let saved = initial;
  return {
    load: () => Promise.resolve(saved),
    update: (merge) => {
      saved = merge(saved);
      return Promise.resolve();
    }
  };
}
