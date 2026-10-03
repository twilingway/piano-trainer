import type { Difficulty } from "../practice/gameRules";

interface Props {
  readonly difficulty: Difficulty;
  readonly ranked: boolean;
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
      performance: boolean;
      stopOnError: boolean;
    }>
  ) => void;
  readonly onRange: (change: Partial<{ from: number; to: number; loop: boolean }>) => void;
}
export function GameSettings(props: Props) {
  return (
    <section className="settings-list">
      <h3>Правила исполнения</h3>
      <label className="setting">
        Сложность
        <select
          className="game-select"
          value={props.difficulty}
          disabled={props.locked}
          onChange={(event) => {
            props.onChange({ difficulty: event.target.value as Difficulty });
          }}
        >
          <option value="easy">Легко</option>
          <option value="normal">Обычно</option>
          <option value="hard">Сложно</option>
          <option value="expert">Эксперт</option>
        </select>
      </label>
      <label className="setting">
        Рейтинговое исполнение
        <input
          type="checkbox"
          checked={props.ranked}
          disabled={props.locked || (!props.ranked && !props.rankedReady)}
          onChange={(event) => {
            props.onChange({ ranked: event.target.checked });
          }}
        />
      </label>
      {!props.rankedReady && (
        <p className="setting-hint">
          Для рейтинга выберите одно устройство и выполните калибровку во вкладке «Точность».
          Рейтинг играет в темпе на скорости 100 %, без Loop.
        </p>
      )}
      <label className="setting">
        Performance: скрыть подсказки
        <input
          type="checkbox"
          checked={props.performance}
          onChange={(event) => {
            props.onChange({ performance: event.target.checked });
          }}
        />
      </label>
      <label className="setting">
        Остановиться после ошибки
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
          ? "После промаха или лишней ноты игра встаёт на паузу."
          : "No-Fail: песня продолжается после ошибок."}
      </p>
      <fieldset disabled={props.ranked || props.locked} className="practice-range">
        <legend>Участок, секунды</legend>
        <label>
          От
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
          До
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
          Повторять участок
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
        <summary>Как считаются очки</summary>
        <p>
          PERFECT / GREAT / GOOD / OK: 100 / 80 / 50 / 25 базовых очков. Комбо повышает множитель до
          ×5. Ошибки сбрасывают комбо; в тишине штрафов нет.
        </p>
        <p>
          20 PERFECT/GREAT включают Flow. Энергия за точные попадания подстраивается под длину и
          число нот выбранной партии: до трёх зарядов за композицию, меньше в коротких упражнениях.
          GREAT даёт половину энергии PERFECT. Overdrive стоит 50 энергии и удваивает множитель на
          10 секунд. Паузы не дают энергию. Удержание длинных нот даёт бонус очков.
        </p>
        <p>
          Точность зависит только от оценок атак. Звёзды сравнивают очки с идеальным исполнением без
          Overdrive. «Ждать ноту» — обучение без рейтинга.
        </p>
      </details>
    </section>
  );
}
