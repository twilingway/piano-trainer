import { useI18n } from "../app/useI18n";
import type { Difficulty } from "../practice/gameRules";

interface Props {
  readonly practiceOnly?: boolean;
  readonly difficulty: Difficulty;
  readonly ranked: boolean;
  readonly learningWindow: boolean;
  readonly rankedReady: boolean;
  readonly performance: boolean;
  readonly stopOnError: boolean;
  readonly locked: boolean;
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly loop: boolean;
  readonly onChange: (
    change: Partial<{
      difficulty: Difficulty;
      ranked: boolean;
      learningWindow: boolean;
      performance: boolean;
      stopOnError: boolean;
    }>
  ) => void;
  readonly onRange: (change: Partial<{ from: number; to: number; loop: boolean }>) => void;
}
export function GameSettings(props: Props) {
  const { t } = useI18n();
  return (
    <section className="settings-list">
      <h3 className="settings-group__title">{t("Правила и очки")}</h3>
      <label className="setting">
        {t("Сложность")}{" "}
        <select
          className="game-select"
          value={props.difficulty}
          disabled={props.locked}
          onChange={(event) => {
            props.onChange({ difficulty: event.target.value as Difficulty });
          }}
        >
          <option value="easy">{t("Легко")}</option>
          <option value="normal">{t("Обычно")}</option>
          <option value="hard">{t("Сложно")}</option>
          <option value="expert">{t("Эксперт")}</option>
        </select>
      </label>
      {!props.practiceOnly && (
        <label className="setting">
          {t("Рейтинговое исполнение")}{" "}
          <input
            type="checkbox"
            checked={props.ranked}
            disabled={props.locked || (!props.ranked && !props.rankedReady)}
            onChange={(event) => {
              props.onChange({ ranked: event.target.checked });
            }}
          />
        </label>
      )}
      {props.practiceOnly && (
        <p className="setting-hint">
          {t("Печатать мелодию — учебный прототип без рейтингового исполнения.")}
        </p>
      )}
      {!props.practiceOnly && !props.rankedReady && (
        <p className="setting-hint">
          {t(
            "Для рейтинга выберите одно устройство и выполните калибровку в разделе «Синхронизация». Рейтинг играет в темпе на скорости 100 %, без Loop."
          )}
        </p>
      )}
      <label className="setting">
        {t("Учебное окно +300 мс")}{" "}
        <input
          type="checkbox"
          checked={props.learningWindow && !props.ranked}
          disabled={props.ranked || props.locked}
          onChange={(event) => {
            props.onChange({ learningWindow: event.target.checked });
          }}
        />
      </label>
      <p className="setting-hint">
        {t(
          "Позднее нажатие до +300 мс даёт OK: 25 базовых очков. Точное попадание ценнее. Клавиша постепенно подсвечивается за 300 мс до ноты. В рейтинге окно остаётся строгим."
        )}
      </p>
      <label className="setting">
        {t("Performance: скрыть подсказки")}{" "}
        <input
          type="checkbox"
          checked={props.performance}
          onChange={(event) => {
            props.onChange({ performance: event.target.checked });
          }}
        />
      </label>
      <label className="setting">
        {t("Остановиться после ошибки")}{" "}
        <input
          type="checkbox"
          checked={props.stopOnError}
          disabled={props.ranked || props.locked}
          onChange={(event) => {
            props.onChange({ stopOnError: event.target.checked });
          }}
        />
      </label>
      <p className="setting-hint">
        {props.stopOnError && !props.ranked
          ? t("После промаха или лишней ноты игра встаёт на паузу.")
          : t("No-Fail: песня продолжается после ошибок.")}
      </p>
      <fieldset disabled={props.ranked || props.locked} className="practice-range">
        <legend>{t("Участок, секунды")}</legend>
        <label>
          {t("От")}{" "}
          <input
            type="number"
            min={0}
            max={props.duration}
            step={0.1}
            value={props.from}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber))
                props.onRange({ from: event.target.valueAsNumber });
            }}
          />
        </label>
        <label>
          {t("До")}{" "}
          <input
            type="number"
            min={props.from}
            max={props.duration}
            step={0.1}
            value={Math.floor(props.to * 1000) / 1000}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber))
                props.onRange({ to: event.target.valueAsNumber });
            }}
          />
        </label>
        <label>
          {t("Повторять участок")}{" "}
          <input
            type="checkbox"
            checked={props.loop}
            onChange={(event) => {
              props.onRange({ loop: event.target.checked });
            }}
          />
        </label>
      </fieldset>
      <details>
        <summary>{t("Как считаются очки")}</summary>
        <p>
          {t(
            "PERFECT / GREAT / GOOD / OK: 100 / 80 / 50 / 25 базовых очков. Комбо повышает множитель до ×5. Ошибки сбрасывают комбо; в тишине штрафов нет."
          )}
        </p>
        <p>
          {t(
            "20 PERFECT/GREAT включают Flow. Каждая засчитанная нота, включая GOOD и OK, даёт энергию. Прибавка рассчитана отдельно по длине и числу нот выбранной партии: два заряда для композиции короче 30 секунд, три — от 30 секунд. Пропуски и паузы не дают энергию. Overdrive стоит 50 энергии и удваивает множитель на 10 секунд; в очень коротком упражнении число включений ограничено длительностью эффекта. Удержание длинных нот даёт бонус очков."
          )}
        </p>
        <p>
          {t(
            "Точность зависит только от оценок атак. Звёзды сравнивают очки с идеальным исполнением без Overdrive. «Ждать ноту» — обучение без рейтинга."
          )}
        </p>
      </details>
    </section>
  );
}
