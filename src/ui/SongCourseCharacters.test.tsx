// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SongCourseCharacters, type SongCourseCharactersProps } from "./SongCourseCharacters";

let host: HTMLDivElement;
let root: Root;
const props: SongCourseCharactersProps = {
  companion: "do",
  expression: "correct",
  reactionKey: "p/run/c/correct",
  teacherPose: "do",
  teacherVisible: true,
  visible: true
};
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
});
async function render(next: SongCourseCharactersProps = props) {
  await act(async () => {
    await Promise.resolve();
    root.render(<SongCourseCharacters {...next} />);
  });
}

it("does not restart a reaction when an identical snapshot renders again", async () => {
  await render();
  const reaction = host.querySelector("[data-note-companion]");
  await render({ ...props });
  expect(host.querySelector("[data-note-companion]")).toBe(reaction);
  await render({ ...props, expression: "neutral", reactionKey: "p/run/next-c/neutral" });
  expect(host.querySelector("[data-note-companion]")).not.toBe(reaction);
});

it("removes an old pressing image immediately on release rather than leaving it while idle loads", async () => {
  await render();
  const pressed = host.querySelector("[data-teacher-pose]");
  expect(pressed?.getAttribute("width")).toBe("512");
  await render({ ...props, teacherPose: "idle" });
  expect(pressed?.isConnected).toBe(false);
  expect(host.querySelector("[data-teacher-pose]")?.getAttribute("data-teacher-pose")).toBe("idle");
});

it("isolates failed decorative assets and leaves the other companion available", async () => {
  await render();
  await act(async () => {
    await Promise.resolve();
    host.querySelector("[data-teacher-pose]")?.dispatchEvent(new Event("error"));
  });
  expect(host.querySelector("[data-teacher-pose]")).toBeNull();
  expect(host.querySelector("[data-note-companion]")).not.toBeNull();
  await act(async () => {
    await Promise.resolve();
    host.querySelector(".song-course-characters__note-source")?.dispatchEvent(new Event("error"));
  });
  expect(host.querySelector("[data-note-companion]")).toBeNull();
});

it("has no pressing pose or pitch hint when the presentation is hidden", async () => {
  await render({ ...props, visible: false });
  expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector("[data-note-companion]")).toBeNull();
});
