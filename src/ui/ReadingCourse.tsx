import { ReadingLessonSummary } from "./LessonResultSummary";
import { LessonIllustration } from "./LessonIllustration";
import { LessonReport } from "./LessonReport";
import { useI18n } from "../app/useI18n";
import { LessonDetails } from "./LessonDetails";
import { LessonMenuItem, LessonSlot } from "./LessonSlots";
import { readingPurpose, summarizeReadingResults } from "../reading/progress";
import type { ReadingPurpose, ReadingSourceFilter } from "../reading/progressTypes";
import type {
  ReadingHintLevel,
  ReadingPreferences,
  ReadingResult,
  ReadingTask
} from "../reading/types";
import {
  READING_PURPOSE_LABELS,
  ReadingMetricsTable,
  ReadingProgress,
  readingNoteName,
  type ReadingProgressProps
} from "./ReadingProgress";

export { readingNoteName };

export const READING_TASK_LABELS: Readonly<Record<ReadingTask, string>> = {
  notes: "Читаю отдельные ноты",
  phrases: "Читаю короткие фразы",
  check: "Проверяю чтение без подсказок"
};
export function ReadingCourseCard({
  onStart,
  onIntro,
  history,
  onAdaptive,
  onDelayedCheck,
  ...progress
}: ReadingProgressProps & {
  onStart: (task: ReadingTask) => void;
  onIntro: () => void;
  history: readonly ReadingResult[];
}) {
  const { t } = useI18n();
  return (
    <section className="reading-course-card">
      <LessonIllustration lesson="right-hand" />
      <h3>{t("Правая рука: пять нот")}</h3>
      <p>{t("Узнавайте до–соль в скрипичном ключе и находите их правой рукой.")}</p>
      <div className="reading-actions">
        <button
          type="button"
          className="game-button lesson-primary-action"
          onClick={() => {
            onStart("notes");
          }}
        >
          {t(READING_TASK_LABELS.notes)}
        </button>
      </div>
      <LessonDetails kind="more" id="reading:catalog:more">
        <button type="button" className="game-button lesson-secondary-action" onClick={onIntro}>
          {t("Знакомство с пятью нотами")}
        </button>
        <div className="reading-actions">
          {(["phrases", "check"] as const).map((task) => (
            <button
              type="button"
              className="game-button"
              key={task}
              onClick={() => {
                onStart(task);
              }}
            >
              {t(READING_TASK_LABELS[task])}
            </button>
          ))}
          {onAdaptive && (
            <button type="button" className="game-button" onClick={onAdaptive}>
              {t("Повторить трудные ноты")}
            </button>
          )}
          {progress.delayedDue && onDelayedCheck && (
            <button type="button" className="game-button" onClick={onDelayedCheck}>
              {t("Проверить чтение спустя время")}
            </button>
          )}
        </div>
      </LessonDetails>
      <p className="reading-muted">
        {t("Завершено серий: {number}", {
          number: progress.profile?.processedRunIds.length ?? history.length
        })}
      </p>
      <ReadingGenerationError {...progress} />
      <LessonDetails kind="progress" id="reading:catalog:progress">
        <ReadingProgress history={history} {...progress} generationError={false} />
      </LessonDetails>
    </section>
  );
}

function ReadingGenerationError(props: ReadingProgressProps) {
  const { t } = useI18n();
  return props.generationError ? (
    <p role="alert">
      {t("Не удалось подобрать новый порядок нот для проверки.")}{" "}
      {props.onGenerationRetry && (
        <button type="button" onClick={props.onGenerationRetry}>
          {t("Повторить поиск серии")}
        </button>
      )}
    </p>
  ) : null;
}

