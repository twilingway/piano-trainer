import { describe, expect, it } from "vitest";

import { readFolderSongs } from "./folder";

/** A directory handle in memory: `{ name: children }` for folders, `null` for files. */
interface Tree {
  readonly [name: string]: Tree | null;
}

function handle(name: string, tree: Tree | null): FileSystemHandle {
  if (tree === null) return { kind: "file", name } as unknown as FileSystemHandle;
  return {
    kind: "directory",
    name,
    async *values() {
      // A real directory reads its entries asynchronously; so does this one.
      for (const [child, sub] of Object.entries(tree))
        yield await Promise.resolve(handle(child, sub));
    }
  } as unknown as FileSystemHandle;
}

describe("readFolderSongs", () => {
  it("lists song files by path, one folder deep, and skips everything else", async () => {
    const root = handle("Ноты", {
      "Вальс.mid": null,
      "обложка.png": null,
      Этюды: { "Этюд 1.musicxml": null, "Этюд 2.mxl": null, Черновики: { "Скрыто.mid": null } }
    }) as FileSystemDirectoryHandle;
    const songs = await readFolderSongs(root);
    expect(songs.map((song) => [song.path, song.title])).toEqual([
      ["Вальс.mid", "Вальс"],
      ["Этюды/Этюд 1.musicxml", "Этюды/Этюд 1"],
      ["Этюды/Этюд 2.mxl", "Этюды/Этюд 2"]
    ]);
  });
});
