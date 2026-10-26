import { useMemo } from "react";
import { useI18n } from "../app/useI18n";
import { summarizeReadingProfile, summarizeReadingResults } from "../reading/progress";
import type {
  ReadingNoteSummary,
  ReadingProfile,
  ReadingPurpose,
  ReadingSourceFilter
} from "../reading/progressTypes";
import type { ReadingResult } from "../reading/types";

export interface ReadingProgressProps {
  profile?: ReadingProfile;
  sourceFilter?: ReadingSourceFilter;
  onSourceFilter?: (source: ReadingSourceFilter) => void;
  onAdaptive?: () => void;
  onDelayedCheck?: () => void;
  delayedDue?: boolean;
  generationError?: boolean;
  onGenerationRetry?: () => void;
}

export const READING_PURPOSE_LABELS: Readonly<Record<ReadingPurpose, string>> = {
  notes: "Читаю отдельные ноты",
  phrases: "Читаю короткие фразы",
  check: "Проверяю чтение без подсказок",
  adaptive: "Повторяю трудные ноты",
  "delayed-check": "Проверяю чтение спустя время"
};
const SOURCE_LABELS: Readonly<Record<ReadingSourceFilter, string>> = {
  all: "Все способы ввода",
  midi: "MIDI-пианино",
  keyboard: "Ввод компьютерной клавиатурой",
  pointer: "Экранные клавиши"
};
const NAMES: Readonly<Record<number, string>> = {
  60: "до",
  62: "ре",
  64: "ми",
  65: "фа",
  67: "соль"
};
export function readingNoteName(pitch: number, t: (key: string) => string): string {
  return `${t(NAMES[pitch] ?? "Нота курса")} 4`;
}

function MetricTime({ value }: { value: number | null }) {
  const { t } = useI18n();
  return value === null ? (
    <span aria-label={t("Пока нет данных о времени ответа")}>—</span>
  ) : (
    <>{(value / 1000).toFixed(1)}</>
  );
}

export function ReadingMetricsTable({ rows }: { rows: readonly ReadingNoteSummary[] }) {
  const { t } = useI18n();
  return (
    <div className="reading-results-scroll">
      <table>
        <thead>
          <tr>
            <th>{t("Нота курса")}</th>
            <th>{t("Наблюдений чтения")}</th>
            <th>{t("Ошибки чтения")}</th>
            <th>{t("Самостоятельно с первой попытки, %")}</th>
            <th>{t("Медиана первой атаки, с")}</th>
            <th>{t("Медиана решения, с")}</th>
            <th>{t("Медиана самостоятельного ответа, с")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.expectedMidi}>
              <td>{readingNoteName(row.expectedMidi, t)}</td>
              <td>{row.observationCount}</td>
              <td>{row.errorCount}</td>
              <td>
                {row.independentRate === null ? (
                  <span aria-label={t("Пока нет ответов для этой ноты")}>—</span>
                ) : (
                  Math.round(row.independentRate * 100)
                )}
              </td>
              <td>
                <MetricTime value={row.firstLatencyMs} />
              </td>
              <td>
                <MetricTime value={row.responseLatencyMs} />
              </td>
              <td>
                <MetricTime value={row.independentLatencyMs} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReadingProgress({
  history,
  profile,
  sourceFilter = "all",
  onSourceFilter,
  onAdaptive,
  onDelayedCheck,
  delayedDue = false,
  generationError = false,
  onGenerationRetry
}: ReadingProgressProps & { history: readonly ReadingResult[] }) {
  const { t } = useI18n();
  const summary = useMemo(
    () =>
      profile
        ? summarizeReadingProfile(profile, sourceFilter)
        : summarizeReadingResults(history, sourceFilter),
    [profile, sourceFilter, history]
  );
  return (
    <section className="reading-progress">
      <div className="reading-actions">
        {onAdaptive && (
          <button type="button" className="game-button" onClick={onAdaptive}>
            {t("Повторить трудные ноты")}
          </button>
        )}
        {delayedDue && onDelayedCheck && (
          <button type="button" className="game-button" onClick={onDelayedCheck}>
            {t("Проверить чтение спустя время")}
          </button>
        )}
      </div>
      {delayedDue && <p>{t("Пора проверить, как вы читаете ноты после перерыва.")}</p>}
      {generationError && (
        <p role="alert">
          {t("Не удалось подобрать новый порядок нот для проверки.")}{" "}
          {onGenerationRetry && (
            <button type="button" onClick={onGenerationRetry}>
              {t("Повторить поиск серии")}
            </button>
          )}
        </p>
      )}
      <details data-window-detail="five-note-reading:progress">
        <summary>{t("Мой прогресс чтения")}</summary>
        <p className="reading-muted">
          {t(
            "Сводка показывает последние ответы по каждой ноте отдельно для каждого задания и способа ввода."
          )}
        </p>
        {onSourceFilter && (
          <label>
            {t("Способ ввода для сводки и следующей тренировки")}
            <select
              value={sourceFilter}
              onChange={(event) => {
                onSourceFilter(event.target.value as ReadingSourceFilter);
              }}
            >
              {(Object.keys(SOURCE_LABELS) as ReadingSourceFilter[]).map((source) => (
                <option key={source} value={source}>
                  {t(SOURCE_LABELS[source])}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="reading-muted">
          {t(
            "Способ ввода определяется последним верным ответом. Все предыдущие ошибки и подсказки учитываются."
          )}
        </p>
        <p className="reading-muted">
          {t(
            "Проверка отличается от последних 256 показанных серий. Более ранние серии могут повториться."
          )}
        </p>
        <p className="reading-muted">
          {t(
            "Тренировка подстраивается по ответам. Пороги скорости и сроки повторения пока пробные, это не оценка освоения."
          )}
        </p>
        {summary.byPurpose.map((group) => (
          <section className="reading-progress-group" key={group.purpose}>
            <h4>{t(READING_PURPOSE_LABELS[group.purpose])}</h4>
            <p>{t("Наблюдений: {number}", { number: group.totals.observationCount })}</p>
            <ReadingMetricsTable rows={group.rows} />
          </section>
        ))}
      </details>
    </section>
  );
}
