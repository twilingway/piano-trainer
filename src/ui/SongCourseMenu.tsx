import { useEffect, useRef, type RefObject } from "react";
import { useI18n } from "../app/useI18n";
import type { SongCourseLessonPhase } from "./SongCourseLesson";

interface Props {
  readonly id: string;
  readonly instruction: string;
  readonly accompaniment?: boolean | undefined;
  readonly phase: SongCourseLessonPhase;
  readonly speed: number;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly onSpeed: ((speed: number) => void) | undefined;
  readonly onDemo: () => void;
  readonly onRetry: () => void;
  readonly onSettings: (() => void) | undefined;
  readonly onLanguage: (() => void) | undefined;
  readonly onFullscreen: (() => void) | undefined;
  readonly onClose: () => void;
}

export function SongCourseMenu(props: Props) {
  const { t } = useI18n();
  const menu = useRef<HTMLDivElement>(null);
  const close = props.onClose;
  const button = props.buttonRef;
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !button.current?.contains(event.target)
      )
        close();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
    };
  }, [close, button]);
  const run = (action: () => void) => () => {
    props.onClose();
    action();
  };
  const canDemo = props.phase === "ready" || props.phase === "paused";
  return (
    <div
      ref={menu}
      id={props.id}
      className="song-course-menu"
      role="dialog"
      aria-label={t("Подсказки и меню урока")}
    >
      <div className="song-course-menu__head">
        <strong>{t("Как пройти урок")}</strong>
        <button
          type="button"
          className="game-button song-course-lesson__icon"
          aria-label={t("Закрыть")}
          onClick={props.onClose}
        >
          ×
        </button>
      </div>
      <p>{props.instruction}</p>
      {props.accompaniment && (
        <p>
          {t(
            "В примере звучит мелодия со стана. Во время вашей игры компьютер добавляет сопровождение."
          )}
        </p>
      )}
      <div className="song-course-menu__actions">
        {canDemo && (
          <button type="button" className="game-button" onClick={run(props.onDemo)}>
            {t("Послушать пример песни")}
          </button>
        )}
        <button type="button" className="game-button" onClick={run(props.onRetry)}>
          {t("Начать урок заново")}
        </button>
      </div>
      {props.phase === "ready" && props.onSpeed && (
        <label className="song-course-lesson__speed">
          <span>{t("Скорость урока: {value}%", { value: Math.round(props.speed * 100) })}</span>
          <input
            type="range"
            min={0.25}
            max={1}
            step={0.05}
            value={props.speed}
            aria-label={t("Выбрать скорость урока")}
            onChange={(event) => props.onSpeed?.(Number(event.target.value))}
          />
        </label>
      )}
      <p className="song-course-menu__range-note">
        {t("На телефоне и планшете клавиши подобраны для урока. Ваш обычный диапазон сохранён.")}
      </p>
      <div className="song-course-menu__actions">
        {props.onSettings && (
          <button type="button" className="game-button" onClick={run(props.onSettings)}>
            {t("Настройки")}
          </button>
        )}
        {props.onLanguage && (
          <button type="button" className="game-button" onClick={props.onLanguage}>
            {t("Сменить язык урока")}
          </button>
        )}
        {props.onFullscreen && (
          <button type="button" className="game-button" onClick={run(props.onFullscreen)}>
            {t("На весь экран")}
          </button>
        )}
      </div>
    </div>
  );
}
