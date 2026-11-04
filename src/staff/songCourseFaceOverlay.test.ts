// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { CourseMaterial } from "../songCourse/model";
import { createSongCourseFeedback } from "./songCourseFeedback";
import { SongCourseFaceOverlay } from "./songCourseFaceOverlay";
import { setClayNoteExpression } from "./staffClayFaces";
import { emptyNoteIndex } from "./staffNoteIndex";
const NS = "http://www.w3.org/2000/svg";
const material = {
  source: { sourceHash: "a".repeat(64) },
  expected: [{ sourceNoteId: "song@1:c", startBeat: 0, pitch: 60 }]
} as unknown as CourseMaterial;
function fixture(outside = false) {
  const host = document.createElement("div"),
    head = document.createElementNS(NS, "g"),
    outline = document.createElementNS(NS, "path");
  outline.setAttribute("d", "M0 0L20 0L20 12L0 12Z");
  outline.setAttribute("fill", outside ? "none" : "red");
  head.append(outline);
  host.append(head);
  document.body.append(host);
  head.dataset.clayFacePlacement = outside ? "outside" : "inside";
  Object.assign(head, { getBBox: () => new DOMRect(0, 0, 20, 12) });
  const index = emptyNoteIndex();
  index.heads.set("0:60", [head]);
  const source = createSongCourseFeedback();
  source.reset(material, "presentation", "run");
  const owner = new SongCourseFaceOverlay(host, () => index, source, "presentation");
  source.subscribe(owner.refresh);
  owner.refresh();
  const update = (state: "correct" | "gentle-wrong", ordinal: number, runId = "run") => {
    source.update(
      { runId, presentationId: "presentation", sourceHash: "a".repeat(64) },
      [{ sourceNoteId: "song@1:c", state }],
      ordinal
    );
  };
  return { host, head, outline, source, update, owner };
}
describe("song-course expression decoration", () => {
  it("starts neutral, changes expression without changing the engraved outline, and resets on a new run", () => {
    const h = fixture();
    const engraving = h.outline.outerHTML;
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("data-clay-face")).toBe(
      "neutral"
    );
    h.update("correct", 1);
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("data-clay-face")).toBe(
      "correct"
    );
    const face = h.head.querySelector("[data-clay-face]");
    h.update("correct", 2);
    expect(h.head.querySelector("[data-clay-face]")).toBe(face);
    h.update("gentle-wrong", 3);
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("data-clay-face")).toBe(
      "gentle-wrong"
    );
    expect(h.outline.outerHTML).toBe(engraving);
    h.source.reset(material, "presentation", "next-run");
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("data-clay-face")).toBe(
      "neutral"
    );
    h.update("correct", 4, "run");
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("data-clay-face")).toBe(
      "neutral"
    );
    h.host.remove();
  });
  it("ignores stale presentation/hash/ordinal receipts and keeps a hollow head open", () => {
    const h = fixture(true);
    const engraving = h.outline.outerHTML;
    h.update("gentle-wrong", 4);
    h.update("correct", 3);
    h.source.update(
      { runId: "run", presentationId: "foreign", sourceHash: "a".repeat(64) },
      [{ sourceNoteId: "song@1:c", state: "correct" }],
      5
    );
    h.source.update(
      { runId: "run", presentationId: "presentation", sourceHash: "b".repeat(64) },
      [{ sourceNoteId: "song@1:c", state: "correct" }],
      6
    );
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("data-clay-face")).toBe(
      "gentle-wrong"
    );
    expect(h.outline.outerHTML).toBe(engraving);
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("transform")).toContain("-10.8");
    h.source.clear();
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("data-clay-face")).toBe(
      "neutral"
    );
    h.host.remove();
  });
  it("preserves the legacy happy default without any raster sprite or animation clock", () => {
    const h = fixture();
    setClayNoteExpression(h.head, "smile");
    expect(h.head.querySelectorAll("image")).toHaveLength(0);
    expect(h.head.querySelector("[data-clay-face]")?.getAttribute("data-clay-face")).toBe("smile");
    const changed = vi.fn();
    h.source.subscribe(changed);
    h.update("correct", 1);
    h.update("correct", 2);
    expect(changed).toHaveBeenCalledOnce();
    h.host.remove();
  });
});
