import { useI18n } from "../app/useI18n";
import type {
  ReadingHintLevel,
  ReadingPreferences,
  ReadingResult,
  ReadingTask
} from "../reading/types";

export const READING_TASK_LABELS: Readonly<Record<ReadingTask, string>> = {
  notes: "Читаю отдельные ноты",
  phrases: "Читаю короткие фразы",
  check: "Проверяю чтение без подсказок"
};
const NAMES: Readonly<Record<number, string>> = {
  60: "до",
  62: "ре",
  64: "ми",
  65: "фа",
  67: "соль"
};
export function readingNoteName(pitch: number, t: (key: string) => string): string {
  return `${t(NAMES[pitch] ?? "Нота курса")} 4`;
}

export function ReadingCourseCard({
  onStart,
  onIntro,
  history
}: {
  onStart: (task: ReadingTask) => void;
  onIntro: () => void;
  history: readonly ReadingResult[];
}) {
  const { t } = useI18n();
  return (
    <section className="reading-course-card">
      <h3>{t("Читаю пять нот")}</h3>
      <p>{t("Учитесь узнавать ноты на стане и находить их на клавиатуре.")}</p>
      <div className="reading-actions">
        <button type="button" className="game-button" onClick={onIntro}>
          {t("Знакомство с пятью нотами")}
        </button>
        {(Object.keys(READING_TASK_LABELS) as ReadingTask[]).map((task) => (
          <button
            type="button"
            className="game-button"
            key={task}
            onClick={() => {
              onStart(task);
            }}
          >
            {t(READING_TASK_LABELS[task])}
          </button>
        ))}
      </div>
      <p className="reading-muted">{t("Завершено серий: {number}", { number: history.length })}</p>
    </section>
  );
}

interface PracticeProps {
  task: ReadingTask;
  preferences: ReadingPreferences;
  onPreferences: (value: Partial<ReadingPreferences>) => void;
  onHint: () => void;
  hintLevel: ReadingHintLevel;
  hintPitch?: number | undefined;
  index: number;
  renderError: boolean;
  onRetry: () => void;
  onNewSeries: () => void;
  onExit: () => void;
  result: ReadingResult | null;
  history: readonly ReadingResult[];
  ready: boolean;
}
export function ReadingPracticePanel(props: PracticeProps) {
  const { t } = useI18n();
  const { task, preferences, result } = props;
  return (
    <section className="reading-practice" aria-label={t("Читаю пять нот")}>
      <div className="reading-actions">
        <strong>{t(READING_TASK_LABELS[task])}</strong>
        <span>{t("Нота {number} из 20", { number: Math.min(20, props.index + 1) })}</span>
        <button type="button" className="game-button" onClick={props.onNewSeries}>
          {t("Новая серия")}
        </button>
        <button type="button" className="game-button" onClick={props.onExit}>
          {t("Выйти из чтения нот")}
        </button>
        {task !== "check" && (
          <button
            type="button"
            className="game-button"
            disabled={!props.ready || props.hintLevel === 2 || result !== null}
            onClick={props.onHint}
          >
            {t("Подсказка")}
          </button>
        )}
      </div>
      <div className="reading-status">
        <p
          className={`reading-muted${props.ready || result || props.renderError ? " reading-status-hidden" : ""}`}
        >
          {t("Нажмите «Играть» и дождитесь появления текущей ноты.")}
        </p>
        {props.renderError ? (
          <p role="alert">
            {t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}{" "}
            <button type="button" onClick={props.onRetry}>
              {t("Повторить загрузку стана")}
            </button>
          </p>
        ) : (
          props.hintLevel > 0 &&
          props.hintPitch !== undefined &&
          task !== "check" && (
            <p className="reading-hint" aria-live="polite">
              {t("Текущая нота: {note}", { note: readingNoteName(props.hintPitch, t) })}
            </p>
          )
        )}
      </div>
      {task !== "check" && (
        <details className="reading-hint-settings">
          <summary>{t("Настройки подсказок чтения")}</summary>
          <label>
            <input
              type="checkbox"
              checked={preferences.automaticHints}
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
              value={preferences.nameDelayMs / 1000}
              onChange={(event) => {
                props.onPreferences({ nameDelayMs: Number(event.target.value) * 1000 });
              }}
            />
          </label>
          <label>
            {t("Клавиша через, с")}
            <input
              type="number"
              min={preferences.nameDelayMs / 1000}
              max={60}
              value={preferences.keyDelayMs / 1000}
              onChange={(event) => {
                props.onPreferences({ keyDelayMs: Number(event.target.value) * 1000 });
              }}
            />
          </label>
        </details>
      )}
      {result && <ReadingResults result={result} />}
      <details className="reading-history">
        <summary>
          {t("История этого задания: {number}", {
            number: props.history.filter((item) => item.task === task).length
          })}
        </summary>
        {props.history
          .filter((item) => item.task === task)
          .slice()
          .reverse()
          .map((item) => (
            <ReadingResults key={item.id} result={item} />
          ))}
      </details>
    </section>
  );
}

export function ReadingResults({ result }: { result: ReadingResult }) {
  const { t } = useI18n();
  const first = result.notes.filter((note) => note.firstAttemptCorrect).length;
  const independent = result.notes.filter((note) => note.independentCorrect).length;
  const unassisted = result.notes.filter((note) => note.unassistedSolved).length;
  return (
    <div className="reading-results">
      <h4>{t("Результат чтения")}</h4>
      <p>
        {t("Верно с первой попытки: {number}/20", { number: first })} ·{" "}
        {t("Самостоятельно с первой попытки: {percent}%", {
          percent: Math.round((independent / 20) * 100)
        })}{" "}
        · {t("Решено без подсказок: {number}/20", { number: unassisted })}
      </p>
      <div className="reading-results-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Нота курса")}</th>
              <th>{t("Ошибки чтения")}</th>
              <th>{t("Самостоятельных ответов")}</th>
              <th>{t("Среднее время ответа, с")}</th>
            </tr>
          </thead>
          <tbody>
            {[60, 62, 64, 65, 67].map((pitch) => {
              const notes = result.notes.filter((note) => note.expectedMidi === pitch);
              const errors = notes.reduce(
                (sum, note) =>
                  sum + note.attempts.filter((attempt) => attempt.playedMidi !== pitch).length,
                0
              );
              return (
                <tr key={pitch}>
                  <td>{readingNoteName(pitch, t)}</td>
                  <td>{errors}</td>
                  <td>
                    {notes.filter((note) => note.independentCorrect).length}/{notes.length}
                  </td>
                  <td>
                    {(
                      notes.reduce((sum, note) => sum + note.responseLatencyMs, 0) /
                      Math.max(1, notes.length) /
                      1000
                    ).toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
