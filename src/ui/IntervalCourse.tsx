import { useLessonWindow } from "./LessonWorkspace";
import { LessonIllustration } from "./LessonIllustration";
import { useLayoutEffect, type MouseEvent, type ReactNode } from "react";
import { LessonDetails } from "./LessonDetails";
import { useI18n } from "../app/useI18n";
import type { IntervalCategory, IntervalMode } from "../intervals/types";
import { readingNoteName } from "./ReadingProgress";

export const INTERVAL_MODE_LABELS: Readonly<Record<IntervalMode, string>> = {
  "see-and-play": "Вижу и играю пару",
  "hear-and-choose": "Слышу и выбираю интервал"
};
export const INTERVAL_CATEGORY_LABELS: Readonly<Record<IntervalCategory, string>> = {
  repeat: "Повтор ноты",
  "step-up": "Шаг вверх",
  "step-down": "Шаг вниз",
  "third-up": "Терция вверх",
  "third-down": "Терция вниз"
};

export function IntervalCourseCard({
  onStart,
  completedRuns
}: {
  onStart: (mode: IntervalMode) => void;
  completedRuns?: number;
}) {
  const { t } = useI18n();
  return (
    <section className="reading-course-card">
      <LessonIllustration lesson="intervals" />
      <h3>{t("Интервалы")}</h3>
      <p>{t("Услышьте и сыграйте расстояние между двумя нотами.")}</p>
      <button
        type="button"
        className="game-button"
        onClick={() => {
          onStart("see-and-play");
        }}
      >
        {t(INTERVAL_MODE_LABELS["see-and-play"])}
      </button>
      {completedRuns !== undefined ? (
        <p className="reading-muted">{t("Завершено серий: {number}", { number: completedRuns })}</p>
      ) : null}
      <LessonDetails kind="more" id="interval:catalog:more">
        <button
          type="button"
          className="game-button"
          onClick={() => {
            onStart("hear-and-choose");
          }}
        >
          {t(INTERVAL_MODE_LABELS["hear-and-choose"])}
        </button>
      </LessonDetails>
    </section>
  );
}

export interface IntervalPracticeProps {
  progress?: ReactNode;
  mode: IntervalMode;
  index: number;
  ready: boolean;
  completed: boolean;
  listening: boolean;
  paused: boolean;
  error: boolean;
  renderError: boolean;
  helpShown: boolean;
  fullListeningCount: number;
  partialListeningCount: number;
  errorCount: number;
  pair: { anchorMidi: number; targetMidi: number; category: IntervalCategory } | undefined;
  onAnswer: (category: IntervalCategory, source: "keyboard" | "pointer") => void;
  onListen: () => void;
  onPause: () => void;
  onHelp: () => void;
  onHelpPresented?: () => void;
  onRetry: () => void;
  onStart: (mode: IntervalMode) => void;
  onNewSeries: () => void;
  onExit: () => void;
}

