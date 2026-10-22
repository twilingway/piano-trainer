import { useI18n } from "../app/useI18n";
import type {
  IndependentRhythmPhase,
  IndependentRhythmResult,
  IndependentRhythmSummary
} from "../independentRhythm/types";
import type { ReadingInputSource } from "../reading/types";
import type { BassReadingKeyBinding } from "./BassReadingIntro";
import { INDEPENDENT_RHYTHM_TITLE, IndependentRhythmBindings } from "./IndependentRhythmIntro";
import {
  INDEPENDENT_RHYTHM_SOURCES,
  IndependentRhythmProgress,
  IndependentRhythmResults,
  type IndependentRhythmProgressProps
} from "./IndependentRhythmProgress";

export function IndependentRhythmCourseCard(
  props: IndependentRhythmProgressProps & { onStart: () => void; onIntro: () => void }
) {
  const { t } = useI18n();
  return (
    <section className="reading-course-card">
      <h3>{t(INDEPENDENT_RHYTHM_TITLE)}</h3>
      <p>
        {t(
          "Проверка пульса и четыре такта с разными ритмами слева и справа. Только C3 и C4, 60 BPM."
        )}
      </p>
      <div className="reading-actions">
        <button type="button" className="game-button" onClick={props.onIntro}>
          {t("Знакомство с двумя ритмами")}
        </button>
        <button type="button" className="game-button" onClick={props.onStart}>
          {t("Открыть проверку пульса")}
        </button>
      </div>
      <IndependentRhythmProgress {...props} />
    </section>
  );
}
export type IndependentRhythmPanelStatus =
  | "preparation"
  | "count-in"
  | "playing"
  | "finalizing"
  | "failed"
  | "passed"
  | "completed"
  | "empty"
  | "cancelled"
  | "error";
export interface IndependentRhythmPracticeProps extends IndependentRhythmProgressProps {
  phase: IndependentRhythmPhase;
  status: IndependentRhythmPanelStatus;
  ready: boolean;
  allReleased: boolean;
  source: ReadingInputSource;
  midiAvailable: boolean;
  midiChannel: number | null;
  showKeyHints: boolean;
  countInBeat?: number | undefined;
  error?: "audio" | "staff" | "midi" | null | undefined;
  result: IndependentRhythmResult | null;
  pulseSummary: IndependentRhythmSummary | null;
  bindings: readonly BassReadingKeyBinding[];
  onSource: (value: ReadingInputSource) => void;
  onShowKeyHints: (value: boolean) => void;
  onStart: () => void;
  onRepeat: () => void;
  onNewSeries: () => void;
  onExit: () => void;
  onGoToRhythm: () => void;
  onRetryStaff: () => void;
}
const STATUS: Readonly<
  Record<
    Exclude<IndependentRhythmPanelStatus, "preparation" | "count-in" | "playing" | "finalizing">,
    string
  >
