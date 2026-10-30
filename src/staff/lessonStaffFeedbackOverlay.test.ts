// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLessonStaffFeedback, type LessonStaffFeedbackReceipt } from "./lessonStaffFeedback";
import { LessonStaffFeedbackOverlay } from "./lessonStaffFeedbackOverlay";
import { markKey } from "./staffNoteIndex";

function receipt(
  noteId = "note-a",
  presentationId = "presentation-a",
  runId = "run-a"
): LessonStaffFeedbackReceipt {
  return {
    runId,
    presentationId,
    receiptId: `receipt-${noteId}`,
    notes: [{ noteId, staffBeat: 0, pitch: 60 }]
  };
}
function drawing() {
  const host = document.createElement("div");
  host.getBoundingClientRect = () => new DOMRect(100, 40, 400, 180);
  Object.defineProperty(host, "clientLeft", { value: 2 });
  Object.defineProperty(host, "clientTop", { value: 3 });
  const page = document.createElement("div");
  page.className = "staff-page";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const head = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  head.append(path);
  head.getBoundingClientRect = () => new DOMRect(154, 90, 10, 8);
  path.getBoundingClientRect = () => new DOMRect(154, 90, 10, 8);
  svg.append(head);
  page.append(svg);
  host.append(page);
  document.body.append(host);
  const heads = new Map([[markKey(0, 60), [head, path]]]);
  const owner = new LessonStaffFeedbackOverlay(host, () => ({ heads }));
  const source = createLessonStaffFeedback();
  const unsubscribe = source.subscribe(owner.receive);
  owner.ready("presentation-a");
  const pulses = () => [...host.querySelectorAll<HTMLDivElement>(".staff-feedback__pulse")];
  return { host, page, svg, head, heads, owner, source, unsubscribe, pulses };
}