/** Native buttons keep Tab/Enter/Space and pointer choices on the same command path. */
export function IntervalPracticePanel(props: IntervalPracticeProps) {
  const lessonWindow = useLessonWindow();
  const { t } = useI18n();
  const ear = props.mode === "hear-and-choose";
  const choose = (category: IntervalCategory, event: MouseEvent<HTMLButtonElement>) => {
    props.onAnswer(category, event.detail === 0 ? "keyboard" : "pointer");
  };
  return (
    <section className="reading-practice interval-practice" aria-label={t("Интервалы")}>
      <div className="reading-actions">
        <strong>{t(INTERVAL_MODE_LABELS[props.mode])}</strong>
        <span>{t("Пара {number} из 10", { number: Math.min(10, props.index + 1) })}</span>
        <button type="button" className="game-button" onClick={props.onNewSeries}>
          {t("Новая серия")}
        </button>
        <button type="button" className="game-button" onClick={props.onExit}>
          {t("Выйти из интервалов")}
        </button>
      </div>
      <LessonDetails kind="more" id="interval:practice:more">
        <button
          type="button"
          className="game-button"
          onClick={() => {
            props.onStart(ear ? "see-and-play" : "hear-and-choose");
          }}
        >
          {t(INTERVAL_MODE_LABELS[ear ? "see-and-play" : "hear-and-choose"])}
        </button>
      </LessonDetails>
      {ear ? (
        <>
          <LessonDetails kind="guide" id="interval:practice:guide">
            <p>
              {t("Слушайте две ноты по очереди. Первая — опора. Выберите, куда движется вторая.")}
            </p>
          </LessonDetails>
          <div className="reading-actions">
            <button
              type="button"
              className="game-button"
              disabled={props.listening || props.paused || props.completed}
              onClick={props.onListen}
            >
              {t(props.fullListeningCount > 0 ? "Послушать пару ещё раз" : "Послушать пару")}
            </button>
            <button
              type="button"
              className="game-button"
              disabled={props.completed}
              onClick={props.onPause}
            >
              {t(props.paused ? "Продолжить интервалы" : "Пауза интервалов")}
            </button>
          </div>
          <p aria-live="polite">
            {t(
              props.completed
                ? "Серия интервалов завершена."
                : props.listening
                  ? "Пара звучит…"
                  : props.paused
                    ? "Практика интервалов на паузе."
                    : props.ready
                      ? "Выберите интервал."
                      : "Для ответа прослушайте пару целиком."
            )}
          </p>
          <div
            className="reading-actions interval-choices"
            role="group"
            aria-label={t("Выбор интервала")}
          >
            {(Object.keys(INTERVAL_CATEGORY_LABELS) as IntervalCategory[]).map((category) => (
              <button
                type="button"
                className="game-button"
                disabled={!props.ready || props.completed || props.listening || props.paused}
                key={category}
                onClick={(event) => {
                  choose(category, event);
                }}
              >
                {t(INTERVAL_CATEGORY_LABELS[category])}
              </button>
            ))}
          </div>
          <p className="reading-muted">
            {t("Полных прослушиваний: {full}; прерванных: {partial}.", {
              full: props.fullListeningCount,
              partial: props.partialListeningCount
            })}
          </p>
          {props.error && (
            <p role="alert">
              {t("Не удалось воспроизвести пару. Включите звук и повторите прослушивание.")}
            </p>
          )}
        </>
      ) : (
        <p>
          {t("Нажмите «Играть» и сыграйте обе ноты по порядку. Ошибка оставляет текущую ноту.")}
        </p>
      )}
      {props.errorCount > 0 && (
        <p aria-live="polite">
          {t("Ошибок в текущей паре: {number}", { number: props.errorCount })}
        </p>
      )}
      {props.renderError && (
        <p role="alert">
          {t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}{" "}
          <button type="button" onClick={props.onRetry}>
            {t("Повторить загрузку стана")}
          </button>
        </p>
      )}
      <button
        type="button"
        className="game-button"
        disabled={
          !props.ready || props.helpShown || props.completed || props.listening || props.paused
        }
        onClick={props.onHelp}
      >
        {t("Показать ответ")}
      </button>
      {props.helpShown && props.pair && (
        <IntervalHelp onPresented={props.onHelpPresented}>
          {t("Ответ пары: {first} → {second}, {category}.", {
            first: readingNoteName(props.pair.anchorMidi, t),
            second: readingNoteName(props.pair.targetMidi, t),
            category: t(INTERVAL_CATEGORY_LABELS[props.pair.category])
          })}
        </IntervalHelp>
      )}
      {lessonWindow ? (
        <LessonDetails kind="progress" id="interval:practice:progress">
          {props.progress}
        </LessonDetails>
      ) : (
        props.progress
      )}
    </section>
  );
}

/** Confirmation belongs to the mounted answer; a removed or replaced request is not shown help. */
function IntervalHelp({
  children,
  onPresented
}: {
  children: ReactNode;
  onPresented: (() => void) | undefined;
}) {
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      onPresented?.();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [onPresented]);
  return (
    <p className="reading-hint" aria-live="polite">
      {children}
    </p>
  );
}
