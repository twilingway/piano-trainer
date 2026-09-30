import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";

import { folderPermission, pickFolder, readFolderSongs } from "../library/folder";
import type { FolderSong } from "../library/folder";
import {
  listMySongs,
  loadFolderHandle,
  loadMySong,
  removeMySong,
  saveFolderHandle,
  saveMySong
} from "../library/myLibrary";
import type { MySong } from "../library/myLibrary";
import { songFromFileData } from "../library/songFile";
import type { Song } from "../song/song";
import { LESSONS } from "./lessons";
import type { LessonChoice } from "./lessons";

interface Options {
  /** Puts a loaded song on screen; `source` names it as `my:<id>` or `dir:<path>`. */
  readonly showSong: (song: Song, source: string | null) => void;
  /** Renames the library song on screen once it is kept. */
  readonly setLibrarySource: (source: string | null) => void;
  readonly openLesson: (choice: LessonChoice) => void;
}

/** The player's library: songs kept in this browser, and the linked folder. */
export function usePlayerLibrary({ showSong, setLibrarySource, openLesson }: Options) {
  const [mySongs, setMySongs] = useState<MySong[]>([]);
  const [folder, setFolder] = useState<{
    handle: FileSystemDirectoryHandle;
    access: PermissionState;
    songs: FolderSong[];
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Puts a song read from a file on screen: a new song, not a lesson level. */
  const showFileSong = (fileName: string, data: ArrayBuffer, source: string | null) => {
    const loaded = songFromFileData(fileName, data);
    if (loaded.notes.length === 0) throw new Error("В файле нет нот");
    setLoadError(null);
    showSong(loaded, source);
    return loaded;
  };

  const reportError = (error: unknown) => {
    setLoadError(error instanceof Error ? error.message : String(error));
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const loaded = showFileSong(file.name, data, null);
      // Kept only once it read as a song: a broken file never reaches the library.
      const saved = await saveMySong(file.name, loaded.title, data);
      setMySongs(await listMySongs());
      setLibrarySource(`my:${saved.id}`);
    } catch (error) {
      reportError(error);
    }
  };

  const openMySong = async (id: string) => {
    try {
      const stored = await loadMySong(id);
      if (!stored) throw new Error("Песни больше нет в библиотеке");
      showFileSong(stored.fileName, stored.data, `my:${id}`);
    } catch (error) {
      reportError(error);
    }
  };

  const openFolderSong = async (songPath: string) => {
    const entry = folder?.songs.find((item) => item.path === songPath);
    try {
      if (!entry) throw new Error("Песни больше нет в папке");
      const file = await entry.handle.getFile();
      showFileSong(file.name, await file.arrayBuffer(), `dir:${songPath}`);
    } catch (error) {
      reportError(error);
      // The file may be gone from the disk: read the folder again.
      if (folder) void refreshFolder(folder.handle, false);
    }
  };

  const deleteMySong = async (id: string) => {
    try {
      await removeMySong(id);
      setMySongs(await listMySongs());
      const first = LESSONS[0];
      if (first) openLesson({ exerciseId: first.id, levelId: first.levels[0]?.id ?? "easy" });
    } catch (error) {
      reportError(error);
    }
  };

  /** Reads the linked folder if the browser grants it; `ask` prompts, and needs a click. */
  const refreshFolder = async (handle: FileSystemDirectoryHandle, ask: boolean) => {
    try {
      const access = await folderPermission(handle, ask);
      const songs = access === "granted" ? await readFolderSongs(handle) : [];
      setFolder({ handle, access, songs });
    } catch (error) {
      reportError(error);
    }
  };

  const chooseFolder = async () => {
    try {
      const handle = await pickFolder();
      await saveFolderHandle(handle);
      await refreshFolder(handle, false);
    } catch (error) {
      // Closing the picker is not an error.
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportError(error);
    }
  };

  const grantFolder = () => {
    if (folder) void refreshFolder(folder.handle, true);
  };

  const forgetFolder = async () => {
    await saveFolderHandle(undefined);
    setFolder(null);
  };

  // The library as it was left: the kept songs, and the folder if the browser still grants it.
  useEffect(() => {
    let disposed = false;
    // Read through a call: the cleanup changes the flag where narrowing cannot see it.
    const alive = () => !disposed;
    void (async () => {
      try {
        const songs = await listMySongs();
        if (alive()) setMySongs(songs);
        const handle = await loadFolderHandle();
        if (!handle || !alive()) return;
        const access = await folderPermission(handle, false);
        const folderSongs = access === "granted" ? await readFolderSongs(handle) : [];
        if (alive()) setFolder({ handle, access, songs: folderSongs });
      } catch {
        // No IndexedDB (a private window): the library just starts empty.
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  return {
    mySongs,
    // The folder as the library window shows it.
    folder: folder
      ? { name: folder.handle.name, needsAccess: folder.access === "prompt", songs: folder.songs }
      : undefined,
    loadError,
    openFile,
    openMySong,
    openFolderSong,
    deleteMySong,
    chooseFolder,
    grantFolder,
    forgetFolder
  };
}
