// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameSettings } from "./GameSettings";

let host: HTMLDivElement;
let root: Root;

async function render(outsideKeyboard: number, practiceOnly = false) {
  await act(async () => {
    await Promise.resolve();
    root.render(
      <GameSettings
        practiceOnly={practiceOnly}
        difficulty="normal"
        ranked={false}
        learningWindow
        rankedReady
        performance={false}
        stopOnError={false}
        locked={false}
        from={0}
        to={10}
        duration={10}
        loop={false}
        onChange={vi.fn()}
        onRange={vi.fn()}
        outsideKeyboard={outsideKeyboard}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe("GameSettings and the player's keyboard", () => {
  const warning = "В Ranked ноты вне вашей клавиатуры (4) засчитываются промахами.";

  it("warns that Ranked asks for the notes off the keyboard", async () => {
    await render(4);
    expect(host.textContent).toContain(warning);
  });

  it("says nothing when every note fits or in the word mode", async () => {
    await render(0);
    expect(host.textContent).not.toContain("вне вашей клавиатуры");
    await render(4, true);
    expect(host.textContent).not.toContain(warning);
  });
});
