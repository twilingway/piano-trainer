import type { ReactNode } from "react";
import type { CourseMaterial, SongCourseResult as CourseResult } from "../songCourse/model";
import { useI18n } from "../app/useI18n";
import { LessonWorkspace } from "./LessonWorkspace";
import { LessonSlot } from "./LessonSlots";
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
}
const WINDOWS = { open: null, onOpen: () => undefined, interruptsAttempt: false };

export function SongCourseLesson(props: SongCourseLessonProps) {
  const { t } = useI18n();
  const { material, phase } = props;
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
  const running = phase === "playing" || phase === "demo";
  const holding =
    phase === "awaiting-keys-up" || phase === "awaiting-rehold" || phase === "awaiting-release";
  const status =
    phase === "demo"
      ? "Слушайте помощника"
      : phase === "awaiting-keys-up"
        ? "Сначала отпустите клавиши"
        : phase === "awaiting-rehold"
          ? "Снова нажмите прежнюю ноту"
          : phase === "awaiting-release"
            ? "Завершаем звук — отпустите клавишу"
            : material.node.kind === "performance"
              ? "Играем всю мелодию в темпе"
              : "Теперь ваша очередь";
  return (
    <div className="song-course-lesson">
      <LessonWorkspace
        title={t(material.node.title)}
        instruction={t(material.node.instruction)}
        input=""
        score={props.score}
        waiting={props.waiting === true && phase === "playing"}
        windows={WINDOWS}
        action={
          holding ? (
            <p role="status" className="song-course-lesson__hold-status">
              {t(status)}
            </p>
          ) : (
            <button
              type="button"
              className="game-button lesson-main-action"
              onClick={running ? props.onPause : props.onStart}
            >
              {t(
                running
                  ? "Пауза в песне"
                  : phase === "paused"
                    ? "Продолжить исполнение"
                    : "Сыграть этап"
              )}
            </button>
          )
        }
      >
        <LessonSlot name="exit">
          <button type="button" className="game-button" onClick={props.onExit}>
            {t("К пути по мелодиям")}
          </button>
        </LessonSlot>
        <LessonSlot name="counter">
          <div className="song-course-lesson__progress">
            <progress
              max={1}
              value={progress}
              aria-label={t("Прогресс мелодии в этом этапе")}
              aria-valuetext={t("Мелодия пройдена на {value}%", {
                value: Math.round(progress * 100)
              })}
            />
            <span role="status">{t(status)}</span>
          </div>
        </LessonSlot>
        {phase === "ready" && props.onSpeed && (
          <LessonSlot name="answer">
            <label className="song-course-lesson__speed">
              <span>
                {t("Скорость этапа: {value}%", { value: Math.round((props.speed ?? 1) * 100) })}
              </span>
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.05}
                value={props.speed ?? 1}
                aria-label={t("Выбрать скорость до начала этапа")}
                onChange={(event) => {
                  props.onSpeed?.(Number(event.target.value));
                }}
              />
              <small>{t("Выберите удобную скорость перед игрой.")}</small>
            </label>
          </LessonSlot>
        )}
        {!running && !holding && phase !== "error" && (
          <LessonSlot name="hint">
            <button type="button" className="game-button" onClick={props.onDemo}>
              {t("Послушать пример песни")}
            </button>
          </LessonSlot>
        )}
        {props.error && (
          <LessonSlot name="feedback">
            <div role="alert" className="song-course-error">
              <p>{t(props.error)}</p>
              <button type="button" className="game-button" onClick={props.onRetry}>
                {t("Загрузить этап ещё раз")}
              </button>
            </div>
          </LessonSlot>
        )}
      </LessonWorkspace>
    </div>
  );
}
