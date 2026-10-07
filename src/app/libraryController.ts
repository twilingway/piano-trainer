import type { Action } from "@reduxjs/toolkit";
import { folderPermission, pickFolder, readFolderSongs, type FolderSong } from "../library/folder";
import {
  listMySongs,
  loadFolderHandle,
  loadMySong,
  removeMySong,
  saveFolderHandle,
  saveMySong
} from "../library/myLibrary";
import { songFromFileData } from "../library/songFile";
import type { Song } from "../song/song";
import { libraryActions, type LibraryState } from "./librarySlice";
import { persistenceErrorChanged } from "./persistenceSlice";
import { LESSONS, type LessonChoice } from "./lessons";

/** Files/handles and asynchronous work stay outside the serializable store. */
export interface LibraryPort {
  getState: () => { song: { revision: number }; library: LibraryState };
  dispatch: (action: Action) => unknown;
  beginSelection: () => void;
  showSong: (song: Song, source: string | null) => void;
  setLibrarySource: (source: string | null) => void;
  openLesson: (choice: LessonChoice) => void;
}
export const browserLibraryRepository = {
  listMySongs,
  loadFolderHandle,
  loadMySong,
  removeMySong,
  saveFolderHandle,
  saveMySong,
  folderPermission,
  pickFolder,
  readFolderSongs,
  songFromFileData
};
export function createLibraryController(port: LibraryPort, repository = browserLibraryRepository) {
  let lifecycle = 0;
  let disposed = false;
  let folderRevision = 0;
  let catalogRevision = 0;
  let folder: { handle: FileSystemDirectoryHandle; songs: FolderSong[] } | null = null;
  const currentFolder = (revision: number) => !disposed && revision === folderRevision;
  const valid = (revision: number) => !disposed && port.getState().song.revision === revision;
  const begin = () => {
    port.beginSelection();
    return port.getState().song.revision;
  };
  const error = (problem: unknown) => {
    if (!disposed)
      port.dispatch(
        libraryActions.errorChanged(problem instanceof Error ? problem.message : String(problem))
      );
  };
  const saved = (operation: string, failed: boolean) => {
    if (!disposed)
      port.dispatch(
        persistenceErrorChanged({
          key: `indexedDB:${operation}`,
          error: failed ? "unavailable" : null
        })
      );
  };
  const parse = (name: string, data: ArrayBuffer) => {
    const song = repository.songFromFileData(name, data);
    if (song.notes.length === 0) throw new Error("В файле нет нот");
    return song;
  };
  const show = (song: Song, source: string | null) => {
    port.dispatch(libraryActions.errorChanged(null));
    port.showSong(song, source);
    return port.getState().song.revision;
  };
  const refreshCatalog = async () => {
    const revision = ++catalogRevision;
    const generation = lifecycle;
    const current = () => !disposed && revision === catalogRevision && generation === lifecycle;
    try {
      const songs = await repository.listMySongs();
      if (current()) port.dispatch(libraryActions.songsLoaded(songs));
    } catch (problem) {
      if (current()) throw problem;
    }
  };
  const refreshFolder = async (
    handle: FileSystemDirectoryHandle,
    ask: boolean,
    revision = folderRevision
  ) => {
    const access = await repository.folderPermission(handle, ask);
    const songs = access === "granted" ? await repository.readFolderSongs(handle) : [];
    if (!currentFolder(revision)) return;
    folder = { handle, songs };
    port.dispatch(
      libraryActions.folderLoaded({
        name: handle.name,
        needsAccess: access === "prompt",
        songs: songs.map(({ path, title }) => ({ path, title }))
      })
    );
  };
  return {
    /** Each effect invocation owns a generation, including StrictMode's setup/cleanup/setup. */
    async restore(source: string | null) {
      disposed = false;
      const generation = ++lifecycle;
      const revision = port.getState().song.revision;
      const directoryRevision = folderRevision;
      const alive = () => !disposed && generation === lifecycle;
      port.dispatch(libraryActions.loadingChanged(true));
      try {
        await refreshCatalog();
        if (!alive()) return;
        const handle = await repository.loadFolderHandle();
        if (!alive()) return;
        if (handle && directoryRevision === folderRevision)
          await refreshFolder(handle, false, directoryRevision);
        if (!alive() || !valid(revision)) return;
        if (source?.startsWith("my:")) {
          const stored = await repository.loadMySong(source.slice(3));
          if (alive() && valid(revision) && stored)
            show(parse(stored.fileName, stored.data), source);
        } else if (source?.startsWith("dir:")) {
          const entry = folder?.songs.find((item) => item.path === source.slice(4));
          if (entry) {
            const file = await entry.handle.getFile();
            const data = await file.arrayBuffer();
            if (alive() && valid(revision)) show(parse(file.name, data), source);
          }
        }
        if (alive()) saved("restore", false);
      } catch {
        if (alive()) {
          saved("restore", true);
          port.dispatch(libraryActions.errorChanged("Не удалось загрузить библиотеку."));
        }
      } finally {
        if (alive()) port.dispatch(libraryActions.loadingChanged(false));
      }
    },
    dispose() {
      disposed = true;
      lifecycle++;
      folderRevision++;
      catalogRevision++;
    },
    async openFile(file: File) {
      const intent = begin();
      try {
        const data = await file.arrayBuffer();
        const song = parse(file.name, data);
        const selection = valid(intent) ? show(song, null) : intent;
        try {
          const metadata = await repository.saveMySong(file.name, song.title, data);
          await refreshCatalog();
          if (valid(selection)) port.setLibrarySource(`my:${metadata.id}`);
          saved("saveSong", false);
        } catch {
          saved("saveSong", true);
        }
      } catch (problem) {
        if (valid(intent)) error(problem);
      }
    },
    async openMySong(id: string) {
      const revision = begin();
      try {
        const stored = await repository.loadMySong(id);
        if (!valid(revision)) return;
        if (!stored) throw new Error("Песни больше нет в библиотеке");
        show(parse(stored.fileName, stored.data), `my:${id}`);
      } catch (problem) {
        if (valid(revision)) error(problem);
      }
    },
    async openFolderSong(path: string) {
      const revision = begin();
      const directoryRevision = folderRevision;
      const selectedFolder = folder;
      const entry = selectedFolder?.songs.find((item) => item.path === path);
      try {
        if (!entry) throw new Error("Песни больше нет в папке");
        const file = await entry.handle.getFile();
        const data = await file.arrayBuffer();
        if (valid(revision)) show(parse(file.name, data), `dir:${path}`);
      } catch (problem) {
        if (!valid(revision) || !currentFolder(directoryRevision)) return;
        error(problem);
        if (selectedFolder) {
          try {
            await refreshFolder(selectedFolder.handle, false, directoryRevision);
          } catch (refreshError) {
            if (valid(revision) && currentFolder(directoryRevision)) error(refreshError);
          }
        }
      }
    },
    async deleteMySong(id: string) {
      const revision = begin();
      try {
        await repository.removeMySong(id);
        await refreshCatalog();
        const first = LESSONS[0];
        if (valid(revision) && first)
          port.openLesson({ exerciseId: first.id, levelId: first.levels[0]?.id ?? "easy" });
        saved("deleteSong", false);
      } catch (problem) {
        saved("deleteSong", true);
        if (valid(revision)) error(problem);
      }
    },
    async chooseFolder() {
      const revision = ++folderRevision;
      try {
        const handle = await repository.pickFolder();
        if (!currentFolder(revision)) return;
        // The selected folder remains usable even when retaining its handle fails.
        await refreshFolder(handle, false, revision);
        if (!currentFolder(revision)) return;
        await repository.saveFolderHandle(handle);
        if (!currentFolder(revision)) return;
        saved("folder", false);
      } catch (problem) {
        if (!currentFolder(revision)) return;
        if (!(problem instanceof DOMException && problem.name === "AbortError")) {
          saved("folder", true);
          error(problem);
        }
      }
    },
    async grantFolder() {
      const revision = folderRevision;
      if (folder) {
        try {
          await refreshFolder(folder.handle, true);
        } catch (problem) {
          if (!disposed && revision === folderRevision) error(problem);
        }
      }
    },
    async forgetFolder() {
      const revision = ++folderRevision;
      folder = null;
      port.dispatch(libraryActions.folderLoaded(null));
      try {
        await repository.saveFolderHandle(undefined);
        if (!disposed && revision === folderRevision) saved("folder", false);
      } catch {
        if (!disposed && revision === folderRevision) saved("folder", true);
      }
    }
  };
}
