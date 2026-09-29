import { isSongFile, titleOf } from "./songFile";

/*
 * A folder of songs on the player's disk, through the File System Access API
 * (Chrome and Edge). The browser remembers the grant with the stored handle,
 * but may ask again on a later visit: reading needs "granted", asking again
 * needs a click.
 */

/** The parts of the File System Access API this module uses, which TypeScript's DOM lib lacks. */
interface PermissionedHandle {
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
}

interface IterableDirectory {
  values(): AsyncIterable<FileSystemHandle>;
}

interface DirectoryPicker {
  showDirectoryPicker(options?: { mode?: "read"; id?: string }): Promise<FileSystemDirectoryHandle>;
}

export interface FolderSong {
  /** Path inside the folder, "Sub/Song.musicxml": unique, and what the list shows. */
  readonly path: string;
  readonly title: string;
  readonly handle: FileSystemFileHandle;
}

/** Folders are read this deep: a folder of songs, or a folder of folders of songs. */
const MAX_DEPTH = 2;

export function foldersSupported(): boolean {
  return "showDirectoryPicker" in window;
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return (window as unknown as DirectoryPicker).showDirectoryPicker({
    mode: "read",
    id: "piano-songs"
  });
}

/** "granted", or "prompt" when a click must ask again, or "denied". */
export async function folderPermission(
  handle: FileSystemDirectoryHandle,
  ask: boolean
): Promise<PermissionState> {
  const permissioned = handle as unknown as PermissionedHandle;
  const state = await permissioned.queryPermission({ mode: "read" });
  if (state === "granted" || !ask) return state;
  return permissioned.requestPermission({ mode: "read" });
}

/** Every song file in the folder and its subfolders, sorted by path. */
export async function readFolderSongs(handle: FileSystemDirectoryHandle): Promise<FolderSong[]> {
  const songs: FolderSong[] = [];
  const walk = async (directory: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    for await (const entry of (directory as unknown as IterableDirectory).values()) {
      if (entry.kind === "file" && isSongFile(entry.name)) {
        const path = `${prefix}${entry.name}`;
        songs.push({
          path,
          title: `${prefix}${titleOf(entry.name)}`,
          handle: entry as FileSystemFileHandle
        });
      } else if (entry.kind === "directory" && depth < MAX_DEPTH) {
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`, depth + 1);
      }
    }
  };
  await walk(handle, "", 1);
  return songs.sort((a, b) => a.path.localeCompare(b.path));
}
