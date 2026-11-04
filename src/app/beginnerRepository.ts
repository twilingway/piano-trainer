import { loadLibrarySetting, updateLibrarySetting } from "../library/myLibrary";
import {
  futureBeginnerProgress,
  mergeBeginnerProgress,
  readBeginnerProgress,
  type BeginnerProgress
} from "../beginner/progress";
export const BEGINNER_DATABASE_KEY = "beginner-course-v1";
export const beginnerRepository = {
  async load(): Promise<BeginnerProgress> {
    const value = await loadLibrarySetting(BEGINNER_DATABASE_KEY);
    if (futureBeginnerProgress(value)) throw new Error("Unsupported beginner schema");
    return readBeginnerProgress(value);
  },
  async save(local: BeginnerProgress, selectionChanged: boolean): Promise<void> {
    await updateLibrarySetting(BEGINNER_DATABASE_KEY, (saved) =>
      mergeBeginnerProgress(saved, local, selectionChanged)
    );
  }
};
