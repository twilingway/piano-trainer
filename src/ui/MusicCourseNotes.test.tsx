// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { MusicCourseNotes } from "./MusicCourseNotes";

it("limits displayed beat precision to three digits without changing recorded values", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("en");
  const host = document.createElement("div");
  const root = createRoot(host);
  const note = Object.freeze({
    pitch: 60,
    startBeat: 1 / 3,
    durationBeats: 2 / 3,
    hand: "right" as const
  });
  const expectedNotes = Object.freeze([note]);
  const playedNotes = Object.freeze([note]);
  try {
    await act(async () => {
      await Promise.resolve();
      root.render(<MusicCourseNotes expectedNotes={expectedNotes} playedNotes={playedNotes} />);
    });
    expect(host.querySelector('[data-notes="expected"]')?.textContent).toContain(
      "Note C4: starts at 0.333, held for 0.667 beats"
    );
    expect(host.querySelector('[data-notes="played"]')?.textContent).toContain(
      "Note C4: starts at 0.333, held for 0.667 beats"
    );
    expect(expectedNotes[0]).toBe(note);
    expect(playedNotes[0]).toBe(note);
    expect(note.startBeat).toBe(1 / 3);
    expect(note.durationBeats).toBe(2 / 3);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("ru");
    });
    expect(host.textContent).toContain("начало 0,333, удержание 0,667 доли");
    expect(host.textContent).not.toContain("333333");
  } finally {
    act(() => {
      root.unmount();
    });
    setInterfaceLanguage("ru");
    vi.unstubAllGlobals();
  }
});
