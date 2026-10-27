import { HeldBassLessonSummary } from "./LessonResultSummary";
import { LessonIllustration } from "./LessonIllustration";
import { LessonReport } from "./LessonReport";
import { useI18n } from "../app/useI18n";
import { LessonDetails } from "./LessonDetails";
import type { ReadingHintLevel, ReadingPreferences } from "../reading/types";
import type { HeldBassResult, HeldBassStatus } from "../reading/heldBassTypes";
import {
  HELD_BASS_STATUS,
  HELD_BASS_TITLE,
  HeldBassProgress,
  HeldBassResults,
  type HeldBassProgressProps
} from "./HeldBassProgress";
import { twoHandNoteName } from "./TwoHandProgress";

export function HeldBassCourseCard(
  props: HeldBassProgressProps & { onStart: () => void; onIntro: () => void }
) {
  const { t } = useI18n();
  return (
    <section className="reading-course-card">
      <LessonIllustration lesson="held-bass" />
      <h3>{t(HELD_BASS_TITLE)}</h3>
      <p>{t("Удерживайте бас слева и ведите мелодию справа.")}</p>
      <div className="reading-actions">
        <button type="button" className="game-button lesson-primary-action" onClick={props.onStart}>
          {t("Начать десять фрагментов с басом")}
        </button>
      </div>
      <LessonDetails kind="more" id="held-bass:catalog:more">
        <button
          type="button"
          className="game-button lesson-secondary-action"
          onClick={props.onIntro}
        >
          {t("Знакомство с удержанием баса")}
        </button>
      </LessonDetails>
      <p className="reading-muted">
        {t("Завершено серий: {number}", { number: props.history.length })}
      </p>
      <LessonDetails kind="progress" id="held-bass:catalog:progress">
        <HeldBassProgress {...props} />
      </LessonDetails>
    </section>
  );
}
export interface HeldBassPracticeProps extends HeldBassProgressProps {
  index: number;
  step: number;
  melodyLength: number;
  ready: boolean;
  status: HeldBassStatus;
  hintLevel: ReadingHintLevel;
  pitches: readonly number[];
  renderError: boolean;
  preferences: ReadingPreferences;
  result: HeldBassResult | null;
  onHint: () => void;
  onRetry: () => void;
  onNewSeries: () => void;
  onExit: () => void;
  onPreferences: (value: Partial<ReadingPreferences>) => void;
}
export function HeldBassPracticePanel(props: HeldBassPracticeProps) {
  const { t } = useI18n();
  return (
    <section
      className="reading-practice two-hand-practice held-bass-practice"
      aria-label={t(HELD_BASS_TITLE)}
    >
      {props.renderError ? (
        <p className="two-hand-feedback" role="alert">
          {t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}{" "}
          <button type="button" onClick={props.onRetry}>
            {t("Повторить загрузку стана")}
          </button>
        </p>
      ) : (
        <p className="two-hand-feedback" role="status" aria-live="polite">
          {props.result
            ? t("Серия удержания баса завершена")
            : props.status === "ready" && !props.ready
              ? props.step === 0
                ? t("Дождитесь начала фрагмента. Пока не нажимайте клавиши.")
                : t(HELD_BASS_STATUS.travelling)
              : props.status === "ready" && props.step > 0
                ? t("Держите бас и сыграйте следующую правую ноту.")
                : t(HELD_BASS_STATUS[props.status])}
        </p>
      )}
      <div className="reading-actions">
        <strong>{t(HELD_BASS_TITLE)}</strong>
        <span>
          {t("Фрагмент с басом {number} из 10", { number: Math.min(10, props.index + 1) })}
        </span>
        <span>
          {t("Мелодия: нота {number} из {total}", {
            number: Math.min(props.melodyLength, props.step + 1),
            total: props.melodyLength
          })}
        </span>
        <button type="button" className="game-button" onClick={props.onNewSeries}>
          {t("Новая серия")}
        </button>
        <button type="button" className="game-button" onClick={props.onExit}>
          {t("Выйти из удержания баса")}
        </button>
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
      </div>
      <LessonDetails kind="guide" id="held-bass:practice:guide">
        <p className="reading-muted">
          {t(
            "Без MIDI используйте клавиатуру ПК или настоящий мультитач. Одной мышью удержать бас и сыграть мелодию нельзя."
          )}
        </p>
      </LessonDetails>
      {props.ready && props.hintLevel > 0 && (
        <p className="reading-hint">
          {t("Бас и ожидаемая нота: {notes}", {
            notes: props.pitches.map((pitch) => twoHandNoteName(pitch, t)).join(" + ")
          })}
        </p>
      )}
      <LessonDetails kind="settings" id="held-bass:practice:settings">
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
        <LessonReport summary={<HeldBassLessonSummary result={props.result} />}>
          <HeldBassResults result={props.result} sourceFilter={props.sourceFilter} />
        </LessonReport>
      )}
      <LessonDetails kind="progress" id="held-bass:practice:progress">
        <HeldBassProgress {...props} />
      </LessonDetails>
    </section>
  );
}
