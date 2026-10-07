import { useEffect, useLayoutEffect, useState, type ChangeEvent } from "react";
import type { Song } from "../song/song";
import type { LessonChoice } from "./lessons";
import { createLibraryController } from "./libraryController";
import { songActions } from "./songSlice";
import { useAppSelector, useAppStore } from "./storeHooks";
interface Options {
  readonly showSong: (song: Song, source: string | null) => void;
  readonly setLibrarySource: (source: string | null) => void;
  readonly openLesson: (choice: LessonChoice) => void;
}
/** Delivery of committed commands; metadata and selection are owned by Redux. */
function createLibraryCommands(initial: Options) {
  let current = initial;
  return {
    read: () => current,
    publish(next: Options) {
      current = next;
    }
  };
}
/** Single runtime owner for handles; metadata belongs to Redux. */
export function usePlayerLibrary(options: Options) {
  const store = useAppStore();
  const [commands] = useState(() => createLibraryCommands(options));
  useLayoutEffect(() => {
    commands.publish(options);
  }, [commands, options]);
  const [source] = useState(() => store.getState().preferences.player.librarySource);
  const [controller] = useState(() =>
    createLibraryController({
      getState: () => store.getState(),
      dispatch: (action) => store.dispatch(action),
      beginSelection: () => {
        store.dispatch(songActions.beginSongSelection());
      },
      showSong: (song, selected) => {
        commands.read().showSong(song, selected);
      },
      setLibrarySource: (selected) => {
        commands.read().setLibrarySource(selected);
      },
      openLesson: (choice) => {
        commands.read().openLesson(choice);
      }
    })
  );
  useEffect(() => {
    void controller.restore(source);
    return () => {
      controller.dispose();
    };
  }, [controller, source]);
  const library = useAppSelector((state) => state.library);
  return {
    mySongs: library.mySongs,
    folder: library.folder ?? undefined,
    loadError: library.loadError,
    openFile: (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      return file ? controller.openFile(file) : Promise.resolve();
    },
    openMySong: (id: string) => controller.openMySong(id),
    openFolderSong: (path: string) => controller.openFolderSong(path),
    deleteMySong: (id: string) => controller.deleteMySong(id),
    chooseFolder: () => controller.chooseFolder(),
    grantFolder: () => {
      void controller.grantFolder();
    },
    forgetFolder: () => controller.forgetFolder()
  };
}
