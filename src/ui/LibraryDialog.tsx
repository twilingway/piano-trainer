import type { ChangeEvent } from "react";

import { GameDialog } from "./GameDialog";

interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly levels: readonly { readonly id: string; readonly title: string }[];
}

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly lessons: readonly Lesson[];
  /** The lesson and level on screen, if a lesson is. */
  readonly current: { readonly exerciseId: string; readonly levelId: string } | null;
  /** The library song on screen: `my:<id>` or `dir:<path>`. */
  readonly currentSource: string | null;
  readonly onLesson: (exerciseId: string, levelId: string) => void;
  readonly mySongs: readonly { readonly id: string; readonly title: string }[];
  readonly onMySong: (id: string) => void;
  readonly onDeleteMySong: (id: string) => void;
  readonly folder:
    | {
        readonly name: string;
        readonly needsAccess: boolean;
        readonly songs: readonly { readonly path: string; readonly title: string }[];
      }
    | undefined;
  readonly foldersSupported: boolean;
  readonly onFolderSong: (path: string) => void;
  readonly onChooseFolder: () => void;
  readonly onGrantFolder: () => void;
  readonly onForgetFolder: () => void;
  readonly onOpenFile: (event: ChangeEvent<HTMLInputElement>) => void;
}

/** Every song to play, as cards: lessons with their levels, the player's own songs, the folder. */
export function LibraryDialog(props: Props) {
  const choose = (action: () => void) => () => {
    action();
    props.onClose();
  };
  return (
    <GameDialog open={props.open} title="Библиотека" className="library" onClose={props.onClose}>
      <div className="library-actions">
        <label className="game-button">
          Открыть файл
          <input
            type="file"
            accept=".mid,.midi,.musicxml,.xml,.mxl"
            hidden
            onChange={(event) => {
              props.onOpenFile(event);
              props.onClose();
            }}
          />
        </label>
        {props.foldersSupported && !props.folder && (
          <button type="button" className="game-button" onClick={props.onChooseFolder}>
            Выбрать папку
          </button>
        )}
      </div>

      <h3>Уроки</h3>
      <div className="song-grid">
        {props.lessons.map((lesson) => (
          <div
            key={lesson.id}
            className="song-card"
            data-current={props.current?.exerciseId === lesson.id}
          >
            <strong>{lesson.title}</strong>
            <div className="song-card__levels">
              {lesson.levels.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className="level-chip"
                  aria-pressed={
                    props.current?.exerciseId === lesson.id && props.current.levelId === level.id
                  }
                  onClick={choose(() => {
                    props.onLesson(lesson.id, level.id);
                  })}
                >
                  {level.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {props.mySongs.length > 0 && (
        <>
          <h3>Мои песни</h3>
          <div className="song-grid">
            {props.mySongs.map((song) => (
              <div
                key={song.id}
                className="song-card"
                data-current={props.currentSource === `my:${song.id}`}
              >
                <button
                  type="button"
                  className="song-card__open"
                  onClick={choose(() => {
                    props.onMySong(song.id);
                  })}
                >
                  {song.title}
                </button>
                <button
                  type="button"
                  className="song-card__remove"
                  aria-label={`Удалить «${song.title}» из моих песен`}
                  title="Удалить из моих"
                  onClick={() => {
                    props.onDeleteMySong(song.id);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {props.folder && (
        <>
          <h3>
            Папка «{props.folder.name}»
            <button type="button" className="text-button" onClick={props.onForgetFolder}>
              Отключить
            </button>
          </h3>
          {props.folder.needsAccess ? (
            <button type="button" className="game-button" onClick={props.onGrantFolder}>
              Дать доступ к папке
            </button>
          ) : (
            <div className="song-grid">
              {props.folder.songs.map((song) => (
                <button
                  key={song.path}
                  type="button"
                  className="song-card song-card__open"
                  data-current={props.currentSource === `dir:${song.path}`}
                  onClick={choose(() => {
                    props.onFolderSong(song.path);
                  })}
                >
                  {song.title}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </GameDialog>
  );
}
