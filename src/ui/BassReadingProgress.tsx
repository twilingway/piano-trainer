import { useI18n } from "../app/useI18n";
import { summarizeBassReadingResults } from "../reading/bassProgress";
import type { BassReadingResult, BassReadingTask } from "../reading/bassTypes";
import type { ReadingNoteSummary, ReadingSourceFilter } from "../reading/progressTypes";

export const BASS_READING_TASK_LABELS: Readonly<Record<BassReadingTask, string>> = {
  notes: "Левая рука: отдельные ноты",
  phrases: "Левая рука: короткие фразы"
};
const SOURCE_LABELS: Readonly<Record<ReadingSourceFilter, string>> = {
  all: "Все способы ввода",
  midi: "MIDI-пианино",
  keyboard: "Ввод компьютерной клавиатурой",
  pointer: "Экранные клавиши"
};
const NAMES: Readonly<Record<number, string>> = {
  48: "до",
  50: "ре",
  52: "ми",
  53: "фа",
  55: "соль"
};
export function bassReadingNoteName(pitch: number, t: (key: string) => string): string {
  return `${t(NAMES[pitch] ?? "Нота курса")} 3`;
}

function MetricTime({ value }: { value: number | null }) {
  const { t } = useI18n();
  return value === null ? (
    <span aria-label={t("Пока нет данных о времени ответа")}>—</span>
  ) : (
    <>{(value / 1000).toFixed(1)}</>
  );
}

function BassMetricsTable({ rows }: { rows: readonly ReadingNoteSummary[] }) {
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
              <td>{bassReadingNoteName(row.expectedMidi, t)}</td>
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

function PhraseTiming({ task }: { task: BassReadingTask }) {
  const { t } = useI18n();
  return task === "phrases" ? (
    <p className="reading-muted">
      {t(
        "Время фразы — задержка последовательного ответа на заранее видимые ноты, а не распознавания одиночной ноты."
      )}
    </p>
  ) : null;
}

export interface BassReadingProgressProps {
  history: readonly BassReadingResult[];
  sourceFilter?: ReadingSourceFilter | undefined;
  onSourceFilter?: ((source: ReadingSourceFilter) => void) | undefined;
}

export function BassReadingProgress({
  history,
  sourceFilter = "all",
  onSourceFilter
}: BassReadingProgressProps) {
  const { t } = useI18n();
  return (
    <section className="reading-progress">
      <details>
        <summary>{t("Мой прогресс басового чтения")}</summary>
        <p className="reading-muted">
          {t(
            "Сводка басового чтения: последние 20 серий каждого задания. Ноты и фразы учитываются отдельно."
          )}
        </p>
        {onSourceFilter && (
          <label>
            {t("Способ ввода для сводки басового чтения")}
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
        {(["notes", "phrases"] as const).map((task) => {
          const summary = summarizeBassReadingResults(history, sourceFilter, task);
          return (
            <section className="reading-progress-group" key={task}>
              <h4>{t(BASS_READING_TASK_LABELS[task])}</h4>
              <PhraseTiming task={task} />
              <p>{t("Наблюдений: {number}", { number: summary.totals.observationCount })}</p>
              <BassMetricsTable rows={summary.rows} />
            </section>
          );
        })}
      </details>
    </section>
  );
}

export function BassReadingResults({
  result,
  sourceFilter = "all"
}: {
  result: BassReadingResult;
  sourceFilter?: ReadingSourceFilter | undefined;
}) {
  const { t } = useI18n();
  const summary = summarizeBassReadingResults([result], sourceFilter, result.task);
  const { totals } = summary;
  return (
    <div className="reading-results">
      <h4>{t("Результат басового чтения")}</h4>
      <p>{t(BASS_READING_TASK_LABELS[result.task])}</p>
      <PhraseTiming task={result.task} />
      {totals.observationCount > 0 ? (
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
      ) : (
        <p>{t("Для выбранного способа ввода пока нет ответов.")}</p>
      )}
      <BassMetricsTable rows={summary.rows} />
    </div>
  );
}
