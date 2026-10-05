import { describe, expect, it } from "vitest";
import { resolveLocale } from "./locales";
import { formatDate, formatNumber, translate } from "./translate";

const catalog = {
  "Папка: {name}": { en: "Folder: {name}" },
  "{count} нот": { en: "{count} notes" }
};

describe("pure interface translation", () => {
  it("uses Russian for missing and unsupported preferences", () => {
    for (const value of [null, undefined, "de", "en-US", "toString", {}, 1]) {
      expect(resolveLocale(value)).toBe("ru");
    }
    expect(resolveLocale("en")).toBe("en");
  });

  it("interpolates named values in either order without interpreting user text", () => {
    expect(translate("en", catalog, "Папка: {name}", { name: "Мои {count} песни" })).toBe(
      "Folder: Мои {count} песни"
    );
    expect(translate("ru", catalog, "{count} нот", { count: 0 })).toBe("0 нот");
    expect(translate("en", catalog, "{count} нот", { count: 4 })).toBe("4 notes");
  });

  it("uses the source message if a translation is absent", () => {
    expect(translate("en", catalog, "Нет перевода {name}", { name: "example" })).toBe(
      "Нет перевода example"
    );
    expect(translate("en", catalog, "Папка: {name}")).toBe("Folder: {name}");
  });

  it("formats numbers and dates for the interface locale", () => {
    expect(formatNumber("en", 1234.5)).toBe("1,234.5");
    expect(formatNumber("ru", 1234.5)).toBe("1 234,5");
    const date = new Date("2026-10-05T12:00:00Z");
    expect(formatDate("en", date, { month: "long", timeZone: "UTC" })).toBe("October");
    expect(formatDate("ru", date, { month: "long", timeZone: "UTC" })).toBe("октябрь");
  });
});
