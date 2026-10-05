import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameModeSegment } from "./GameModeSwitch";

describe("the bar's choice of game", () => {
  it("names both games for a screen reader and marks the chosen one", () => {
    const markup = renderToStaticMarkup(
      <GameModeSegment wordTyping locked={false} onChange={() => undefined} />
    );
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-label="Пианино"');
    expect(markup).toMatch(/aria-checked="true"[^>]*aria-label="Печатать мелодию"/);
    expect(markup).not.toContain("disabled");
  });
  it("is unavailable while the song plays", () => {
    const markup = renderToStaticMarkup(
      <GameModeSegment wordTyping={false} locked onChange={() => undefined} />
    );
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
    expect(markup).toContain("Пианино — сменить игру можно на паузе");
  });
});
