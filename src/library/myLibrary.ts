/*
 * The player's own songs and chosen folder, kept in this browser's IndexedDB.
 * A song is stored as the file it came from, bytes and name, so it reads back
 * exactly as it was opened; a folder is stored as the directory handle the
 * browser granted, so it can be read again on the next visit.
 */

const DB_NAME = "piano-trainer";
const DB_VERSION = 1;
const SONGS = "songs";
const SETTINGS = "settings";
const FOLDER_KEY = "folder";

export interface MySong {
  readonly id: string;
  readonly fileName: string;
  readonly title: string;
  /** ISO date and time it was first added. */
  readonly addedAt: string;
}

interface StoredSong extends MySong {
  readonly data: ArrayBuffer;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("IndexedDB request failed"));
    };
  });
}

let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(SONGS)) db.createObjectStore(SONGS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => {
        db.close();
        opening = undefined;
      };
      resolve(db);
    };
    open.onerror = () => {
      opening = undefined;
      reject(open.error ?? new Error("IndexedDB is unavailable"));
    };
  });
  return opening;
}

async function store(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await database()).transaction(name, mode).objectStore(name);
}

/** Request success can still be rolled back; wait for the complete transaction. */
async function write<T>(
  name: string,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const transaction = (await database()).transaction(name, "readwrite");
  const committed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
  });
  const [result] = await Promise.all([
    request(operation(transaction.objectStore(name))),
    committed
  ]);
  return result;
}

/** The songs, newest first, without their bytes. */
export async function listMySongs(): Promise<MySong[]> {
  const all = await request((await store(SONGS, "readonly")).getAll() as IDBRequest<StoredSong[]>);
  return all
    .map(({ id, fileName, title, addedAt }) => ({ id, fileName, title, addedAt }))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

/**
 * Keeps a song's file. The same file opened again (same name and size)
 * replaces its earlier copy instead of adding a second one.
 */
export async function saveMySong(
  fileName: string,
  title: string,
  data: ArrayBuffer
): Promise<MySong> {
  const songs = await store(SONGS, "readonly");
  const all = await request(songs.getAll() as IDBRequest<StoredSong[]>);
  const same = all.find(
    (song) => song.fileName === fileName && song.data.byteLength === data.byteLength
  );
  const song: StoredSong = {
    id: same?.id ?? `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`,
    fileName,
    title,
    addedAt: same?.addedAt ?? new Date().toISOString(),
    data
  };
  await write(SONGS, (songs) => songs.put(song));
  const { data: _data, ...meta } = song;
  return meta;
}

export async function loadMySong(
  id: string
): Promise<{ fileName: string; data: ArrayBuffer } | undefined> {
  const song = await request(
    (await store(SONGS, "readonly")).get(id) as IDBRequest<StoredSong | undefined>
  );
  return song ? { fileName: song.fileName, data: song.data } : undefined;
}

export async function removeMySong(id: string): Promise<void> {
  await write(SONGS, (songs) => songs.delete(id));
}

/** The folder the player chose, as the browser granted it; undefined if none. */
export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const handle = await request(
    (await store(SETTINGS, "readonly")).get(FOLDER_KEY) as IDBRequest<
      FileSystemDirectoryHandle | undefined
    >
  );
  return handle;
}

export async function saveFolderHandle(
  handle: FileSystemDirectoryHandle | undefined
): Promise<void> {
  if (handle) await write(SETTINGS, (settings) => settings.put(handle, FOLDER_KEY));
  else await write(SETTINGS, (settings) => settings.delete(FOLDER_KEY));
}

/** A namespaced setting from the existing library database. */
export async function loadLibrarySetting(key: string): Promise<unknown> {
  const transaction = (await database()).transaction(SETTINGS, "readonly");
  const committed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
  });
  const [value] = await Promise.all([
    request(transaction.objectStore(SETTINGS).get(key) as IDBRequest<unknown>),
    committed
  ]);
  return value;
}

/** Read, merge and commit atomically, including across tabs. */
export async function updateLibrarySetting(
  key: string,
  merge: (saved: unknown) => unknown
): Promise<void> {
  const transaction = (await database()).transaction(SETTINGS, "readwrite");
  return new Promise((resolve, reject) => {
    let failure: unknown;
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = () => {
      reject(
        failure instanceof Error
          ? failure
          : (transaction.error ?? new Error("IndexedDB transaction aborted"))
      );
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    };
    const settings = transaction.objectStore(SETTINGS);
    const read = settings.get(key) as IDBRequest<unknown>;
    read.onsuccess = () => {
      try {
        settings.put(merge(read.result), key);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
  });
}
