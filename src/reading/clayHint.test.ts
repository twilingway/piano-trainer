import { describe, expect, it } from "vitest";
import { revealedClayNote } from "./clayHint";
describe("named-hint colour permission", () => {
  it("does not reveal unseen, inactive, check or delayed-check answers", () => {
    expect(revealedClayNote(true, "notes", 0, "note-1")).toBeUndefined();
    expect(revealedClayNote(false, "notes", 1, "note-1")).toBeUndefined();
    expect(revealedClayNote(true, "check", 2, "note-1")).toBeUndefined();
    expect(revealedClayNote(true, null, 2, "note-1")).toBeUndefined();
    expect(revealedClayNote(true, "phrases", 1, "note-1")).toBe("note-1");
    expect(revealedClayNote(true, "notes", 2, "note-2")).toBe("note-2");
  });
});
