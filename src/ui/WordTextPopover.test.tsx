// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import type { WordTypingResult } from "../wordTyping/types";
import { WordTextPopover } from "./WordTextPopover";

const metrics = { stars: 4, dictionaryCoveragePercent: 100 } as WordTypingResult["metrics"];

beforeEach(() => {
  setInterfaceLanguage("ru");
});

describe("the word mode's text window", () => {
  it("holds the settings and the text's quality, labelled as such", () => {
    const markup = renderToStaticMarkup(
      <WordTextPopover
        settings={<p>настройки</p>}
        language="ru"
        metrics={metrics}
        notice={undefined}
      />
    );
    expect(markup).toContain("настройки");
    expect(markup).toContain("Качество текста");
    expect(markup).toContain("★★★★☆");
    expect(markup).toContain("100% нот в словах");
    expect(markup).toContain(">RU<");
  });
  it("shows a note about the text", () => {
    const markup = renderToStaticMarkup(
      <WordTextPopover settings={null} language="en" metrics={undefined} notice="Тот же текст" />
    );
    expect(markup).toContain("Тот же текст");
    expect(markup).not.toContain("Качество текста");
  });

  it.each(["ru", "en"] as const)(
    "keeps English interface labels when the selected word language is %s",
    (language) => {
      setInterfaceLanguage("en");
      const markup = renderToStaticMarkup(
        <WordTextPopover settings={null} language={language} metrics={metrics} notice={undefined} />
      );
      expect(markup).toContain('aria-label="Text: language, part, layout and quality"');
      expect(markup).toContain("Text quality");
      expect(markup).toContain("100% of notes in words");
      expect(markup).toContain(`>${language.toUpperCase()}<`);
      expect(markup).not.toMatch(/[А-Яа-яЁё]/);
    }
  );
});
