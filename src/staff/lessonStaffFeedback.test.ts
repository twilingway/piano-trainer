import { describe, expect, it, vi } from "vitest";
import { createLessonStaffFeedback, type LessonStaffFeedbackReceipt } from "./lessonStaffFeedback";

const receipt: LessonStaffFeedbackReceipt = {
  runId: "run-1",
  presentationId: "presentation-1",
  receiptId: "answer-1",
  notes: [
    { noteId: "left", staffBeat: 0, pitch: 48 },
    { noteId: "right", staffBeat: 0, pitch: 60 }
  ]
};

describe("lesson staff feedback transport", () => {
  it("captures accepted heads synchronously before the caller replaces its prompt", () => {
    const feedback = createLessonStaffFeedback();
    let prompt = "old prompt";
    const captured: string[] = [];
    feedback.subscribe((event) => {
      if (event.type === "accepted") captured.push(prompt);
    });
    feedback.publish(receipt);
    prompt = "next prompt";
    expect(captured).toEqual(["old prompt"]);
  });

  it("does not replay a previous receipt or clear to a new subscriber", () => {
    const feedback = createLessonStaffFeedback();
    feedback.publish(receipt);
    feedback.clear();
    const listener = vi.fn();
    feedback.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    feedback.publish(receipt);
    expect(listener).toHaveBeenCalledExactlyOnceWith({ type: "accepted", receipt });
  });

  it("delivers all authored chord notes and explicit clears without owning result history", () => {
    const feedback = createLessonStaffFeedback();
    const listener = vi.fn();
    const unsubscribe = feedback.subscribe(listener);
    feedback.publish(receipt);
    feedback.clear();
    expect(listener.mock.calls).toEqual([[{ type: "accepted", receipt }], [{ type: "clear" }]]);
    unsubscribe();
    feedback.publish({ ...receipt, runId: "next-run" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("isolates listener failures from grading and the other listener", () => {
    const feedback = createLessonStaffFeedback();
    feedback.subscribe(() => {
      throw new Error("decorative failure");
    });
    const listener = vi.fn();
    feedback.subscribe(listener);
    expect(() => {
      feedback.publish(receipt);
    }).not.toThrow();
    expect(() => {
      feedback.clear();
    }).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
