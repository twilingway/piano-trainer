import { useI18n } from "../app/useI18n";
import { summarizeIntervals } from "../intervals/progress";
import type { IntervalMode, IntervalResult, IntervalSourceFilter } from "../intervals/types";
import { INTERVAL_CATEGORY_LABELS, INTERVAL_MODE_LABELS } from "./IntervalCourse";

function Time({ value }: { value: number | null }) {
  const { t } = useI18n();
  return value === null ? (
    <span aria-label={t("Пока нет данных о времени ответа")}>—</span>
  ) : (
    <>{(value / 1000).toFixed(1)}</>
  );
}

export function IntervalResults({
  results,
  mode,
  source
}: {
  results: readonly IntervalResult[];
  mode: IntervalMode;
  source: IntervalSourceFilter;
}) {
  const { t } = useI18n();
  const summary = summarizeIntervals(results, mode, source);
  return (
    <div className="reading-results">
      <h4>{t(INTERVAL_MODE_LABELS[mode])}</h4>
      <p className="reading-muted">
        {t(
          mode === "see-and-play"
            ? "Это игра пары по нотам; узнавание названия интервала здесь не проверяется."
            : "Это выбор категории на слух; игра на пианино здесь не оценивается."
        )}
      </p>
      <p>
        {t(
          "Пар: {total}; верно с первой попытки: {first}; самостоятельно: {independent}; решено без помощи: {solved}.",
          {
            total: summary.questionCount,
            first: summary.firstAttemptCorrectCount,
            independent: summary.independentCorrectCount,
            solved: summary.unassistedSolvedCount
          }
        )}
      </p>
      {mode === "hear-and-choose" && (
        <p>
          {t(
            "Верно с первого прослушивания: {number}; полных прослушиваний: {full}; прерванных: {partial}.",
            {
              number: summary.firstListeningCorrectCount ?? 0,
              full: summary.fullListeningCount,
              partial: summary.partialListeningCount
            }
          )}
        </p>
      )}
      <div className="reading-results-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Категория интервала")}</th>
              <th>{t("Пар интервалов")}</th>
              <th>{t("Ошибки интервалов")}</th>
              <th>{t("Пары с помощью")}</th>
              <th>{t("Самостоятельные пары")}</th>
              <th>{t("Медиана первой реакции, с")}</th>
              <th>{t("Медиана решения, с")}</th>
              <th>{t("Медиана самостоятельной реакции, с")}</th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((row) => (
              <tr key={row.category}>
                <td>{t(INTERVAL_CATEGORY_LABELS[row.category])}</td>
                <td>{row.questionCount}</td>
                <td>{row.errorCount}</td>
                <td>{row.helpedCount}</td>
                <td>{row.independentCorrectCount}</td>
                <td>
                  <Time value={row.medianFirstReactionMs} />
                </td>
                <td>
                  <Time value={row.medianSolutionMs} />
                </td>
                <td>
                  <Time value={row.medianIndependentReactionMs} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IntervalProgress({
  history,
  mode,
  source,
  onSource,
  result
}: {
  history: readonly IntervalResult[];
  mode: IntervalMode;
  source: IntervalSourceFilter;
  onSource: (source: IntervalSourceFilter) => void;
  result: IntervalResult | null;
}) {
  const { t } = useI18n();
  const sources: readonly IntervalSourceFilter[] =
    mode === "see-and-play"
      ? ["all", "midi", "keyboard", "pointer"]
      : ["all", "keyboard", "pointer"];
  const sourceLabel = (value: IntervalSourceFilter) =>
    t(
      value === "all"
        ? "Все способы ввода"
        : value === "midi"
          ? "MIDI-пианино"
          : value === "keyboard"
            ? "Ввод компьютерной клавиатурой"
            : mode === "see-and-play"
              ? "Экранные клавиши"
              : "Кнопки выбора интервала"
    );
  return (
    <section className="reading-progress">
      <label>
        {t("Способ ввода для сводки интервалов")}
        <select
          value={source}
          onChange={(event) => {
            onSource(event.target.value as IntervalSourceFilter);
          }}
        >
          {sources.map((value) => (
            <option value={value} key={value}>
              {sourceLabel(value)}
            </option>
          ))}
          {mode === "hear-and-choose" && source === "midi" && (
            <option value="midi">{sourceLabel("midi")}</option>
          )}
        </select>
      </label>
      <p className="reading-muted">
        {t(
          "Фильтр выбирает пары по последнему верному ответу. Все ошибки и помощь внутри пары сохраняются."
        )}
      </p>
      {result && <IntervalResults results={[result]} mode={mode} source={source} />}
      <details>
        <summary>{t("Мой прогресс интервалов")}</summary>
        <p>
          {t(
            "История хранит последние 20 завершённых серий каждого режима. Новый seed может повторить знакомую пару."
          )}
        </p>
        {(["see-and-play", "hear-and-choose"] as const).map((value) => (
          <IntervalResults key={value} results={history} mode={value} source={source} />
        ))}
      </details>
      <details>
        <summary>
          {t("История интервалов: {number}", {
            number: history.filter((item) => item.mode === mode).length
          })}
        </summary>
        {history
          .filter((item) => item.mode === mode)
          .slice()
          .reverse()
          .map((item) => (
            <div key={item.runId}>
              <p>{new Date(item.completedAt).toLocaleString()}</p>
              <IntervalResults results={[item]} mode={mode} source={source} />
            </div>
          ))}
      </details>
    </section>
  );
}
