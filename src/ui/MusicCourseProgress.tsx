import { MusicCourseNotes } from "./MusicCourseNotes";
import { useI18n } from "../app/useI18n";
import type { MusicCourse, MusicPurpose, MusicNote } from "../musicLearning/types";
import type { MusicInputSource, MusicSourceFilter } from "../musicLearning/progress";
import { musicCourseNoteLabel } from "./MusicCourseSettings";
import { MUSIC_COURSE_LABELS } from "./MusicCourse";
import type { MusicCourseMetric, MusicCourseResultView } from "./musicCourseTypes";

export interface MusicProgressFilters {
  readonly course: MusicCourse | "all";
  readonly source: MusicSourceFilter;
  readonly purpose: MusicPurpose | "all";
}
export interface MusicProgressCohort {
  readonly id: string;
  readonly course: MusicCourse;
  readonly source: MusicInputSource;
  readonly purpose: MusicPurpose;
  readonly evidence: "visual" | "aural";
  readonly skillKey?: string;
  readonly metrics: readonly MusicCourseMetric[];
}
export interface MusicProgressBody {
  readonly expectedNotes: readonly MusicNote[];
  readonly playedNotes: readonly MusicNote[];
  readonly chords: readonly (readonly number[])[];
  readonly answers: readonly { readonly expectedKey: string; readonly answerKey: string }[];
  readonly metrics: readonly MusicCourseMetric[];
}
export interface MusicProgressChild {
  readonly completedAt?: number;
  readonly body?: MusicProgressBody;
  readonly id: string;
  readonly skillKey: string;
  readonly source: MusicInputSource;
  readonly purpose: MusicPurpose;
  readonly auditoryVerified: boolean;
  readonly visualAlternative: boolean;
  readonly helped: boolean;
  readonly status: "completed" | "empty";
  readonly performedUnits: number;
  readonly metrics: readonly MusicCourseMetric[];
}
export interface MusicProgressRow {
  readonly id: string;
  readonly course: MusicCourse;
  readonly source: MusicInputSource;
  readonly purpose: MusicPurpose;
  readonly completedAt: number;
  readonly evidence: "visual" | "aural" | "combined";
  readonly result: MusicCourseResultView;
  readonly children: readonly MusicProgressChild[];
}
export interface MusicCourseProgressProps {
  readonly filters: MusicProgressFilters;
  readonly cohorts: readonly MusicProgressCohort[];
  readonly rows: readonly MusicProgressRow[];
  readonly pendingChildren?: readonly MusicProgressChild[];
  readonly onFilters: (patch: Partial<MusicProgressFilters>) => void;
}
const SOURCE_LABELS: Readonly<Record<MusicSourceFilter, string>> = {
  all: "Все способы музыкального ввода",
  midi: "MIDI-инструмент",
  keyboard: "Клавиатура компьютера",
  pointer: "Клавиши на экране"
};
const PURPOSE_LABELS: Readonly<Record<MusicPurpose | "all", string>> = {
  all: "Обучение и контроль вместе",
  training: "Музыкальное обучение",
  control: "Музыкальный контроль"
};
const EVIDENCE_LABELS = {
  combined: "Навыки мини-урока",
  visual: "По нотам и клавишам",
  aural: "После прослушивания эталона"
} as const;

