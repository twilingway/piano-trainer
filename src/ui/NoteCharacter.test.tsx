// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { NoteCharacterFamily, SelectedNoteCharacter } from "./NoteCharacter";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
describe("note characters", () => {
  it("shows seven labelled characters without adding selectable exercises, and keeps down-stem faces upright", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setInterfaceLanguage("en");
    const host = document.body.appendChild(document.createElement("div")),
      root = createRoot(host);
    try {
      await act(async () => {
        await Promise.resolve();
        root.render(
          <>
            <SelectedNoteCharacter pitch={55} bass />
            <NoteCharacterFamily />
          </>
        );
      });
      expect(host.querySelectorAll("img")).toHaveLength(8);
      expect(host.querySelectorAll("button")).toHaveLength(0);
      expect(host.querySelector("summary")?.textContent).toBe("Meet the seven notes");
      expect(host.querySelector("img")?.getAttribute("style")).toBeNull();
      expect(host.textContent).not.toMatch(/[А-Яа-яЁё]/);
    } finally {
      await act(async () => {
        await Promise.resolve();
        root.unmount();
      });
      host.remove();
      setInterfaceLanguage("ru");
      vi.unstubAllGlobals();
    }
  });
});