interface PracticeProps extends ReadingProgressProps {
  task: ReadingTask;
  purpose?: ReadingPurpose;
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
  result: ReadingResult | null;
  history: readonly ReadingResult[];
  ready: boolean;
}
export function ReadingPracticePanel(props: PracticeProps) {
  const { t } = useI18n();
  const { task, preferences, result } = props;
  return (
    <section className="reading-practice" aria-label={t("Правая рука: пять нот")}>
      <LessonSlot name="counter">
        <span className="lesson-counter__mode">
          {t(READING_PURPOSE_LABELS[props.purpose ?? task])}
        </span>
        <span className="lesson-counter">
          {result
            ? t("Завершено · {number} из {total}", { number: 20, total: 20 })
            : t("Нота {number} из 20", { number: Math.min(20, props.index + 1) })}
        </span>
      </LessonSlot>
      <LessonSlot name="exit">
        <button type="button" className="game-button lesson-exit" onClick={props.onExit}>
          {t("Выйти")}
        </button>
      </LessonSlot>
      {result === null && (
        <LessonMenuItem kind="newSeries" label={t("Новая серия")} onSelect={props.onNewSeries} />
      )}
      {task !== "check" && (
        <LessonSlot name="hint">
          <button
            type="button"
            className="game-button"
            disabled={!props.ready || props.hintLevel === 2 || result !== null}
            onClick={props.onHint}
          >
            {t("Подсказка")}
          </button>
        </LessonSlot>
      )}
      {props.renderError ? (
        <LessonSlot name="feedback">
          <p role="alert">
            {t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}{" "}
            <button type="button" onClick={props.onRetry}>
              {t("Повторить загрузку стана")}
            </button>
          </p>
        </LessonSlot>
      ) : (
        props.hintLevel > 0 &&
        props.hintPitch !== undefined &&
        task !== "check" && (
          <LessonSlot name="feedback">
            <p className="reading-hint">
              {t("Подсказка: {note}", { note: readingNoteName(props.hintPitch, t) })}
            </p>
          </LessonSlot>
        )
      )}
      {task !== "check" && (
        <LessonDetails kind="settings" id="reading:practice:settings">
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
      )}
      {result && (
        <LessonReport summary={<ReadingLessonSummary result={result} />}>
          <ReadingResults result={result} sourceFilter={props.sourceFilter} />
        </LessonReport>
      )}
      <LessonSlot name="feedback">
        <ReadingGenerationError {...props} />
      </LessonSlot>
      <LessonDetails kind="progress" id="reading:practice:progress">
        <ReadingProgress {...props} generationError={false} />
        <details className="reading-history">
          <summary>
            {t("История этого задания: {number}", {
              number: props.history.filter((item) => item.task === task).length
            })}
          </summary>
          {props.history
            .filter((item) => item.task === task)
            .slice()
            .reverse()
            .map((item) => (
              <ReadingResults key={item.id} result={item} sourceFilter={props.sourceFilter} />
            ))}
        </details>
      </LessonDetails>
    </section>
  );
}

export function ReadingResults({
  result,
  sourceFilter = "all"
}: {
  result: ReadingResult;
  sourceFilter?: ReadingSourceFilter | undefined;
}) {
  const { t } = useI18n();
  const purpose = readingPurpose(result);
  const summary = summarizeReadingResults([result], sourceFilter, purpose);
  const { totals } = summary;
  return (
    <div className="reading-results">
      <h4>{t("Результат чтения")}</h4>
      <p>{t(READING_PURPOSE_LABELS[purpose])}</p>
      {(purpose === "check" || purpose === "delayed-check") && (
        <p className="reading-muted">
          {t(
            result.provenance === "native" && result.newMaterial === true
              ? "Новый порядок в пределах последних 256 показанных серий."
              : "Новизна этой серии не подтверждена."
          )}
        </p>
      )}
      {totals.observationCount > 0 && (
        <p>
          {t("Верно с первой попытки: {number}/{total}", {
            number: totals.firstAttemptCorrectCount,
            total: totals.observationCount
          })}{" "}
          ·{" "}
          {t("Самостоятельно с первой попытки: {percent}%", {
            percent: Math.round((totals.independentRate ?? 0) * 100)
          })}{" "}
          ·{" "}
          {t("Решено без подсказок: {number}/{total}", {
            number: totals.unassistedSolvedCount,
            total: totals.observationCount
          })}
        </p>
      )}
      {totals.observationCount === 0 && (
        <p>{t("Для выбранного способа ввода пока нет ответов.")}</p>
      )}
      <ReadingMetricsTable rows={summary.rows} />
    </div>
  );
}
