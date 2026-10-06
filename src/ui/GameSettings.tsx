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
  /** Notes of the player's hands off their keyboard: Ranked asks for them all the same. */
  readonly outsideKeyboard?: number;
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
          {t("Рейтинговая игра")}{" "}
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
        <p className="setting-hint">{t("В «Печатать мелодию» рейтинга нет: это учебный режим.")}</p>
      )}
      {!props.practiceOnly && (props.outsideKeyboard ?? 0) > 0 && (
        <p className="setting-hint">
          {t("В рейтинге ноты вне вашей клавиатуры ({count}) считаются промахами.", {
            count: props.outsideKeyboard ?? 0
          })}
        </p>
      )}
      {!props.practiceOnly && !props.rankedReady && (
        <p className="setting-hint">
          {t(
            "Для рейтинга выберите одно устройство и откалибруйте его в разделе «Синхронизация». Рейтинговая игра идёт в темпе, на скорости 100 % и без повтора участка."
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
          "Нажатие с опозданием до 300 мс засчитывается и даёт 25 очков, точное попадание стоит больше. Клавиша начинает подсвечиваться за 300 мс до ноты. В рейтинге окно всегда строгое."
        )}
      </p>
      <label className="setting">
        {t("Без подсказок")}{" "}
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
          : t("Песня не останавливается на ошибках.")}
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
            "«Идеально» / «Отлично» / «Хорошо» / «Зачтено»: 100 / 80 / 50 / 25 очков. Комбо поднимает множитель до ×5, ошибка сбрасывает комбо. Лишняя клавиша между нотами не штрафуется."
          )}
        </p>
        <p>
          {t(
            "20 нот подряд на «Идеально» или «Отлично» включают Поток. Каждая засчитанная нота, даже «Хорошо» и «Зачтено», добавляет энергию. Её запас зависит от длины выбранной партии: в пьесе короче 30 секунд хватит на два Overdrive, в более длинной — на три. Промахи и паузы энергию не дают. Overdrive стоит 50 энергии и удваивает множитель на 10 секунд, поэтому в совсем коротком упражнении включений может быть меньше. За удержание длинных нот начисляются бонусные очки."
          )}
        </p>
        <p>
          {t(
            "Точность считается только по моменту нажатия. Звёзды сравнивают ваши очки с идеальной игрой без Overdrive. В режиме «Ждать ноту» рейтинга нет."
          )}
        </p>
      </details>
    </section>
  );
}
