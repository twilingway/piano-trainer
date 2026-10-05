import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PracticeTimingStatus } from "./PracticeTimingStatus";

describe("visible applied timing status", () => {
  it("explains the active educational window outside settings", () => {
    const markup = renderToStaticMarkup(<PracticeTimingStatus policy="learning" ranked={false} />);
    expect(markup).toContain("Учебный режим · +300 мс");
    expect(markup).toContain("25 базовых очков");
    expect(markup).toContain('role="status"');
  });
  it("distinguishes waiting, strict and ranked runs", () => {
    expect(
      renderToStaticMarkup(<PracticeTimingStatus policy="waiting" ranked={false} />)
    ).toContain("Ожидание ноты");
    expect(
      renderToStaticMarkup(<PracticeTimingStatus policy="waiting" ranked={false} />)
    ).not.toContain("+300 мс");
    expect(renderToStaticMarkup(<PracticeTimingStatus policy="strict" ranked={false} />)).toContain(
      "Строгий тайминг"
    );
    expect(renderToStaticMarkup(<PracticeTimingStatus policy="strict" ranked />)).toContain(
      "Рейтинг · строгий тайминг"
    );
  });
  it("says waiting has no rating, with a short label for a narrow bar", () => {
    const markup = renderToStaticMarkup(<PracticeTimingStatus policy="waiting" ranked={false} />);
    expect(markup).toContain("Ожидание ноты · без рейтинга");
    expect(markup).toMatch(/practice-timing-status__short[^>]*>Ожидание</);
    expect(markup).toContain('title="Ожидание ноты · без рейтинга. Песня ждёт');
  });
  it("does not label listening, replay or a missing snapshot as educational", () => {
    expect(renderToStaticMarkup(<PracticeTimingStatus policy="listening" ranked={false} />)).toBe(
      ""
    );
    expect(renderToStaticMarkup(<PracticeTimingStatus policy={undefined} ranked={false} />)).toBe(
      ""
    );
  });
});
