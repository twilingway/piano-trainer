import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import type { Song } from "../song/song";
import { createLibraryController, browserLibraryRepository } from "./libraryController";
import { libraryReducer } from "./librarySlice";
import { persistenceReducer } from "./persistenceSlice";
import { songActions, songReducer } from "./songSlice";
import { FIRST_LESSON } from "./lessons";

const song: Song = {
  title: "test",
  source: "midi",
  notes: [{ id: "a", pitch: 60, start: 0, duration: 1, startBeat: 0, hand: "right" }],
  beats: [],
  measures: [],
  duration: 1
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (problem: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function harness(repository: Partial<typeof browserLibraryRepository> = {}) {
  const store = configureStore({
    reducer: { library: libraryReducer, persistence: persistenceReducer, song: songReducer }
  });
  const controller = createLibraryController(
    {
      getState: () => store.getState(),
      dispatch: (action) => store.dispatch(action),
      beginSelection: () => {
        store.dispatch(songActions.beginSongSelection());
      },
      showSong: (loaded, source) => {
        store.dispatch(
          songActions.songOpened({ song: loaded, lesson: null, librarySource: source })
        );
      },
      setLibrarySource: (source) => {
        store.dispatch(songActions.librarySourceChanged(source));
      },
      openLesson: () => {
        store.dispatch(
          songActions.songOpened({
            song: { ...song, title: "lesson" },
            lesson: FIRST_LESSON,
            librarySource: null
          })
        );
      }
    },
    {
      ...browserLibraryRepository,
      listMySongs: () => Promise.resolve([]),
      loadFolderHandle: () => Promise.resolve(undefined),
      songFromFileData: () => song,
      ...repository
    }
  );
  const chooseB = () => {
    store.dispatch(
      songActions.songOpened({
        song: { ...song, title: "B" },
        lesson: FIRST_LESSON,
        librarySource: null
      })
    );
  };
  return { store, controller, chooseB };
}
describe("library asynchronous ownership", () => {
  it("does not overwrite an imported catalog with an older startup list", async () => {
    const oldList = deferred<Awaited<ReturnType<typeof browserLibraryRepository.listMySongs>>>();
    const old = { id: "old", fileName: "old.mid", title: "Old", addedAt: "2026-10-07" };
    const added = { id: "new", fileName: "new.mid", title: "New", addedAt: "2026-10-07" };
    const list = vi
      .fn<typeof browserLibraryRepository.listMySongs>()
      .mockImplementationOnce(() => oldList.promise)
      .mockResolvedValue([added, old]);
    const { store, controller } = harness({
      listMySongs: list,
      saveMySong: () => Promise.resolve(added)
    });
    const restore = controller.restore(null);
    await controller.openFile({
      name: "new.mid",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
    } as File);
    expect(store.getState().library.mySongs).toEqual([added, old]);
    oldList.resolve([old]);
    await restore;
    expect(store.getState().library.mySongs).toEqual([added, old]);
  });

  it("does not restore a deleted entry when an older catalog request finishes later", async () => {
    const oldList = deferred<Awaited<ReturnType<typeof browserLibraryRepository.listMySongs>>>();
    const old = { id: "old", fileName: "old.mid", title: "Old", addedAt: "2026-10-07" };
    const list = vi
      .fn<typeof browserLibraryRepository.listMySongs>()
      .mockImplementationOnce(() => oldList.promise)
      .mockResolvedValue([]);
    const { store, controller } = harness({
      listMySongs: list,
      removeMySong: () => Promise.resolve(undefined)
    });
    const restore = controller.restore(null);
    await controller.deleteMySong("old");
    oldList.resolve([old]);
    await restore;
    expect(store.getState().library.mySongs).toEqual([]);
  });

  it("keeps a chosen folder usable when saving its handle fails", async () => {
    const directory = { name: "Chosen" } as FileSystemDirectoryHandle;
    const file = {
      name: "song.mid",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
    } as File;
    const fileHandle = { getFile: () => Promise.resolve(file) } as FileSystemFileHandle;
    const { store, controller } = harness({
      pickFolder: () => Promise.resolve(directory),
      folderPermission: () => Promise.resolve("granted"),
      readFolderSongs: () =>
        Promise.resolve([{ path: "song.mid", title: "Song", handle: fileHandle }]),
      saveFolderHandle: () => Promise.reject(new Error("quota"))
    });
    await controller.chooseFolder();
    expect(store.getState().library.folder).toEqual({
      name: "Chosen",
      needsAccess: false,
      songs: [{ path: "song.mid", title: "Song" }]
    });
    expect(store.getState().persistence.errors["indexedDB:folder"]).toBe("unavailable");
    await controller.openFolderSong("song.mid");
    expect(store.getState().song.librarySource).toBe("dir:song.mid");
    expect(store.getState().song.sourceSong).toEqual(song);
  });

  it("ignores an older folder's write failure after a newer folder succeeds", async () => {
    const firstSave = deferred<undefined>();
    const first = { name: "A" } as FileSystemDirectoryHandle,
      second = { name: "B" } as FileSystemDirectoryHandle;
    const pick = vi
      .fn<typeof browserLibraryRepository.pickFolder>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const save = vi
      .fn<typeof browserLibraryRepository.saveFolderHandle>()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);
    const { store, controller } = harness({
      pickFolder: pick,
      saveFolderHandle: save,
      folderPermission: () => Promise.resolve("granted"),
      readFolderSongs: () => Promise.resolve([])
    });
    const a = controller.chooseFolder();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(save).toHaveBeenCalledOnce();
    await controller.chooseFolder();
    firstSave.reject(new Error("late failure"));
    await a;
    expect(store.getState().library.folder?.name).toBe("B");
    expect(store.getState().library.loadError).toBeNull();
    expect(store.getState().persistence.errors["indexedDB:folder"]).toBeUndefined();
  });

  it("ignores a pending folder refresh after disposal", async () => {
    const access = deferred<PermissionState>();
    const save = vi
      .fn<typeof browserLibraryRepository.saveFolderHandle>()
      .mockResolvedValue(undefined);
    const { store, controller } = harness({
      pickFolder: () => Promise.resolve({ name: "A" } as FileSystemDirectoryHandle),
      folderPermission: () => access.promise,
      readFolderSongs: () => Promise.resolve([]),
      saveFolderHandle: save
    });
    const task = controller.chooseFolder();
    await Promise.resolve();
    controller.dispose();
    access.resolve("granted");
    await task;
    expect(store.getState().library.folder).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("does not replace a newer choice with restored data", async () => {
    const stored = deferred<{ fileName: string; data: ArrayBuffer } | undefined>();
    const { store, controller, chooseB } = harness({ loadMySong: () => stored.promise });
    const task = controller.restore("my:A");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    chooseB();
    stored.resolve({ fileName: "A.mid", data: new ArrayBuffer(0) });
    await task;
    expect(store.getState().song.sourceSong.title).toBe("B");
  });
  it("adds a saved import to the catalog without renaming a newer song", async () => {
    const saved = deferred<{ id: string; fileName: string; title: string; addedAt: string }>();
    const metadata = { id: "A", fileName: "A.mid", title: "test", addedAt: "2026-10-07" };
    const { store, controller, chooseB } = harness({
      saveMySong: () => saved.promise,
      listMySongs: () => Promise.resolve([metadata])
    });
    const file = { name: "A.mid", arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) } as File;
    const task = controller.openFile(file);
    await Promise.resolve();
    await Promise.resolve();
    chooseB();
    saved.resolve(metadata);
    await task;
    expect(store.getState().library.mySongs).toEqual([metadata]);
    expect(store.getState().song.sourceSong.title).toBe("B");
    expect(store.getState().song.librarySource).toBeNull();
  });
  it("keeps imported notes usable when saving fails", async () => {
    const { store, controller } = harness({
      saveMySong: () => Promise.reject(new Error("quota"))
    });
    await controller.openFile({
      name: "A.mid",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
    } as File);
    expect(store.getState().song.sourceSong).toEqual(song);
    expect(store.getState().persistence.errors["indexedDB:saveSong"]).toBe("unavailable");
  });
  it("ignores completion after disposal", async () => {
    const loaded = deferred<{ fileName: string; data: ArrayBuffer } | undefined>();
    const { store, controller } = harness({ loadMySong: () => loaded.promise });
    const task = controller.openMySong("A");
    controller.dispose();
    loaded.resolve({ fileName: "A.mid", data: new ArrayBuffer(0) });
    await task;
    expect(store.getState().song.sourceSong.title).toBe("");
  });
  it("does not save unreadable or empty songs", async () => {
    const save = vi.fn(browserLibraryRepository.saveMySong);
    const { store, controller } = harness({
      saveMySong: save,
      songFromFileData: () => ({ ...song, notes: [] })
    });
    await controller.openFile({
      name: "A.mid",
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0))
    } as File);
    expect(save).not.toHaveBeenCalled();
    expect(store.getState().library.loadError).toBe("В файле нет нот");
  });
});
