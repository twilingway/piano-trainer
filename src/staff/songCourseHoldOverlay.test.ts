// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { SongCourseHoldOverlay } from "./songCourseHoldOverlay";
import { emptyNoteIndex, markKey } from "./staffNoteIndex";
import { worldScoreSnapshot } from "./publishWorldScore";
import type { SongCourseHoldSnapshot } from "../songCourse/holdCue";
afterEach(() => {
  document.body.replaceChildren();
});
function fixture() {
  const room = document.body.appendChild(document.createElement("div"));
  room.className = "song-course-lesson__score";
  const host = room.appendChild(document.createElement("div"));
  host.className = "staff";
  host.innerHTML =
    '<svg viewBox="0 0 900 180"><g class="vf-notehead"><path fill="none" stroke="#ff7b80" d="M100 50L120 50L120 60L100 60Z"/></g></svg>';
  const svg = host.querySelector("svg"),
    head = host.querySelector<SVGElement>(".vf-notehead");
  if (!svg || !head) throw new Error("missing fixture");
  room.getBoundingClientRect = () => new DOMRect(10, 20, 320, 180);
  host.getBoundingClientRect = () => new DOMRect(10, 20, 320, 180);
  svg.getBoundingClientRect = () => new DOMRect(10 - host.scrollLeft, 20, 900, 180);
  head.getBoundingClientRect = () => new DOMRect(170 - host.scrollLeft, 100, 20, 12);
  const index = emptyNoteIndex();
  index.heads.set(markKey(0, 60), [head]);
  let value: SongCourseHoldSnapshot | null = {
    presentationId: "p",
    runId: "r",
    sourceHash: "hash",
    sourceNoteId: "source@1:c",
    staffBeat: 0,
    pitch: 60,
    progress: 0.5,
    action: "hold",
    paused: false,
    color: "#ff7b80"
  };
  const owner = new SongCourseHoldOverlay(
    host,
    () => index,
    () => value,
    "p",
    { hold: "Hold", release: "Release", track: "Note hold progress" }
  );
  return {
    room,
    host,
    head,
    owner,
    set: (next: SongCourseHoldSnapshot | null) => {
      value = next;
    },
    read: () => value
  };
}
describe("source-bound hold overlay", () => {
  it("updates one sibling capsule while preserving note geometry, hollow heads and score export", () => {
    const h = fixture();
    const engraving = h.head.outerHTML;
    h.owner.frame();
    const cue = h.room.querySelector<HTMLElement>(".song-course-hold");
    expect(cue).not.toBeNull();
    expect(h.host.querySelector(".song-course-hold")).toBeNull();
    expect(cue?.getAttribute("aria-valuenow")).toBe("50");
    expect(parseFloat(cue?.style.left ?? "0")).toBeGreaterThan(
      h.head.getBoundingClientRect().right
    );
    expect(parseFloat(cue?.style.width ?? "0")).toBeLessThanOrEqual(104);
    expect(cue?.textContent).toContain("Hold");
    expect(cue?.style.getPropertyValue("--hold-color")).toBe("#ff7b80");
    const snapshot = h.read();
    if (!snapshot) throw new Error("missing snapshot");
    h.set({ ...snapshot, progress: 1, action: "release" });
    h.owner.frame();
    expect(h.room.querySelector(".song-course-hold")).toBe(cue);
    expect(cue?.getAttribute("aria-valuenow")).toBe("100");
    expect(cue?.textContent).toContain("Release");
    expect(h.head.outerHTML).toBe(engraving);
    const exported = worldScoreSnapshot(h.host, [], [])?.svg;
    expect(exported).toContain("<svg");
    expect(exported).not.toContain("song-course-hold");
    expect(exported).not.toContain("Release");
    h.set(null);
    h.owner.frame();
    expect(h.room.querySelector(".song-course-hold")).toBeNull();
  });
  it("keeps real hold/release progress visible when the last head scrolls behind the pinned clef", () => {
    const h = fixture();
    const header = h.room.appendChild(document.createElement("div"));
    header.className = "song-course-header";
    header.getBoundingClientRect = () => new DOMRect(10, 20, 110, 160);
    h.host.dataset.songCoursePlayhead = "130";
    h.host.scrollLeft = 220;
    h.owner.frame();
    const cue = h.room.querySelector<HTMLElement>(".song-course-hold");
    expect(cue?.dataset.compact).toBe("true");
    expect(cue?.getAttribute("aria-valuenow")).toBe("50");
    expect(parseFloat(cue?.style.left ?? "0")).toBeGreaterThanOrEqual(10);
    const current = h.read();
    if (!current) throw new Error("snapshot");
    h.set({ ...current, progress: 1, action: "release" });
    h.owner.frame();
    expect(h.room.querySelector(".song-course-hold")).toBe(cue);
    expect(cue?.textContent).toContain("Release");
    expect(cue?.getAttribute("aria-valuenow")).toBe("100");
    h.owner.dispose();
    expect(h.room.querySelector(".song-course-hold")).toBeNull();
  });
  it("freezes its paused value and rejects stale presentation and unavailable canonical heads", () => {
    const h = fixture();
    const snapshot = h.read();
    if (!snapshot) throw new Error("missing snapshot");
    h.set({ ...snapshot, paused: true });
    h.owner.frame();
    expect(h.room.querySelector<HTMLElement>(".song-course-hold")?.dataset.state).toBe("paused");
    h.set({ ...snapshot, presentationId: "old" });
    h.owner.frame();
    expect(h.room.querySelector(".song-course-hold")).toBeNull();
    h.set({ ...snapshot, staffBeat: 4 });
    h.owner.frame();
    expect(h.room.querySelector(".song-course-hold")).toBeNull();
    h.set(snapshot);
    h.owner.frame();
    h.owner.dispose();
    h.owner.frame();
    expect(h.room.querySelector(".song-course-hold")).toBeNull();
  });
});
