// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLAY_NOTES } from "../song/clayNotes";
import { findSongCourseNode, findSongCourseSource } from "../songCourse/catalog";
import type { StaffProps } from "../staff/staffProps";
import { SongCourseMiniature } from "./SongCourseMiniature";

vi.mock("../staff/Staff", () => ({
  Staff: (props: StaffProps) => (
    <div
      data-note-color={props.noteColor}
      data-played-color={props.playedNoteColor}
      data-palette={props.pitchColors}
    />
  )
}));
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("miniature pitch colour wiring", () => {
  it.each([
    ["notes-c", "C"],
    ["notes-d", "D"],
    ["notes-e-intro", "E"]
  ] as const)(
    "keeps the real %s source colour for both note ink and cursor-highlight ink",
    async (suffix, step) => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const source = findSongCourseSource("hot-cross-buns");
      const node = findSongCourseNode("hot-cross-buns", `hot-cross-buns/${suffix}`);
      if (!source || !node) throw new Error("missing source node");
      const host = document.body.appendChild(document.createElement("div"));
      const root = createRoot(host);
      try {
        await act(async () => {
          root.render(<SongCourseMiniature source={source} node={node} />);
          await Promise.resolve();
        });
        const staff = host.querySelector("[data-note-color]");
        expect(staff?.getAttribute("data-note-color")).toBe(CLAY_NOTES[step].color);
        expect(staff?.getAttribute("data-played-color")).toBe(CLAY_NOTES[step].color);
        expect(staff?.getAttribute("data-palette")).toBe("true");
      } finally {
        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
        host.remove();
      }
    }
  );
});
