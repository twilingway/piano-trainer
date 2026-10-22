import { useI18n } from "../app/useI18n";
import type { ChangeEvent, ReactNode } from "react";

import { EXERCISES } from "../song/exercises";

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
  readonly previousLessons?: readonly Lesson[];
  readonly course?: ReactNode;
  /** The lesson and level on screen, if a lesson is. */
  readonly current: { readonly exerciseId: string; readonly levelId: string } | null;
  /** The library song on screen: `my:<id>` or `dir:<path>`. */
  readonly currentSource: string | null;
  readonly onLesson: (exerciseId: string, levelId: string) => void;
  /** Saves a lesson level as a file; the library stays open and the lesson on screen stays. */
  readonly onExportLesson: (
    exerciseId: string,
    levelId: string,
    format: "musicxml" | "midi"
  ) => void;
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
  const { t } = useI18n();
  if (!props.open) return null;
  const bundledTitle = (lesson: Lesson, title: string) =>
    EXERCISES.some((exercise) => exercise.id === lesson.id) ? t(title) : title;
  const choose = (action: () => void) => () => {
    action();
    props.onClose();
  };
  const lessonGrid = (lessons: readonly Lesson[]) => (
    <div className="song-grid">
      {lessons.map((lesson) => (
        <div
          key={lesson.id}
          className="song-card"
          data-current={props.current?.exerciseId === lesson.id}
        >
          <strong>{bundledTitle(lesson, lesson.title)}</strong>
          <div className="song-card__levels">
            {lesson.levels.map((level) => (
              <div key={level.id} className="level-row">
                <button
                  type="button"
                  className="level-chip"
                  aria-pressed={
                    props.current?.exerciseId === lesson.id && props.current.levelId === level.id
                  }
                  onClick={choose(() => {
                    props.onLesson(lesson.id, level.id);
                  })}
                >
                  {bundledTitle(lesson, level.title)}
                </button>
                <button
                  type="button"
                  className="level-chip level-export"
                  aria-label={t("Скачать «{lesson} · {level}» как MusicXML", {
                    lesson: bundledTitle(lesson, lesson.title),
                    level: bundledTitle(lesson, level.title)
                  })}
                  title={t("Скачать MusicXML")}
                  onClick={() => {
                    props.onExportLesson(lesson.id, level.id, "musicxml");
                  }}
                >
                  MusicXML
                </button>
                <button
                  type="button"
                  className="level-chip level-export"
                  aria-label={t("Скачать «{lesson} · {level}» как MIDI", {
                    lesson: bundledTitle(lesson, lesson.title),
                    level: bundledTitle(lesson, level.title)
                  })}
                  title={t("Скачать MIDI")}
                  onClick={() => {
                    props.onExportLesson(lesson.id, level.id, "midi");
                  }}
                >
                  MIDI
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <GameDialog
      open={props.open}
      title={t("Библиотека")}
      className="library"
      onClose={props.onClose}
    >
      <div className="library-actions">
        <label className="game-button">
          {t("Открыть файл")}
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
            {t("Выбрать папку")}
          </button>
        )}
      </div>

      {props.course}
      <h3>{t("Уроки")}</h3>
      {lessonGrid(props.lessons)}
      {props.previousLessons && props.previousLessons.length > 0 && (
        <>
          <h3>{t("Предыдущие версии")}</h3>
          {lessonGrid(props.previousLessons)}
        </>
      )}

      {props.mySongs.length > 0 && (
        <>
          <h3>{t("Мои песни")}</h3>
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
                  aria-label={t("Удалить «{title}» из моих песен", { title: song.title })}
                  title={t("Удалить из моих")}
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
            {t("Папка «{name}»", { name: props.folder.name })}
            <button type="button" className="text-button" onClick={props.onForgetFolder}>
              {t("Отключить")}
            </button>
          </h3>
          {props.folder.needsAccess ? (
            <button type="button" className="game-button" onClick={props.onGrantFolder}>
              {t("Дать доступ к папке")}
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
