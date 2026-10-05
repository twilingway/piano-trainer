import { describe, expect, it } from "vitest";
import { selectInterfaceLocale } from "./interfaceLocale";

describe("initial interface locale", () => {
  it.each(["ru", "ru-RU", "ru-BY", "RU-ru"])("uses Russian for %s", (language) => {
    expect(selectInterfaceLocale(null, language)).toBe("ru");
  });

  it.each(["en-US", "de", "uk-UA", "russian", "", null, undefined, 1, {}])(
    "uses English for another or unavailable language %s",
    (language) => {
      expect(selectInterfaceLocale(null, language)).toBe("en");
    }
  );

  it("keeps either manual choice above the browser language", () => {
    expect(selectInterfaceLocale("en", "ru-RU")).toBe("en");
    expect(selectInterfaceLocale("ru", "en-US")).toBe("ru");
  });

  it.each(["de", '"en"', "toString", {}, null])("ignores an invalid saved choice %s", (saved) => {
    expect(selectInterfaceLocale(saved, "ru-RU")).toBe("ru");
    expect(selectInterfaceLocale(saved, undefined)).toBe("en");
  });
});
