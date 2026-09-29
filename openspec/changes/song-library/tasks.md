## 1. File reading

- [x] 1.1 Move reading a song from a file's bytes into `src/library/songFile.ts`
      (`songFromFileData`, `isSongFile`, `titleOf`) and verify with tests that MusicXML and MIDI
      bytes read back into the expected notes and a non-song name is rejected

## 2. Library storage

- [x] 2.1 Add `fake-indexeddb` as a dev dependency and verify `pnpm install` succeeds
- [x] 2.2 Implement `src/library/myLibrary.ts` (list, save with replace-on-same-file, load, remove,
      folder handle) and verify with tests against `fake-indexeddb`: save/list/load round trip, same
      name and size replaces, remove deletes

## 3. Folder

- [x] 3.1 Implement `src/library/folder.ts` (support check, pick, permission, read songs two levels
      deep) and verify with a test over a fake directory handle that nested song files are listed by
      path and other files are skipped

## 4. App

- [ ] 4.1 Save each opened song file to the library and select it; verify by opening a file,
      reloading and finding it under «Мои песни»
- [x] 4.2 Group the lesson select into «Уроки», «Мои песни» and «Папка: <имя>», load library and
      folder songs through `songFromFileData`, and verify by `pnpm typecheck` and selecting each
      kind
- [ ] 4.3 Add «Удалить из моих» for a selected library song and verify it disappears after a reload
- [ ] 4.4 Add «Выбрать папку», «Отключить папку» and «Дать доступ к папке» (Chrome and Edge only)
      and verify by picking a folder, reloading and granting access

## 5. Integration

- [ ] 5.1 Run `pnpm check` and `pnpm spec:validate` and verify both pass
