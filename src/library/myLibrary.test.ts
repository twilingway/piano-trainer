import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

import { listMySongs, loadMySong, removeMySong, saveMySong } from "./myLibrary";

const data = (...values: number[]) => new Uint8Array(values).buffer;

describe("my library", () => {
  it("rejects a successful put when its transaction is then aborted", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoke the native method with its receiver via call below.
    const original = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey
    ) {
      const result =
        key === undefined ? original.call(this, value) : original.call(this, value, key);
      result.addEventListener("success", () => {
        this.transaction.abort();
      });
      return result;
    });
    try {
      await expect(saveMySong("abort.mid", "abort", data(4))).rejects.toThrow();
    } finally {
      put.mockRestore();
    }
    expect((await listMySongs()).some((song) => song.fileName === "abort.mid")).toBe(false);
  });
  it("keeps a song's file and lists it without the bytes", async () => {
    const saved = await saveMySong("Вальс.mid", "Вальс", data(1, 2, 3));
    const listed = await listMySongs();
    expect(listed).toContainEqual(saved);
    expect(Object.keys(listed[0] ?? {})).not.toContain("data");
    const loaded = await loadMySong(saved.id);
    expect(loaded?.fileName).toBe("Вальс.mid");
    expect([...new Uint8Array(loaded?.data ?? new ArrayBuffer(0))]).toEqual([1, 2, 3]);
  });

  it("replaces the same file opened again instead of adding a second copy", async () => {
    const first = await saveMySong("Этюд.musicxml", "Этюд", data(9, 9));
    const again = await saveMySong("Этюд.musicxml", "Этюд", data(9, 9));
    expect(again.id).toBe(first.id);
    const etudes = (await listMySongs()).filter((song) => song.fileName === "Этюд.musicxml");
    expect(etudes).toHaveLength(1);
    // Same name, other size: another file, kept beside it.
    await saveMySong("Этюд.musicxml", "Этюд", data(9, 9, 9));
    expect((await listMySongs()).filter((song) => song.fileName === "Этюд.musicxml")).toHaveLength(
      2
    );
  });

  it("removes a song for good", async () => {
    const saved = await saveMySong("Удалить.mid", "Удалить", data(5));
    await removeMySong(saved.id);
    expect((await listMySongs()).map((song) => song.id)).not.toContain(saved.id);
    expect(await loadMySong(saved.id)).toBeUndefined();
  });
});
