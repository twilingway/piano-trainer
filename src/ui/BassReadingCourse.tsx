import { useI18n } from "../app/useI18n";
import { LessonDetails } from "./LessonDetails";
import type { BassReadingResult, BassReadingTask } from "../reading/bassTypes";
import type { ReadingHintLevel, ReadingPreferences } from "../reading/types";
import {
  BASS_READING_TASK_LABELS,
  BassReadingProgress,
  BassReadingResults,
  bassReadingNoteName,
  type BassReadingProgressProps
} from "./BassReadingProgress";

export function BassReadingCourseCard({
  onStart,
  onIntro,
  ...progress
}: BassReadingProgressProps & { onStart: (task: BassReadingTask) => void; onIntro: () => void }) {
  const { t } = useI18n();
  return (
    <section className="reading-course-card">
      <h3>{t("Левая рука: пять нот")}</h3>
      <p>{t("Читайте до–соль малой октавы в басовом ключе и находите их на клавиатуре.")}</p>
      <div className="reading-actions">
        <button
          type="button"
          className="game-button lesson-primary-action"
          onClick={() => {
            onStart("notes");
          }}
        >
          {t(BASS_READING_TASK_LABELS.notes)}
        </button>
        <button type="button" className="game-button lesson-secondary-action" onClick={onIntro}>
          {t("Знакомство с левой рукой")}
        </button>
      </div>
      <LessonDetails kind="more" id="bass-reading:catalog:more">
        <button
          type="button"
          className="game-button"
          onClick={() => {
            onStart("phrases");
          }}
        >
          {t(BASS_READING_TASK_LABELS.phrases)}
        </button>
      </LessonDetails>
      <p className="reading-muted">
        {t("Сохранено басовых серий: {number}", { number: progress.history.length })}
      </p>
      <LessonDetails kind="progress" id="bass-reading:catalog:progress">
        <BassReadingProgress {...progress} />
      </LessonDetails>
    </section>
  );
}

export interface BassReadingPracticeProps extends BassReadingProgressProps {
  task: BassReadingTask;
  preferences: ReadingPreferences;
  onPreferences: (value: Partial<ReadingPreferences>) => void;
  onHint: () => void;
  hintLevel: ReadingHintLevel;
  hintPitch?: number | undefined;
  index: number;
  renderError: boolean;
  onRetry: () => void;
  onNewSeries: () => void;
  onExit: () => void;
  result: BassReadingResult | null;
  ready: boolean;
}

export function BassReadingPracticePanel(props: BassReadingPracticeProps) {
  const { t } = useI18n();
  const { task, preferences, result } = props;
  const history = props.history
    .filter((item) => item.task === task)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-20);
  return (
    <section className="reading-practice" aria-label={t("Левая рука: пять нот")}>
      <div className="reading-actions">
        <strong>{t(BASS_READING_TASK_LABELS[task])}</strong>
        <span>{t("Нота {number} из 20", { number: Math.min(20, props.index + 1) })}</span>
        <button type="button" className="game-button" onClick={props.onNewSeries}>
          {t("Новая серия")}
        </button>
        <button type="button" className="game-button" onClick={props.onExit}>
          {t("Выйти из басового чтения")}
        </button>
        <button
          type="button"
          className="game-button"
          disabled={!props.ready || props.renderError || props.hintLevel === 2 || result !== null}
          onClick={props.onHint}
        >
          {t("Подсказка")}
        </button>
      </div>
      <div className="reading-status">
        <p
          className={`reading-muted${props.ready || result || props.renderError ? " reading-status-hidden" : ""}`}
        >
          {t("Нажмите «Играть» и дождитесь появления текущей ноты.")}
        </p>
        {props.renderError ? (
          <p role="alert">
            {t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}{" "}
            <button type="button" onClick={props.onRetry}>
              {t("Повторить загрузку стана")}
            </button>
          </p>
        ) : (
          props.ready &&
          result === null &&
          props.hintLevel > 0 &&
          props.hintPitch !== undefined && (
            <p className="reading-hint" aria-live="polite">
              {t("Текущая нота: {note}", { note: bassReadingNoteName(props.hintPitch, t) })}
            </p>
          )
        )}
      </div>
      <LessonDetails kind="settings" id="bass-reading:practice:settings">
        <div className="reading-hint-settings">
          <h4>{t("Настройки подсказок чтения")}</h4>
          <label>
            <input
              type="checkbox"
              checked={preferences.automaticHints}
              onChange={(event) => {
                props.onPreferences({ automaticHints: event.target.checked });
              }}
            />
            {t("Показывать подсказки автоматически")}
          </label>
          <label>
            {t("Название ноты через, с")}
            <input
              type="number"
              min={1}
              max={60}
              value={preferences.nameDelayMs / 1000}
              onChange={(event) => {
                props.onPreferences({ nameDelayMs: Number(event.target.value) * 1000 });
              }}
            />
          </label>
          <label>
            {t("Клавиша через, с")}
            <input
              type="number"
              min={preferences.nameDelayMs / 1000}
              max={60}
              value={preferences.keyDelayMs / 1000}
              onChange={(event) => {
                props.onPreferences({ keyDelayMs: Number(event.target.value) * 1000 });
              }}
            />
          </label>
        </div>
      </LessonDetails>
      {result && <BassReadingResults result={result} sourceFilter={props.sourceFilter} />}
      <LessonDetails kind="progress" id="bass-reading:practice:progress">
        <BassReadingProgress
          history={props.history}
          sourceFilter={props.sourceFilter}
          onSourceFilter={props.onSourceFilter}
        />
        <details className="reading-history">
          <summary>{t("История этого задания: {number}", { number: history.length })}</summary>
          {history
            .slice()
            .reverse()
            .map((item) => (
              <BassReadingResults key={item.id} result={item} sourceFilter={props.sourceFilter} />
            ))}
        </details>
      </LessonDetails>
    </section>
  );
}
