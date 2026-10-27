import { TwoHandLessonSummary } from "./LessonResultSummary";
import { LessonIllustration } from "./LessonIllustration";
import { LessonReport } from "./LessonReport";
import { useI18n } from "../app/useI18n";
import { LessonDetails } from "./LessonDetails";
import { LessonMenuItem, LessonSlot } from "./LessonSlots";
import type { ReadingHintLevel, ReadingPreferences } from "../reading/types";
import type { TwoHandResult, TwoHandStatus } from "../reading/twoHandTypes";
import {
  TWO_HAND_STATUS,
  TWO_HAND_TITLE,
  TwoHandProgress,
  TwoHandResults,
  twoHandNoteName,
  type TwoHandProgressProps
} from "./TwoHandProgress";

export function TwoHandCourseCard(
  props: TwoHandProgressProps & { onStart: () => void; onIntro: () => void }
) {
  const { t } = useI18n();
  return (
    <section className="reading-course-card">
      <LessonIllustration lesson="two-hands" />
      <h3>{t(TWO_HAND_TITLE)}</h3>
      <p>{t("Сыграйте две ноты вместе — левой и правой рукой.")}</p>
      <div className="reading-actions">
        <button type="button" className="game-button lesson-primary-action" onClick={props.onStart}>
          {t("Начать десять пар")}
        </button>
      </div>
      <LessonDetails kind="more" id="two-hands:catalog:more">
        <button
          type="button"
          className="game-button lesson-secondary-action"
          onClick={props.onIntro}
        >
          {t("Знакомство с совместной игрой")}
        </button>
      </LessonDetails>
      <p className="reading-muted">
        {t("Завершено серий: {number}", { number: props.history.length })}
      </p>
      <LessonDetails kind="progress" id="two-hand-reading:catalog:progress">
        <TwoHandProgress {...props} />
      </LessonDetails>
    </section>
  );
}
export interface TwoHandPracticeProps extends TwoHandProgressProps {
  index: number;
  ready: boolean;
  status: TwoHandStatus;
  hintLevel: ReadingHintLevel;
  pitches: readonly number[];
  renderError: boolean;
  preferences: ReadingPreferences;
  result: TwoHandResult | null;
  onHint: () => void;
  onRetry: () => void;
  onNewSeries: () => void;
  onExit: () => void;
  onPreferences: (value: Partial<ReadingPreferences>) => void;
}
export function TwoHandPracticePanel(props: TwoHandPracticeProps) {
  const { t } = useI18n();
  return (
    <section className="reading-practice two-hand-practice" aria-label={t(TWO_HAND_TITLE)}>
      <LessonSlot name="feedback">
        {props.renderError ? (
          <p className="two-hand-feedback" role="alert">
            {t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}{" "}
            <button type="button" onClick={props.onRetry}>
              {t("Повторить загрузку стана")}
            </button>
          </p>
        ) : (
          <p className="two-hand-feedback" role="status">
            {props.result
              ? t("Серия двух рук завершена")
              : t(TWO_HAND_STATUS[props.ready ? props.status : "unpresented"])}
          </p>
        )}
        {props.ready && props.hintLevel > 0 && (
          <p className="reading-hint">
            {t("Подсказка: {note}", {
              note: props.pitches.map((pitch) => twoHandNoteName(pitch, t)).join(" + ")
            })}
          </p>
        )}
      </LessonSlot>
      <LessonSlot name="counter">
        <span className="lesson-counter">
          {props.result
            ? t("Завершено · {number} из {total}", { number: 10, total: 10 })
            : t("Пара {number} из 10", { number: Math.min(10, props.index + 1) })}
        </span>
      </LessonSlot>
      <LessonSlot name="exit">
        <button type="button" className="game-button lesson-exit" onClick={props.onExit}>
          {t("Выйти")}
        </button>
      </LessonSlot>
      {props.result === null && (
        <LessonMenuItem kind="newSeries" label={t("Новая серия")} onSelect={props.onNewSeries} />
      )}
      <LessonSlot name="hint">
        <button
          type="button"
          className="game-button"
          disabled={
            !props.ready || props.renderError || props.hintLevel >= 2 || props.result !== null
          }
          onClick={props.onHint}
        >
          {t("Подсказка")}
        </button>
      </LessonSlot>
      <LessonDetails kind="guide" id="two-hand-reading:practice:guide">
        <p className="reading-muted">
          {t(
            "Без MIDI играйте двумя клавишами ПК или двумя касаниями. Одной мышью совместную атаку выполнить нельзя."
          )}
        </p>
      </LessonDetails>
      <LessonDetails kind="settings" id="two-hand-reading:practice:settings">
        <div className="reading-hint-settings">
          <h4>{t("Настройки подсказок чтения")}</h4>
          <label>
            <input
              type="checkbox"
              checked={props.preferences.automaticHints}
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
              value={props.preferences.nameDelayMs / 1000}
              onChange={(event) => {
                props.onPreferences({ nameDelayMs: Number(event.target.value) * 1000 });
              }}
            />
          </label>
          <label>
            {t("Клавиша через, с")}
            <input
              type="number"
              min={props.preferences.nameDelayMs / 1000}
              max={60}
              value={props.preferences.keyDelayMs / 1000}
              onChange={(event) => {
                props.onPreferences({ keyDelayMs: Number(event.target.value) * 1000 });
              }}
            />
          </label>
        </div>
      </LessonDetails>
      {props.result && (
        <LessonReport summary={<TwoHandLessonSummary result={props.result} />}>
          <TwoHandResults result={props.result} sourceFilter={props.sourceFilter} />
        </LessonReport>
      )}
      <LessonDetails kind="progress" id="two-hand-reading:practice:progress">
        <TwoHandProgress {...props} />
      </LessonDetails>
    </section>
  );
}
