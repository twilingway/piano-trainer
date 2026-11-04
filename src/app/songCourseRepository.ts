import { loadLibrarySetting, updateLibrarySetting } from "../library/myLibrary";
import {
  futureSongCourseProgress,
  mergeSongCourseProgress,
  readSongCourseProgress
} from "../songCourse/progress";
import type { SongCourseProgress } from "../songCourse/model";

export const SONG_COURSE_DATABASE_KEY = "song-course-v1";
export const songCourseRepository = {
  async load(): Promise<SongCourseProgress> {
    const value = await loadLibrarySetting(SONG_COURSE_DATABASE_KEY);
    if (futureSongCourseProgress(value)) throw new Error("Unsupported song course schema");
    return readSongCourseProgress(value);
  },
  async save(local: SongCourseProgress, selectionChanged = false): Promise<void> {
    await updateLibrarySetting(SONG_COURSE_DATABASE_KEY, (saved) =>
      mergeSongCourseProgress(saved, local, selectionChanged)
    );
  }
};
