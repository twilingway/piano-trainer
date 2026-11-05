// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SongCourseCharacters, type SongCourseCharactersProps } from "./SongCourseCharacters";

const art = vi.hoisted(() => ({
  ready: vi.fn(() => true),
  decode: vi.fn(() => Promise.resolve(true))
}));
vi.mock("./lessonImageDecode", () => ({
  isLessonImageDecoded: art.ready,
  decodeLessonImage: art.decode
}));
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
  art.ready.mockReset().mockReturnValue(true);
  art.decode.mockReset().mockResolvedValue(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
});
async function render(next: SongCourseCharactersProps = props) {
  await act(async () => {
    await Promise.resolve();
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

it("keeps one decoded image across pressing and release without layout-changing remounts", async () => {
  await render();
  const pressed = host.querySelector("[data-teacher-pose]");
  expect(pressed?.getAttribute("width")).toBe("512");
  await render({ ...props, teacherPose: "idle" });
  expect(host.querySelector("[data-teacher-pose]")).toBe(pressed);
  expect(pressed?.getAttribute("data-teacher-pose")).toBe("idle");
});

it("reports a runtime asset error to its scene owner instead of silently calling it ready", async () => {
  const error = vi.fn();
  await render({ ...props, onArtError: error });
  await act(async () => {
    await Promise.resolve();
    host.querySelector("[data-teacher-pose]")?.dispatchEvent(new Event("error"));
  });
  expect(error).toHaveBeenCalledOnce();
  await act(async () => {
    await Promise.resolve();
    host.querySelector(".song-course-characters__note-source")?.dispatchEvent(new Event("error"));
  });
  expect(error).toHaveBeenCalledTimes(2);
  expect(host.querySelector("[data-note-companion]")).toBeNull();
});

it("retains the last decoded pose until the next one is decoded and rejects obsolete swaps", async () => {
  await render({ ...props, presentationId: "scene-a" });
  const image = host.querySelector("[data-teacher-pose]");
  let resolve: (ready: boolean) => void = () => undefined;
  art.ready.mockReturnValue(false);
  art.decode.mockImplementation(
    () =>
      new Promise<boolean>((done) => {
        resolve = done;
      })
  );
  await render({ ...props, teacherPose: "re", presentationId: "scene-a" });
  expect(image?.getAttribute("data-teacher-pose")).toBe("do");
  await render({ ...props, teacherPose: "mi", presentationId: "scene-b" });
  expect(image?.getAttribute("data-teacher-pose")).toBe("loading");
  await act(async () => {
    await Promise.resolve();
    resolve(true);
  });
  expect(image?.getAttribute("data-teacher-pose")).toBe("mi");
  expect(host.querySelector("[data-teacher-pose]")).toBe(image);
});

it("has no pressing pose or pitch hint when the presentation is hidden", async () => {
  await render({ ...props, visible: false });
  expect(host.querySelector("img")).toBeNull();
  expect(host.querySelector("[data-note-companion]")).toBeNull();
});