beforeEach(() => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("accepted lesson staff decoration", () => {
  it("captures the old head synchronously outside measured SVG and survives prompt replacement", () => {
    const f = drawing();
    f.host.scrollLeft = 30;
    f.host.scrollTop = 20;
    f.source.publish(receipt());
    const pulse = f.pulses()[0];
    expect(pulse).toBeDefined();
    expect(pulse?.style.left).toBe("57px");
    expect(pulse?.style.top).toBe("51px");
    expect(pulse?.style.width).toBe("26px");
    expect(pulse?.style.height).toBe("24px");
    expect(pulse?.closest("svg")).toBeNull();
    expect(pulse?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(pulse?.parentElement?.style.left).toBe("102px");
    expect(pulse?.parentElement?.style.top).toBe("43px");
    expect(pulse?.parentElement?.style.width).toBe("400px");
    expect(pulse?.parentElement?.style.height).toBe("180px");
    f.owner.invalidate();
    f.page.replaceChildren();
    f.owner.ready("presentation-b");
    expect(f.pulses()).toEqual([pulse]);
    pulse?.dispatchEvent(new Event("animationend"));
    expect(f.pulses()).toEqual([]);
    f.owner.dispose();
  });

  it("does not advance dedupe for stale receipts and allows new notes/presentations at the same pitch", () => {
    const f = drawing();
    f.source.publish(receipt());
    f.source.publish(receipt("stale", "presentation-old"));
    f.source.publish(receipt());
    f.source.publish(receipt("foreign-run", "presentation-a", "run-old"));
    expect(f.pulses()).toHaveLength(1);
    f.source.publish(receipt("note-b"));
    expect(f.pulses()).toHaveLength(2);
    f.owner.invalidate();
    f.source.publish(receipt("loading", "presentation-b"));
    expect(f.pulses()).toHaveLength(2);
    f.owner.ready("presentation-b");
    f.source.publish(receipt("note-a", "presentation-b", "run-b"));
    expect(f.pulses()).toHaveLength(3);
    f.owner.dispose();
  });

  it("clears a run immediately and rejects its former ready id even before React replaces the prompt", () => {
    const f = drawing();
    f.source.publish(receipt());
    f.source.clear();
    expect(f.pulses()).toHaveLength(0);
    f.owner.ready("presentation-a");
    f.source.publish(receipt("stale-after-reset"));
    expect(f.pulses()).toHaveLength(0);
    f.owner.ready("presentation-b");
    f.source.publish(receipt("fresh", "presentation-b", "run-b"));
    expect(f.pulses()).toHaveLength(1);
    f.owner.dispose();
  });

  it("can become ready after a same-presentation redraw without replaying its already accepted head", () => {
    const f = drawing();
    f.source.publish(receipt());
    f.owner.invalidate();
    f.source.publish(receipt("during-redraw"));
    expect(f.pulses()).toHaveLength(1);
    f.owner.ready("presentation-a");
    f.source.publish(receipt());
    f.source.publish(receipt("after-redraw"));
    expect(f.pulses()).toHaveLength(2);
    f.owner.dispose();
  });
  it("clears rendering errors and permits an explicit retry of the same id", () => {
    const f = drawing();
    f.source.publish(receipt());
    f.owner.fail();
    expect(f.pulses()).toHaveLength(0);
    f.source.publish(receipt("during-error"));
    expect(f.pulses()).toHaveLength(0);
    f.owner.ready("presentation-a");
    f.source.publish(receipt("after-retry"));
    expect(f.pulses()).toHaveLength(1);
    f.owner.dispose();
  });

  it("clears on hiding without replaying a held note when visible again, and disposes idempotently", () => {
    const f = drawing();
    f.source.publish(receipt());
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(f.pulses()).toHaveLength(0);
    f.source.publish(receipt("while-hidden"));
    expect(f.pulses()).toHaveLength(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    f.source.publish(receipt());
    expect(f.pulses()).toHaveLength(0);
    f.source.publish(receipt("fresh-visible"));
    expect(f.pulses()).toHaveLength(1);
    f.unsubscribe();
    f.owner.dispose();
    f.owner.dispose();
    f.source.publish(receipt("after-dispose"));
    f.owner.receive({ type: "accepted", receipt: receipt("direct-after-dispose") });
    expect(f.host.querySelector(".staff-feedback")).toBeNull();
  });

  it("draws every uniquely anchored accepted chord head, normalizing nested path shapes", () => {
    const f = drawing();
    const second = document.createElementNS("http://www.w3.org/2000/svg", "g");
    second.getBoundingClientRect = () => new DOMRect(154, 75, 10, 8);
    f.svg.append(second);
    f.heads.set(markKey(0, 64), [second]);
    f.source.publish({
      ...receipt(),
      notes: [
        { noteId: "c", staffBeat: 0, pitch: 60 },
        { noteId: "e", staffBeat: 0, pitch: 64 }
      ]
    });
    expect(f.pulses().map((pulse) => pulse.dataset.noteId)).toEqual(["c", "e"]);
    expect(f.pulses().map((pulse) => pulse.style.top)).toEqual(["51px", "36px"]);
    f.owner.dispose();
  });

  it("skips a same-beat unison in separate voices/staves rather than guessing its authored id", () => {
    const f = drawing();
    const second = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const secondPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    second.append(secondPath);
    second.getBoundingClientRect = () => new DOMRect(154, 130, 10, 8);
    f.svg.append(second);
    f.heads.set(markKey(0, 60), [...(f.heads.get(markKey(0, 60)) ?? []), second, secondPath]);
    f.source.publish(receipt("authored-upper-unison"));
    expect(f.pulses()).toHaveLength(0);
    f.owner.dispose();
  });

  it("tracks ancestor scrolling and viewport/score resize without moving or modifying the drawn score", () => {
    const f = drawing();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    f.source.publish(receipt());
    const layer = f.host.querySelector<HTMLDivElement>(".staff-feedback");
    expect(document.activeElement).toBe(input);
    expect(f.head.style.cssText).toBe("");
    f.host.getBoundingClientRect = () => new DOMRect(80, 25, 300, 140);
    document.body.dispatchEvent(new Event("scroll"));
    expect(layer?.style.left).toBe("82px");
    expect(layer?.style.top).toBe("28px");
    expect(layer?.style.width).toBe("300px");
    f.host.getBoundingClientRect = () => new DOMRect(70, 20, 250, 120);
    window.dispatchEvent(new Event("resize"));
    expect(layer?.style.left).toBe("72px");
    expect(layer?.style.height).toBe("120px");
    // The existing score relayout calls refresh after fitting the host's new height.
    f.host.getBoundingClientRect = () => new DOMRect(70, 20, 250, 90);
    f.owner.refresh();
    expect(layer?.style.height).toBe("90px");
    expect(f.svg.children).toHaveLength(1);
    f.owner.dispose();
  });
  it("skips detached, missing, zero-size and offscreen heads without changing the score", () => {
    const f = drawing();
    f.head.remove();
    f.source.publish(receipt("detached"));
    f.svg.append(f.head);
    f.head.getBoundingClientRect = () => new DOMRect(154, 90, 0, 0);
    f.source.publish(receipt("zero"));
    f.head.getBoundingClientRect = () => new DOMRect(600, 90, 10, 8);
    f.source.publish(receipt("outside"));
    f.heads.clear();
    f.source.publish(receipt("missing"));
    expect(f.pulses()).toHaveLength(0);
    expect(f.svg.children).toHaveLength(1);
    f.owner.dispose();
  });
});
