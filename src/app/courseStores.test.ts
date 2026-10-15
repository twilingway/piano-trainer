import { describe, expect, it } from "vitest";
import { READING_COURSE_STORES } from "./courseStores";
import { normalizeReadingCourses } from "./readingCourseMigration";

describe("reading course stores", () => {
  it("give every course its own slot and a later schema than the one before it", () => {
    const keys = READING_COURSE_STORES.map((course) => course.key);
    const courses = READING_COURSE_STORES.map((course) => course.course);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(courses).size).toBe(courses.length);
    const since = READING_COURSE_STORES.map((course) => course.since);
    expect(since).toEqual(since.toSorted((a, b) => a - b));
    expect(new Set(since).size).toBe(since.length);
  });

  it("resume each stored course from the first schema that stores it, never before", () => {
    for (const course of READING_COURSE_STORES) {
      const slots = Object.fromEntries(
        READING_COURSE_STORES.map((other) => [other.key, other.normalize(undefined).state])
      );
      const state = course.resumable
        ? { ...course.normalize(undefined).state, mode: "see-and-play" }
        : slots[course.key];
      const row = { ...slots, [course.key]: state, activeCourse: course.course };
      const stored = normalizeReadingCourses({ ...row, schemaVersion: course.since }, null);
      expect(stored.activeCourse).toBe(course.course);
      expect(stored.invalid).toBe(false);
      const early = normalizeReadingCourses({ ...row, schemaVersion: course.since - 1 }, null);
      expect(early.activeCourse).toBeNull();
    }
  });
});
