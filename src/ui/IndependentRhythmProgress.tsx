import { useI18n } from "../app/useI18n";
import { summarizeIndependentRhythmResults } from "../independentRhythm/progress";
import type {
  IndependentRhythmHandSummary,
  IndependentRhythmResult,
  IndependentRhythmSummary
} from "../independentRhythm/types";
import type { ReadingSourceFilter } from "../reading/progressTypes";

export const INDEPENDENT_RHYTHM_SOURCES: Readonly<Record<ReadingSourceFilter, string>> = {
  all: "Все способы ввода",
  keyboard: "Ввод компьютерной клавиатурой",
  pointer: "Экранные клавиши",
  midi: "MIDI-пианино"
};
export interface IndependentRhythmProgressProps {
  history: readonly IndependentRhythmResult[];
  sourceFilter: ReadingSourceFilter;
  onSourceFilter: (value: ReadingSourceFilter) => void;
}
function Time({ value }: { value: number | null }) {
  const { t } = useI18n();
  return value === null ? (
    <span aria-label={t("Нет данных о двух ритмах")}>—</span>
  ) : (
    <>{Math.round(value)}</>
  );
}
function HandMetrics({ title, summary }: { title: string; summary: IndependentRhythmHandSummary }) {
  const { t } = useI18n();
  const counts = [
    ["Ожидаемые удары", summary.expected],
    ["Попадания ритма", summary.hits],
    ["Пропуски ритма", summary.misses],
    ["Лишние удары", summary.extras],
    ["Попадания вовремя", summary.onTime],
    ["Ранние попадания", summary.early],
    ["Поздние попадания", summary.late]
  ] as const;
  return (
    <section aria-label={t(title)}>
      <h4>{t(title)}</h4>
      <dl className="rhythm-metrics">
        {counts.map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>{t("Медиана отклонения, мс")}</dt>
          <dd>
            <Time value={summary.signedDeviationMs} />
          </dd>
        </div>
        <div>
          <dt>{t("Медиана абсолютного отклонения, мс")}</dt>
          <dd>
            <Time value={summary.absoluteDeviationMs} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
export function IndependentRhythmMetrics({ summary }: { summary: IndependentRhythmSummary }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("Раздельный результат партий")}>
      <HandMetrics title="Левая партия C3" summary={summary.left} />
      <HandMetrics title="Правая партия C4" summary={summary.right} />
      <dl className="two-hand-metrics">
        <dt>{t("Всего лишних атак двух ритмов")}</dt>
        <dd>{summary.extras}</dd>
        <dt>{t("Лишние атаки неизвестной партии")}</dt>
        <dd>{summary.unknownExtras}</dd>
        <dt>{t("Медиана разрыва совместных атак двух ритмов, мс")}</dt>
        <dd>
          <Time value={summary.spreadMs} />
        </dd>
      </dl>
    </section>
  );
}
export function IndependentRhythmResults({ result }: { result: IndependentRhythmResult }) {
  const { t } = useI18n();
  return (
    <section className="reading-results" aria-label={t("Результат двух ритмов")}>
      <h3>{t("Результат двух ритмов")}</h3>
      <p>
        {t(INDEPENDENT_RHYTHM_SOURCES[result.inputSource])} · {t("Пульс пройден в этом проходе")}
      </p>
      <p className="reading-muted">
        {t(
          result.pulse.help.length > 0 || result.series.help.length > 0
            ? "Подсветка клавиш показана при подготовке"
            : "Подсветка клавиш при подготовке не показана"
        )}
      </p>
      <IndependentRhythmMetrics summary={result.series.summary} />
    </section>
  );
}
export function IndependentRhythmProgress(props: IndependentRhythmProgressProps) {
  const { t } = useI18n();
  const summary = summarizeIndependentRhythmResults(props.history, props.sourceFilter);
  const selected = props.history.filter(
    (result) => props.sourceFilter === "all" || result.inputSource === props.sourceFilter
  );
  return (
    <>
      <label>
        {t("Способ ввода для сводки двух ритмов")}{" "}
        <select
          value={props.sourceFilter}
          onChange={(event) => {
            props.onSourceFilter(event.target.value as ReadingSourceFilter);
          }}
        >
          {(Object.keys(INDEPENDENT_RHYTHM_SOURCES) as ReadingSourceFilter[]).map((source) => (
            <option key={source} value={source}>
              {t(INDEPENDENT_RHYTHM_SOURCES[source])}
            </option>
          ))}
        </select>
      </label>
      <p className="reading-muted">
        {t(
          "Хранятся последние 20 завершённых серий двух ритмов. Фильтр выбирает весь проход по способу ввода, сохраняя его ошибки и помощь."
        )}
      </p>
      <details>
        <summary>{t("Мой прогресс двух ритмов")}</summary>
        <p>{t("Завершённых серий двух ритмов: {number}", { number: summary.resultCount })}</p>
        <IndependentRhythmMetrics summary={summary} />
      </details>
      <details>
        <summary>{t("История двух ритмов: {number}", { number: selected.length })}</summary>
        {selected
          .toSorted((a, b) => b.completedAt - a.completedAt)
          .map((result) => (
            <IndependentRhythmResults key={result.id} result={result} />
          ))}
      </details>
    </>
  );
}
