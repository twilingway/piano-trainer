import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { CourseMaterial, SongCourseResult as CourseResult } from "../songCourse/model";
import { useI18n } from "../app/useI18n";
import { SongCourseMenu } from "./SongCourseMenu";
import { SongCourseResult } from "./SongCourseResult";

export type SongCourseLessonPhase =
  | "ready"
  | "demo"
  | "playing"
  | "paused"
  | "awaiting-keys-up"
  | "awaiting-rehold"
  | "awaiting-release"
  | "result"
  | "error";
export interface SongCourseLessonProps {
  readonly material: CourseMaterial;
  readonly phase: SongCourseLessonPhase;
  readonly progress: number;
  readonly speed?: number;
  readonly onSpeed?: (speed: number) => void;
  readonly result: CourseResult | null;
  readonly error: string | null;
  readonly storageError: boolean;
  readonly hasNext: boolean;
  readonly canReview: boolean;
  readonly score: ReactNode;
  readonly characters?: ReactNode;
  readonly waiting?: boolean;
  readonly helperPitch?: number;
  readonly onStart: () => void;
  readonly onDemo: () => void;
  readonly onPause: () => void;
  readonly onRetry: () => void;
  readonly onNext: () => void;
  readonly onReview: () => void;
  readonly onExit: () => void;
  readonly onRetrySave: () => void;
  readonly onSettings?: () => void;
  readonly onLanguage?: () => void;
  readonly onFullscreen?: () => void;
}

const GOALS = {
  notes: "Нажмите ноты, которые видите",
  duration: "Держите ноту до конца",
  "guided-phrase": "Сыграйте фразу с подсказками",
  "independent-phrase": "Сыграйте фразу самостоятельно",
  performance: "Сыграйте мелодию в темпе",
  review: "Повторите трудную фразу"
} as const;

/** The score keeps one owner while optional instructions stay out of its playing room. */
export function SongCourseLesson(props: SongCourseLessonProps) {
  const { t } = useI18n();
  const { material, phase } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const running = phase === "playing" || phase === "demo";
  const holding =
    phase === "awaiting-keys-up" || phase === "awaiting-rehold" || phase === "awaiting-release";
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButton.current?.focus();
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);
  if (props.result && phase === "result")
    return (
      <SongCourseResult
        result={props.result}
        hasNext={props.hasNext}
        canReview={props.canReview}
        storageError={props.storageError}
        onRetry={props.onRetry}
        onNext={props.onNext}
        onReview={props.onReview}
        onExit={props.onExit}
        onRetrySave={props.onRetrySave}
      />
    );
  const progress = Number.isFinite(props.progress) ? Math.min(1, Math.max(0, props.progress)) : 0;
  const status =
    phase === "demo"
      ? "Слушайте помощника"
      : phase === "awaiting-keys-up"
        ? "Сначала отпустите клавиши"
        : phase === "awaiting-rehold"
          ? "Снова нажмите прежнюю ноту"
          : phase === "awaiting-release"
            ? "Завершаем звук — отпустите клавишу"
            : phase === "paused"
              ? "Пауза в мелодии"
              : props.waiting && phase === "playing"
                ? "Жду ноту"
                : phase === "playing"
                  ? "Теперь ваша очередь"
                  : GOALS[material.node.kind];
  const actionLabel = running
    ? "Пауза в песне"
    : phase === "paused"
      ? "Продолжить исполнение"
      : "Сыграть этап";
  const action = phase === "error" ? props.onRetry : running ? props.onPause : props.onStart;
  return (
    <section className="song-course-lesson" aria-label={t(material.node.title)} data-phase={phase}>
      <header className="song-course-lesson__bar">
        <button
          type="button"
          className="game-button song-course-lesson__icon"
          aria-label={t("К пути по мелодиям")}
          title={t("К пути по мелодиям")}
          onClick={props.onExit}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="song-course-lesson__progress">
          <progress
            max={1}
            value={progress}
            aria-label={t("Прогресс мелодии в этом этапе")}
            aria-valuetext={t("Мелодия пройдена на {value}%", {
              value: Math.round(progress * 100)
            })}
          />
        </div>
        <button
          ref={menuButton}
          type="button"
          className="game-button song-course-lesson__icon"
          aria-label={t("Подсказки и меню этапа")}
          title={t("Подсказки и меню этапа")}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => {
            if (menuOpen) closeMenu();
            else {
              if (running) props.onPause();
              setMenuOpen(true);
            }
          }}
        >
          <span aria-hidden="true">···</span>
        </button>
        {menuOpen && (
          <SongCourseMenu
            id={menuId}
            instruction={t(material.node.instruction)}
            phase={phase}
            speed={props.speed ?? 1}
            onSpeed={props.onSpeed}
            onDemo={props.onDemo}
            onRetry={props.onRetry}
            onSettings={props.onSettings}
            onLanguage={props.onLanguage}
            onFullscreen={props.onFullscreen}
            onClose={closeMenu}
            buttonRef={menuButton}
          />
        )}
      </header>
      <div className="song-course-lesson__heading">
        <h2>{t(material.node.title)}</h2>
        <p role="status" aria-live="polite" className="song-course-lesson__status">
          {t(status)}
        </p>
      </div>
      {props.error && (
        <div role="alert" className="song-course-error">
          {t(props.error)}
        </div>
      )}
      <div className="song-course-lesson__playing-room">
        {props.characters && (
          <div className="song-course-lesson__characters">{props.characters}</div>
        )}
        <div className="song-course-lesson__score lesson-workspace__score">{props.score}</div>
      </div>
      <footer className="song-course-lesson__action">
        {holding ? (
          <p className="song-course-lesson__hold-status">{t("Дождитесь отпускания клавиши")}</p>
        ) : (
          <button type="button" className="game-button lesson-main-action" onClick={action}>
            {t(phase === "error" ? "Загрузить этап ещё раз" : actionLabel)}
          </button>
        )}
      </footer>
    </section>
  );
}
