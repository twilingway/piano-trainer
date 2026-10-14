import { useI18n } from "../app/useI18n";
import { summarizeHeldBassResults } from "../reading/heldBassProgress";
import type { HeldBassResult, HeldBassStatus } from "../reading/heldBassTypes";
import type { ReadingSourceFilter } from "../reading/progressTypes";
import { twoHandNoteName } from "./TwoHandProgress";

export const HELD_BASS_TITLE = "Держу бас, играю мелодию";
export const HELD_BASS_STATUS: Readonly<Record<HeldBassStatus, string>> = {
  unpresented: "Нажмите «Играть» и дождитесь фрагмента на двух станах.",
  ready: "Нажмите бас и первую ноту вместе: не больше 200 мс между атаками.",
  "waiting-second": "Нажмите вторую ноту начала, продолжая держать первую.",
  travelling: "Держите бас. Дождитесь следующей ноты под курсором.",
  hold: "Держите бас до конца фрагмента. Пока не отпускайте.",
  release: "Отпустите все клавиши. Проверяем удержание баса.",
  retry: "Начните фрагмент заново, продолжая удерживать бас после начальной пары.",
  overflow: "Не удалось проверить удержание. Отпустите всё и начните фрагмент заново.",
  "wrong-note": "Неверная нота фрагмента. Отпустите всё и начните его заново.",
  "too-slow": "Начальные атаки слишком далеко друг от друга. Отпустите всё и повторите фрагмент.",
  "early-release":
    "Бас или первая клавиша начала отпущены слишком рано. Отпустите всё и повторите фрагмент.",
  "early-melody": "Сначала дождитесь следующей ноты. Отпустите всё и повторите фрагмент.",
  "third-note": "Лишняя атака во фрагменте. Отпустите всё и начните его заново.",
  "mixed-origin": "Для фрагмента используйте один способ ввода. Отпустите всё и повторите.",
  "too-many-melody": "Отпустите предыдущую ноту мелодии. Сейчас отпустите всё и повторите фрагмент."
};
const SOURCES: Readonly<Record<ReadingSourceFilter, string>> = {
  all: "Все способы ввода",
  midi: "MIDI-пианино",
  keyboard: "Ввод компьютерной клавиатурой",
  pointer: "Экранные клавиши"
};
export interface HeldBassProgressProps {
  history: readonly HeldBassResult[];
  sourceFilter: ReadingSourceFilter;
  onSourceFilter: (value: ReadingSourceFilter) => void;
}
function Time({ value }: { value: number | null }) {
  const { t } = useI18n();
  return value === null ? (
    <span aria-label={t("Нет данных об удержании баса")}>—</span>
  ) : (
    <>{Math.round(value)}</>
  );
}
function Metrics({
  history,
  sourceFilter
}: Pick<HeldBassProgressProps, "history" | "sourceFilter">) {
  const { t } = useI18n();
  const summary = summarizeHeldBassResults(history, sourceFilter);
  return (
    <dl className="two-hand-metrics">
      <dt>{t("Решено фрагментов с басом")}</dt>
      <dd>{summary.fragmentCount}</dd>
      <dt>{t("Ошибки фрагментов с басом")}</dt>
      <dd>{summary.errorCount}</dd>
      <dt>{t("Самостоятельные первые фрагменты с басом")}</dt>
      <dd>{summary.independentCount}</dd>
      <dt>{t("Фрагменты с помощью")}</dt>
      <dd>{summary.helpedCount}</dd>
      <dt>{t("Фрагменты, решённые без помощи")}</dt>
      <dd>{summary.unassistedCount}</dd>
      <dt>{t("Медиана разрыва начальных атак, мс")}</dt>
      <dd>
        <Time value={summary.spreadMs} />
      </dd>
      <dt>{t("Медиана первой атаки фрагмента, мс")}</dt>
      <dd>
        <Time value={summary.firstLatencyMs} />
      </dd>
      <dt>{t("Медиана решения фрагмента, мс")}</dt>
      <dd>
        <Time value={summary.responseLatencyMs} />
      </dd>
      <dt>{t("Медиана самостоятельной атаки фрагмента, мс")}</dt>
      <dd>
        <Time value={summary.independentLatencyMs} />
      </dd>
      <dt>{t("Медиана удержания баса, мс")}</dt>
      <dd>
        <Time value={summary.heldDurationMs} />
      </dd>
    </dl>
  );
}
export function HeldBassResults({
  result,
  sourceFilter
}: {
  result: HeldBassResult;
  sourceFilter: ReadingSourceFilter;
}) {
  const { t } = useI18n();
  return (
    <section className="reading-results">
      <h3>{t("Результат удержания баса")}</h3>
      <Metrics history={[result]} sourceFilter={sourceFilter} />
      {result.fragments
        .filter(
          (item) => sourceFilter === "all" || item.attempts.at(-1)?.inputSource === sourceFilter
        )
        .map((item) => (
          <details key={item.fragmentId}>
            <summary>
              {twoHandNoteName(item.bassPitch, t)} ·{" "}
              {item.melodyPitches.map((pitch) => twoHandNoteName(pitch, t)).join(" → ")} ·{" "}
              {t("Попыток фрагмента: {number}", { number: item.attempts.length })}
            </summary>
            <p>{t("Уровень помощи фрагмента: {number}", { number: item.hintLevel })}</p>
            <ol>
              {item.attempts.map((attempt) => (
                <li key={attempt.attemptId}>
                  {t(SOURCES[attempt.inputSource])} ·{" "}
                  {attempt.outcome === "success"
                    ? t("Фрагмент с удержанием засчитан")
                    : t(HELD_BASS_STATUS[attempt.outcome])}
                  {" · "}
                  {t("Атаки попытки: {notes}", {
                    notes: attempt.events
                      .filter((event) => event.kind === "down")
                      .map((event) => twoHandNoteName(event.pitch, t))
                      .join(", ")
                  })}
                </li>
              ))}
            </ol>
            {item.hintHistory.map((hint, index) => (
              <p key={`${hint.presentationId}:${String(index)}`}>
                {t("Помощь на ноте {number}: уровень {level}", {
                  number: hint.step + 1,
                  level: hint.level
                })}
              </p>
            ))}
          </details>
        ))}
    </section>
  );
}
export function HeldBassProgress(props: HeldBassProgressProps) {
  const { t } = useI18n();
  return (
    <>
      <label>
        {t("Способ ввода для сводки удержания баса")}{" "}
        <select
          value={props.sourceFilter}
          onChange={(event) => {
            props.onSourceFilter(event.target.value as ReadingSourceFilter);
          }}
        >
          {(Object.keys(SOURCES) as ReadingSourceFilter[]).map((source) => (
            <option key={source} value={source}>
              {t(SOURCES[source])}
            </option>
          ))}
        </select>
      </label>
      <p className="reading-muted">
        {t(
          "Последние двадцать серий удержания. Фильтр выбирает фрагменты по успешной попытке; прежние ошибки и помощь сохраняются."
        )}
      </p>
      <details>
        <summary>{t("Мой прогресс удержания баса")}</summary>
        <Metrics {...props} />
      </details>
      <details>
        <summary>{t("История удержания баса: {number}", { number: props.history.length })}</summary>
        {props.history
          .slice()
          .reverse()
          .map((result) => (
            <HeldBassResults key={result.id} result={result} sourceFilter={props.sourceFilter} />
          ))}
      </details>
    </>
  );
}
