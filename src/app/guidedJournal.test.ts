import { describe, expect, it, vi } from "vitest";
import {
  createGuidedJournal,
  GUIDED_STORAGE_PREFIX as prefix,
  readGuidedJournal,
  saveGuidedCompletion,
  type GuidedStorage
} from "./guidedJournal";
function storage() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    }
  };
}
describe("per-step completion journal", () => {
  it("survives a new reader and the removal of detailed history", () => {
    const s = storage();
    expect(saveGuidedCompletion(s, "right-notes")).toBe(true);
    expect(readGuidedJournal(s)).toEqual({ completed: ["right-notes"], error: false });
    expect(readGuidedJournal({ ...s })).toEqual(readGuidedJournal(s));
  });
  it("merges independent tabs without last-writer loss", () => {
    const s = storage();
    const tabA = { ...s },
      tabB = { ...s };
    saveGuidedCompletion(tabA, "right-intro");
    saveGuidedCompletion(tabB, "left-intro");
    expect(readGuidedJournal(s).completed).toEqual(["right-intro", "left-intro"]);
  });
  it("rejects one corrupt entry without losing another", () => {
    const s = storage();
    saveGuidedCompletion(s, "right-notes");
    s.rows.set(prefix + "left-notes", '{"schemaVersion":1,"completed":"true"}');
    expect(readGuidedJournal(s)).toEqual({ completed: ["right-notes"], error: true });
    expect(saveGuidedCompletion(s, "unknown")).toBe(false);
    expect(s.rows.has(prefix + "unknown")).toBe(false);
  });
  it("protects a future schema even when new completion evidence arrives", () => {
    const s = storage();
    const future = '{"schemaVersion":2,"completed":true,"future":"data"}';
    s.rows.set(prefix + "right-intro", future);
    expect(saveGuidedCompletion(s, "right-intro")).toBe(false);
    expect(s.rows.get(prefix + "right-intro")).toBe(future);
    expect(readGuidedJournal(s).completed).toEqual([]);
  });
  it("does not write again for an already completed step and reports storage denial", () => {
    const s = storage();
    saveGuidedCompletion(s, "rhythm");
    const writer = vi.spyOn(s, "setItem");
    saveGuidedCompletion(s, "rhythm");
    expect(writer).not.toHaveBeenCalled();
    const denied: GuidedStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      }
    };
    expect(readGuidedJournal(denied)).toEqual({ completed: [], error: true });
    expect(saveGuidedCompletion(denied, "rhythm")).toBe(false);
  });
});

describe("instance-owned journal snapshots", () => {
  it("keeps completion after detailed evidence is evicted and emits only real changes", () => {
    const s = storage();
    const j = createGuidedJournal(s);
    const notify = vi.fn();
    j.subscribe(notify);
    const initial = j.getSnapshot();
    expect(j.getSnapshot()).toBe(initial);
    j.record(["right-notes"]);
    expect(notify).toHaveBeenCalledOnce();
    const completed = j.getSnapshot();
    j.record([]);
    expect(j.getSnapshot()).toBe(completed);
    expect(notify).toHaveBeenCalledOnce();
    const reloaded = createGuidedJournal(s);
    expect(reloaded.getSnapshot().completed).toEqual(["right-notes"]);
  });
  it("refreshes another tab's new step and preserves locally observed steps", () => {
    const s = storage();
    const a = createGuidedJournal(s),
      b = createGuidedJournal(s);
    a.record(["right-intro"]);
    b.record(["left-intro"]);
    a.refresh();
    expect(a.getSnapshot().completed).toEqual(["right-intro", "left-intro"]);
  });
});

describe("unsaved completion recovery", () => {
  it("keeps a write failure visible across another tab's update until retry actually persists it", () => {
    const shared = storage();
    let denyWrite = true;
    const tab: GuidedStorage = {
      getItem: shared.getItem,
      setItem: (key, value) => {
        if (denyWrite && key === prefix + "right-intro") throw new Error("QuotaExceeded");
        shared.setItem(key, value);
      }
    };
    const journal = createGuidedJournal(tab);
    journal.record(["right-intro"]);
    expect(journal.getSnapshot()).toEqual({ completed: ["right-intro"], error: true });
    saveGuidedCompletion(shared, "left-intro");
    journal.refresh();
    expect(journal.getSnapshot().completed).toEqual(
      expect.arrayContaining(["right-intro", "left-intro"])
    );
    expect(journal.getSnapshot().error).toBe(true);
    expect(createGuidedJournal(shared).getSnapshot()).toEqual({
      completed: ["left-intro"],
      error: false
    });
    denyWrite = false;
    journal.refresh();
    expect(journal.getSnapshot().error).toBe(false);
    expect(createGuidedJournal(shared).getSnapshot()).toEqual({
      completed: ["right-intro", "left-intro"],
      error: false
    });
  });
});