function ProgressMetrics({ metrics }: { readonly metrics: readonly MusicCourseMetric[] }) {
  const { t, formatNumber } = useI18n();
  return (
    <dl className="music-progress-metrics">
      {metrics.map((metric, index) => (
        <div key={`${metric.labelKey}:${String(index)}`}>
          <dt>{t(metric.labelKey)}</dt>
          <dd>
            {metric.valueKey
              ? t(metric.valueKey)
              : metric.value === null
                ? t("Музыкальный показатель не измерялся")
                : typeof metric.value === "number"
                  ? formatNumber(metric.value, { maximumFractionDigits: 2 })
                  : metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceBody({ body }: { readonly body: MusicProgressBody }) {
  const { t } = useI18n();
  return (
    <details className="music-progress-evidence">
      <summary>{t("Сохранённый материал и исполнение")}</summary>
      <ProgressMetrics metrics={body.metrics} />
      <MusicCourseNotes expectedNotes={body.expectedNotes} playedNotes={body.playedNotes} />
      {body.chords.map((pitches, index) => (
        <p key={index}>
          {t("Аккорд сохранённого ответа: {notes}", {
            notes: pitches.map((pitch) => musicCourseNoteLabel(pitch, t)).join(", ")
          })}
        </p>
      ))}
      {body.answers.map((answer, index) => (
        <p key={index}>
          {t("Выбор в задании: {expected}; ответ: {answer}", {
            expected: t(answer.expectedKey),
            answer: t(answer.answerKey)
          })}
        </p>
      ))}
    </details>
  );
}

function ProgressChild({ child }: { readonly child: MusicProgressChild }) {
  const { t, formatNumber, formatDate } = useI18n();
  return (
    <section data-child={child.id}>
      <h5>{t(child.skillKey)}</h5>
      <p>
        {child.completedAt === undefined
          ? t("Дата этого задания не записана.")
          : t("Задание завершено: {date}", {
              date: formatDate(child.completedAt, { dateStyle: "medium", timeStyle: "short" })
            })}
      </p>
      <p>
        {t("Группа прогресса: {source} · {purpose} · {evidence}", {
          source: t(SOURCE_LABELS[child.source]),
          purpose: t(PURPOSE_LABELS[child.purpose]),
          evidence: t(
            EVIDENCE_LABELS[child.auditoryVerified && !child.visualAlternative ? "aural" : "visual"]
          )
        })}
      </p>
      <p>
        {t(
          child.status === "completed"
            ? "Сохранённый ответ этапа завершён"
            : "На этапе не было исполненного ответа"
        )}
        {child.helped ? t(" · Использовалась помощь") : null}
      </p>
      <p>
        {t("Исполнено действий в задании: {number}", {
          number: formatNumber(child.performedUnits)
        })}
      </p>
      {child.visualAlternative ? (
        <p>{t("Зрительная замена: слуховой прогресс не начислялся.")}</p>
      ) : null}
      <ProgressMetrics metrics={child.metrics} />
      {child.body ? <EvidenceBody body={child.body} /> : null}
    </section>
  );
}

/** Persisted evidence only: opening progress never selects a course or advances practice. */
export function MusicCourseProgress({
  filters,
  cohorts,
  rows,
  pendingChildren = [],
  onFilters
}: MusicCourseProgressProps) {
  const { t, formatDate, formatNumber } = useI18n();
  return (
    <section
      id="music-course-progress"
      className="music-course-progress"
      aria-label={t("Мой музыкальный прогресс")}
    >
      <h3>{t("Мой музыкальный прогресс")}</h3>
      <p className="reading-muted">
        {t(
          "Навыки, способы ввода и помощь учитываются отдельно. Слуховая тренировка не означает освоение навыка."
        )}
      </p>
      <div className="reading-actions music-progress-filters">
        <label>
          {t("Курс в музыкальном прогрессе")}
          <select
            value={filters.course}
            onChange={(event) => {
              const course = event.currentTarget.value;
              if (
                course === "all" ||
                course === "sight-reading" ||
                course === "harmony" ||
                course === "dictation" ||
                course === "integrated"
              )
                onFilters({ course });
            }}
          >
            <option value="all">{t("Все музыкальные курсы")}</option>
            {Object.entries(MUSIC_COURSE_LABELS).map(([course, key]) => (
              <option key={course} value={course}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Способ ввода в музыкальном прогрессе")}
          <select
            value={filters.source}
            onChange={(event) => {
              const source = event.currentTarget.value;
              if (
                source === "all" ||
                source === "midi" ||
                source === "keyboard" ||
                source === "pointer"
              )
                onFilters({ source });
            }}
          >
            {Object.entries(SOURCE_LABELS).map(([source, key]) => (
              <option key={source} value={source}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Режим в музыкальном прогрессе")}
          <select
            value={filters.purpose}
            onChange={(event) => {
              const purpose = event.currentTarget.value;
              if (purpose === "all" || purpose === "training" || purpose === "control")
                onFilters({ purpose });
            }}
          >
            {Object.entries(PURPOSE_LABELS).map(([purpose, key]) => (
              <option key={purpose} value={purpose}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="music-progress-summary" open>
        <summary>{t("Сводка музыкальных навыков")}</summary>
        {cohorts.length === 0 ? (
          <p>{t("Для этих фильтров пока нет сохранённых занятий.")}</p>
        ) : (
          <div className="music-progress-cohorts">
            {cohorts.map((cohort) => (
              <section key={cohort.id} data-cohort={cohort.id}>
                <h4>
                  {t(MUSIC_COURSE_LABELS[cohort.course])}
                  {cohort.skillKey ? t(" · Навык: {skill}", { skill: t(cohort.skillKey) }) : null}
                </h4>
                <p>
                  {t("Группа прогресса: {source} · {purpose} · {evidence}", {
                    source: t(SOURCE_LABELS[cohort.source]),
                    purpose: t(PURPOSE_LABELS[cohort.purpose]),
                    evidence: t(EVIDENCE_LABELS[cohort.evidence])
                  })}
                </p>
                <ProgressMetrics metrics={cohort.metrics} />
              </section>
            ))}
          </div>
        )}
      </details>
      <details className="music-progress-history" open>
        <summary>
          {t("Последние музыкальные занятия: {number}", { number: formatNumber(rows.length) })}
        </summary>
        {rows.length === 0 ? (
          <p>{t("История появится после завершённого музыкального ответа.")}</p>
        ) : (
          <ol>
            {rows.map((row) => (
              <li key={row.id} data-run={row.id}>
                <details>
                  <summary>
                    {t("Сохранённое занятие: {course} · {date}", {
                      course: t(MUSIC_COURSE_LABELS[row.course]),
                      date: formatDate(row.completedAt, { dateStyle: "medium", timeStyle: "short" })
                    })}
                  </summary>
                  <p>
                    {t("Группа прогресса: {source} · {purpose} · {evidence}", {
                      source: t(SOURCE_LABELS[row.source]),
                      purpose: t(PURPOSE_LABELS[row.purpose]),
                      evidence: t(EVIDENCE_LABELS[row.evidence])
                    })}
                  </p>
                  <p>
                    {t(
                      row.result.helped
                        ? "Проход с музыкальной подсказкой"
                        : "Самостоятельный музыкальный ответ"
                    )}
                    {t(
                      row.result.newMaterial ? " · Новый материал" : " · Повтор знакомого материала"
                    )}
                  </p>
                  {row.result.summaryKey ? <p>{t(row.result.summaryKey)}</p> : null}
                  <ProgressMetrics metrics={row.result.metrics} />
                  {row.result.notes ? <MusicCourseNotes {...row.result.notes} /> : null}
                  {row.result.detailKeys?.map((key) => (
                    <p key={key}>{t(key)}</p>
                  ))}
                  {row.children.length > 0 ? (
                    <details className="music-progress-children">
                      <summary>{t("Задания мини-урока по своим навыкам")}</summary>
                      {row.children.map((child) => (
                        <ProgressChild key={child.id} child={child} />
                      ))}
                    </details>
                  ) : null}
                </details>
              </li>
            ))}
          </ol>
        )}
      </details>
      {pendingChildren.length > 0 ? (
        <details className="music-progress-pending" open>
          <summary>{t("Сохранённые задания текущего мини-урока")}</summary>
          {pendingChildren.map((child) => (
            <ProgressChild key={child.id} child={child} />
          ))}
        </details>
      ) : null}
    </section>
  );
}
