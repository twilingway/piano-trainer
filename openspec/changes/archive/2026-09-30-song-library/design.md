## Context

See proposal.md — Why. Today `App.tsx` reads an opened file with `readSongFile` and keeps only the
parsed `Song` in state; lessons are the built-in `EXERCISES` plus `LOCAL_LESSONS` compiled in from
`local-lessons/`. Finger corrections and takes are already keyed by song title and note count in
`localStorage`.

## Goals / Non-Goals

**Goals:** store the file as opened, not the parsed song, so a library song reads back exactly like
an opened file and benefits from later parser fixes; keep the library and folder code out of React.

**Non-Goals:** migrating existing corrections or takes; a shared or server library.

## Decisions

- **IndexedDB, raw bytes.** A song is stored as
  `{ id, fileName, title, addedAt, data: ArrayBuffer }` in an object store `songs`; the list reads
  metadata only. `localStorage` holds strings up to ~5 MB per site, a few dozen scores; IndexedDB
  holds binary data (MIDI, `.mxl`) without base64 and far more of it. No wrapper library: the API
  surface used is five calls.
- **Same file = same name and size.** Replacing on an exact match keeps re-opens from piling up
  without hashing whole files; two different files with the same name and size are rare enough to
  accept.
- **Folder by File System Access API, handle kept in IndexedDB.** The browser serialises a
  `FileSystemDirectoryHandle` into IndexedDB (structured clone), which is how a grant survives a
  reload. Permission is queried on start without prompting; prompting needs a click, so a button is
  shown when the state is `prompt`. Rejected: a hidden `<input webkitdirectory>` — it re-uploads
  every file each time and cannot be remembered.
- **One file reader.** `songFromFileData(fileName, bytes)` replaces `readSongFile`, used for opened
  files, library songs and folder songs alike.
- **Lesson list as one select with groups.** Values are prefixed: built-in and local lessons keep
  their ids, library songs are `my:<id>`, folder songs `dir:<path>`. The level select only shows for
  lessons.

## Risks / Trade-offs

- [Clearing site data wipes the library] → stated in the proposal; export is out of scope.
- [Storage quota] → a single score is ~60 KB; a failed write shows an error and the song still
  opens.
- [Folder permission flow differs by browser version] → only `queryPermission` and
  `requestPermission` are relied on, both guarded; any failure falls back to "no folder".
- [IndexedDB in tests] → `fake-indexeddb` as a dev dependency gives an in-memory implementation.
