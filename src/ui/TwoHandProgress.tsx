import { useI18n } from "../app/useI18n";
import { summarizeTwoHandResults } from "../reading/twoHandProgress";
import type { TwoHandResult, TwoHandStatus } from "../reading/twoHandTypes";
import type { ReadingSourceFilter } from "../reading/progressTypes";

export const TWO_HAND_TITLE = "Две руки: играю вместе";
export const TWO_HAND_STATUS: Readonly<Record<TwoHandStatus, string>> = {
  unpresented: "Нажмите «Играть» и дождитесь пары на двух станах.",
  ready: "Сыграйте обе ноты вместе. Разница атак — не больше 200 мс.",
  "waiting-second": "Нажмите вторую ноту, продолжая держать первую.",
  release: "Отпустите все клавиши. Пара ещё проверяется.",
  "wrong-note": "Неверная нота. Отпустите все клавиши и повторите пару.",
  "too-slow": "Вторая атака опоздала. Отпустите все клавиши и сыграйте вместе.",
  "early-release": "Первая клавиша отпущена слишком рано. Отпустите всё и повторите пару.",
  "third-note": "Нажата лишняя нота. Отпустите все клавиши и повторите пару.",
  "mixed-origin": "Используйте один способ ввода для пары. Отпустите всё и повторите.",
  overflow: "Не удалось проверить ввод. Отпустите все клавиши и повторите пару."
};
const SOURCE_LABELS: Readonly<Record<ReadingSourceFilter, string>> = {
  all: "Все способы ввода",
  midi: "MIDI-пианино",
  keyboard: "Ввод компьютерной клавиатурой",
  pointer: "Экранные клавиши"
};
const NAMES: readonly string[] = [
  "до",
  "до♯",
  "ре",
  "ре♯",
  "ми",
  "фа",
  "фа♯",
  "соль",
  "соль♯",
  "ля",
  "ля♯",
  "си"
];
export function twoHandNoteName(pitch: number, t: (key: string) => string) {
  return `${t(NAMES[pitch % 12] ?? "Нота курса")} ${String(Math.floor(pitch / 12) - 1)}`;
}
export interface TwoHandProgressProps {
  history: readonly TwoHandResult[];
  sourceFilter: ReadingSourceFilter;
  onSourceFilter: (value: ReadingSourceFilter) => void;
}
function Time({ value }: { value: number | null }) {
  const { t } = useI18n();
  return value === null ? (
    <span aria-label={t("Нет данных о совместной атаке")}>—</span>
  ) : (
    <>{Math.round(value)}</>
  );
}
export function TwoHandMetrics({
  history,
  sourceFilter
}: Pick<TwoHandProgressProps, "history" | "sourceFilter">) {
  const { t } = useI18n();
  const data = summarizeTwoHandResults(history, sourceFilter);
  return (
    <dl className="two-hand-metrics">
      <dt>{t("Решено пар")}</dt>
      <dd>{data.pairCount}</dd>
      <dt>{t("Ошибки совместной атаки")}</dt>
      <dd>{data.errorCount}</dd>
      <dt>{t("Самостоятельные первые пары")}</dt>
      <dd>{data.independentCount}</dd>
      <dt>{t("Пары с помощью")}</dt>
      <dd>{data.helpedCount}</dd>
      <dt>{t("Пары, решённые без помощи")}</dt>
      <dd>{data.unassistedCount}</dd>
      <dt>{t("Медиана разрыва атак, мс")}</dt>
      <dd>
        <Time value={data.spreadMs} />
      </dd>
      <dt>{t("Медиана первой атаки пары, мс")}</dt>
      <dd>
        <Time value={data.firstLatencyMs} />
      </dd>
      <dt>{t("Медиана решения пары, мс")}</dt>
      <dd>
        <Time value={data.responseLatencyMs} />
      </dd>
      <dt>{t("Медиана самостоятельной первой атаки, мс")}</dt>
      <dd>
        <Time value={data.independentLatencyMs} />
      </dd>
    </dl>
  );
}
export function TwoHandResults({
  result,
  sourceFilter
}: {
  result: TwoHandResult;
  sourceFilter: ReadingSourceFilter;
}) {
  const { t } = useI18n();
  const pairs = result.pairs.filter(
    (pair) => sourceFilter === "all" || pair.attempts.at(-1)?.inputSource === sourceFilter
  );
  return (
    <section className="reading-results">
      <h3>{t("Результат совместной игры")}</h3>
      <TwoHandMetrics history={[result]} sourceFilter={sourceFilter} />
      {pairs.map((pair) => (
        <details key={pair.pairId}>
          <summary>
            {pair.expectedMidi.map((pitch) => twoHandNoteName(pitch, t)).join(" + ")} ·{" "}
            {t("Попыток пары: {number}", { number: pair.attempts.length })}
          </summary>
          <p>{t("Разрыв успешных атак: {number} мс", { number: Math.round(pair.spreadMs) })}</p>
          <p>{t("Уровень помощи пары: {number}", { number: pair.hintLevel })}</p>
          <ol>
            {pair.attempts.map((attempt) => (
              <li key={attempt.attemptId}>
                {t(SOURCE_LABELS[attempt.inputSource])} ·{" "}
                {attempt.outcome === "success"
                  ? t("Совместная атака засчитана")
                  : t(TWO_HAND_STATUS[attempt.outcome])}
                <span>
                  {" "}
                  ·{" "}
                  {t("Атаки попытки: {notes}", {
                    notes: attempt.events
                      .filter((event) => event.kind === "down")
                      .map((event) => twoHandNoteName(event.pitch, t))
                      .join(", ")
                  })}
                </span>
              </li>
            ))}
          </ol>
          {pair.hintHistory.length > 0 && (
            <ul>
              {pair.hintHistory.map((hint, index) => (
                <li key={index}>{t("Показана помощь уровня {level}", { level: hint.level })}</li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </section>
  );
}
export function TwoHandProgress(props: TwoHandProgressProps) {
  const { t } = useI18n();
  return (
    <>
      <label>
        {t("Способ ввода для сводки двух рук")}{" "}
        <select
          value={props.sourceFilter}
          onChange={(event) => {
            props.onSourceFilter(event.target.value as ReadingSourceFilter);
          }}
        >
          {(Object.keys(SOURCE_LABELS) as ReadingSourceFilter[]).map((source) => (
            <option key={source} value={source}>
              {t(SOURCE_LABELS[source])}
            </option>
          ))}
        </select>
      </label>
      <p className="reading-muted">
        {t(
          "Сводка последних двадцати серий. Фильтр выбирает пары по успешной попытке; прежние ошибки и помощь сохраняются."
        )}
      </p>
      <details>
        <summary>{t("Мой прогресс двух рук")}</summary>
        <TwoHandMetrics {...props} />
      </details>
      <details className="reading-history">
        <summary>
          {t("История совместной игры: {number}", { number: props.history.length })}
        </summary>
        {props.history
          .toSorted((a, b) => b.completedAt - a.completedAt)
          .map((result) => (
            <TwoHandResults key={result.id} result={result} sourceFilter={props.sourceFilter} />
          ))}
      </details>
    </>
  );
}
