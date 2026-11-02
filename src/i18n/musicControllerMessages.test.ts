import { describe, expect, it } from "vitest";
import type { Messages } from "./locales";
import { messages } from "./messages";
import { musicProgressMessages } from "./musicProgressMessages";
import { musicControllerMessages } from "./musicControllerMessages";
import { translate } from "./translate";

const catalogs = import.meta.glob<Record<string, Messages>>(["./*Messages*.ts", "!./*.test.ts"], {
  eager: true
});
const sources = import.meta.glob<string>(
  [
    "../app/musicCourseController*.ts",
    "../app/musicCourseResults.ts",
    "../app/musicCourseExercise.ts",
    "../app/ConnectedMusicCourse.tsx",
    "../ui/MusicCourseProgress.tsx",
    "../ui/MusicCourseNotes.tsx",
    "!../app/*.test.ts"
  ],
  { eager: true, query: "?raw", import: "default" }
);
const cyrillic = /[А-Яа-яЁё]/;

/** Only string literals are inspected; internal English errors and identifiers are ignored. */
function playerMessages(source: string): readonly string[] {
  return [...source.matchAll(/"((?:\\.|[^"\\\r\n])*)"/g)].flatMap((match) => {
    if (!match[1] || !cyrillic.test(match[1])) return [];
    const parsed: unknown = JSON.parse(match[0]);
    return typeof parsed === "string" ? [parsed] : [];
  });
}

describe("compiled music controller localization", () => {
  it("gives every controller phase, error, feedback, choice and metric an English message", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(3);
    const used = new Set(Object.values(sources).flatMap(playerMessages));
    expect(used.size).toBeGreaterThan(30);
    for (const key of used) {
      expect(Object.hasOwn(messages, key), key).toBe(true);
      expect(translate("en", messages, key), key).not.toMatch(cyrillic);
    }
  });
  it("keeps every added Russian key unique across compiled catalogs", () => {
    const occurrences = new Map<string, number>();
    for (const module of Object.values(catalogs))
      for (const catalog of Object.values(module))
        for (const key of Object.keys(catalog))
          occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    for (const [key, value] of [
      ...Object.entries(musicControllerMessages),
      ...Object.entries(musicProgressMessages)
    ]) {
      expect(occurrences.get(key), key).toBe(1);
      expect(translate("en", messages, key), key).toBe(value.en);
      expect(value.en.match(/\{[^}]+\}/g) ?? [], key).toEqual(key.match(/\{[^}]+\}/g) ?? []);
    }
  });
  it("shows a translated interruption and unavailable-audio recovery message", () => {
    expect(translate("en", messages, "Ответ прерван. Начните новую попытку.")).toBe(
      "Your answer was interrupted. Start a new attempt."
    );
    expect(
      translate(
        "en",
        messages,
        "Звук недоступен. Повторите включение или выберите зрительную тренировку."
      )
    ).toBe("Sound is unavailable. Try enabling it again or choose visual practice.");
  });
});