> = {
  failed:
    "Пульс пока не пройден: нужны 8 попаданий и 0 лишних атак. Повторите или потренируйтесь в «Ритме».",
  passed: "Пульс проверен. Отпустите все клавиши и вручную начните два ритма.",
  completed: "Два ритма завершены. Сравните показатели левой и правой партий.",
  empty: "Проход не засчитан: не было ни одного удара. Повтор начинается с проверки пульса.",
  cancelled: "Проход двух ритмов отменён без результата. Повтор начинается с проверки пульса.",
  error: "Два ритма не готовы. Проверьте звук, ноты и выбранный ввод, затем повторите."
};
function phaseStatus(status: IndependentRhythmPanelStatus, phase: IndependentRhythmPhase) {
  const pulse = phase === "pulse";
  if (status === "preparation")
    return pulse
      ? "Выберите способ ввода, отпустите все клавиши и начните проверку пульса."
      : STATUS.passed;
  if (status === "count-in")
    return pulse
      ? "Слушайте четыре доли отсчёта. Затем играйте C4 по пульсу."
      : "Слушайте четыре доли отсчёта. Затем играйте обе партии по нотам.";
  if (status === "playing")
    return pulse
      ? "Играйте восемь четвертей C4 по пульсу. Перед повтором отпускайте клавишу."
      : "Играйте C3 слева и C4 справа по курсору. Ошибка не останавливает время.";
  if (status === "finalizing")
    return pulse
      ? "Проверка пульса ещё завершается. Дождитесь итогового допуска."
      : "Проверяем последние атаки двух ритмов. Дождитесь результата.";
  return STATUS[status];
}
export function IndependentRhythmPracticePanel(props: IndependentRhythmPracticeProps) {
  const { t } = useI18n();
  const preparation = props.status === "preparation" || props.status === "passed";
  const active =
    props.status === "count-in" || props.status === "playing" || props.status === "finalizing";
  const midiMissing = props.source === "midi" && !props.midiAvailable;
  const startable = preparation && props.ready && props.allReleased && !midiMissing && !props.error;
  return (
    <section
      className="reading-practice two-hand-practice independent-rhythm-practice"
      aria-label={t(INDEPENDENT_RHYTHM_TITLE)}
    >
      <p className="two-hand-feedback" role="status" aria-live="polite">
        {t(phaseStatus(props.status, props.phase))}
        {props.status === "count-in" && props.countInBeat !== undefined && (
          <> {t("Доля отсчёта: {beat} из 4", { beat: props.countInBeat })}</>
        )}
      </p>
      <div className="reading-actions">
        <strong>{t(INDEPENDENT_RHYTHM_TITLE)}</strong>
        <span>{t(props.phase === "pulse" ? "Проверка пульса C4" : "Два ритма C3/C4")}</span>
        <button type="button" className="game-button" onClick={props.onNewSeries}>
          {t("Новая серия")}
        </button>
        <button type="button" className="game-button" onClick={props.onRepeat}>
          {t("Повторить с проверки пульса")}
        </button>
        <button type="button" className="game-button" onClick={props.onExit}>
          {t("Выйти из двух ритмов")}
        </button>
      </div>
      <p className="reading-muted">
        {t(
          props.phase === "pulse"
            ? "Пульс: 8 четвертей · 60 BPM · окно ±150 мс · 0 лишних атак."
            : "Два ритма: 4 такта · 24 начала нот · 60 BPM · окно ±150 мс для каждой ноты."
        )}
      </p>
      <label>
        {t("Способ ввода двух ритмов")}{" "}
        <select
          value={props.source}
          disabled={active}
          onChange={(event) => {
            props.onSource(event.target.value as ReadingInputSource);
          }}
        >
          {(["keyboard", "pointer", "midi"] as const).map((source) => (
            <option key={source} value={source}>
              {t(INDEPENDENT_RHYTHM_SOURCES[source])}
            </option>
          ))}
        </select>
      </label>
      {props.source === "midi" && (
        <p className="reading-muted">
          {props.midiChannel === null
            ? t("Канал MIDI определится первой атакой проверки пульса.")
            : t("Канал двух ритмов: {channel}", { channel: props.midiChannel })}
        </p>
      )}
      {preparation && (
        <>
          <p>{t("Пульс: C4. Два ритма: C3 слева и C4 справа.")}</p>
          <label>
            <input
              type="checkbox"
              checked={props.showKeyHints}
              disabled={!props.ready}
              onChange={(event) => {
                props.onShowKeyHints(event.target.checked);
              }}
            />
            {t("Показать клавиши перед стартом")}
          </label>
          <details>
            <summary>{t("Позиции и назначения двух ритмов")}</summary>
            <IndependentRhythmBindings bindings={props.bindings} />
          </details>
        </>
      )}
      {!props.allReleased && !active && (
        <p role="alert">{t("Отпустите все нажатые клавиши перед стартом фазы.")}</p>
      )}
      {midiMissing && (
        <p role="alert">{t("Подключите и выберите MIDI-устройство или смените способ ввода.")}</p>
      )}
      {props.error === "audio" && (
        <p role="alert">{t("Не удалось включить метроном. Включите звук и начните ритм снова.")}</p>
      )}
      {props.error === "staff" && (
        <p role="alert">
          {t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}{" "}
          <button type="button" onClick={props.onRetryStaff}>
            {t("Повторить загрузку стана")}
          </button>
        </p>
      )}
      <div className="reading-actions">
        {preparation && (
          <button
            type="button"
            className="game-button"
            disabled={!startable}
            onClick={props.onStart}
          >
            {t(props.phase === "pulse" ? "Начать проверку пульса" : "Начать два ритма")}
          </button>
        )}
        {props.status === "failed" && (
          <button type="button" className="game-button" onClick={props.onGoToRhythm}>
            {t("Перейти к курсу «Ритм»")}
          </button>
        )}
      </div>
      {props.phase === "pulse" && props.pulseSummary && (
        <p>
          {t("Попадания: {hits} из {expected} ({percent}%).", {
            hits: props.pulseSummary.right.hits,
            expected: props.pulseSummary.right.expected,
            percent: Math.round(
              (props.pulseSummary.right.hits / Math.max(1, props.pulseSummary.right.expected)) * 100
            )
          })}{" "}
          {t("Лишние удары")}: {props.pulseSummary.extras}
        </p>
      )}
      <p className="reading-muted">
        {t(
          "Оцениваются только начала нот. Длительность удержания, легато и педаль не оцениваются. Перед повтором той же ноты полностью отпустите клавишу и нажмите снова."
        )}
      </p>
      <p className="reading-muted">
        {t(
          "Без MIDI играйте двумя клавишами ПК или двумя касаниями. Одной мышью совместную атаку выполнить нельзя."
        )}
      </p>
      {props.result && <IndependentRhythmResults result={props.result} />}
      <IndependentRhythmProgress {...props} />
    </section>
  );
}
