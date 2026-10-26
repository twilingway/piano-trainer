import { MusicCourseCatalog, MusicCoursePractice } from "../ui/MusicCourse";
import { MusicCourseProgress } from "../ui/MusicCourseProgress";
import type {
  MusicProgressFilters,
  MusicProgressCohort,
  MusicProgressRow,
  MusicProgressChild
} from "../ui/MusicCourseProgress";
import type { MusicCourse, MusicPurpose } from "../musicLearning/types";
import { summarizeDictationListening } from "../musicLearning/dictationListening";
import { mergeMusicHistory, summarizeMusicProgress } from "../musicLearning/progress";
import type { MusicResult, MusicInputSource } from "../musicLearning/progress";
import type { IntegratedSavedResult, IntegratedSkill } from "../musicLearning/integrated";
import { createMusicResultView } from "./musicCourseResults";
import { musicControllerChildView } from "./musicCourseControllerView";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";
const COURSES: readonly MusicCourse[] = ["sight-reading", "harmony", "dictation", "integrated"];
const SKILL_LABELS: Readonly<Record<IntegratedSkill, string>> = {
  keyboard: "Поиск клавиш",
  reading: "Чтение мелодии",
  rhythm: "Ритм на слух",
  interval: "Интервалы на слух",
  harmony: "Построение аккордов",
  coordination: "Игра двумя руками"
};

function childMatches(child: IntegratedSavedResult, filters: MusicProgressFilters): boolean {
  return (
    (filters.source === "all" || child.source === filters.source) &&
    (filters.purpose === "all" || child.purpose === filters.purpose)
  );
}
function resultMatches(result: MusicResult, filters: MusicProgressFilters): boolean {
  if (filters.course !== "all" && result.course !== filters.course) return false;
  if (result.course === "integrated")
    return result.state.results.some((child) => childMatches(child, filters));
  return (
    (filters.source === "all" || result.inputSource === filters.source) &&
    (filters.purpose === "all" || result.purpose === filters.purpose)
  );
}
const CHOICE_LABELS: Readonly<Record<string, string>> = {
  major: "Мажорное трезвучие",
  minor: "Минорное трезвучие",
  "3": "Терция",
  "5": "Квинта",
  I: "Тоника · I",
  IV: "Субдоминанта · IV",
  V: "Доминанта · V",
  vi: "Шестая ступень · vi",
  scalar: "Поступенное движение",
  triadic: "Движение по трезвучию",
  repeated: "Повторяющиеся звуки",
  mixed: "Смешанный рисунок"
};
function childView(child: IntegratedSavedResult): MusicProgressChild {
  const body = child.evidence;
  const listening = body ? summarizeDictationListening(body.listening) : null;
  return {
    ...(body && listening
      ? {
          completedAt: body.completedAt,
          body: {
            expectedNotes: body.material.notes,
            playedNotes: body.notes,
            chords: body.answers.flatMap((answer) =>
              answer.kind === "played" ? [answer.playedPitches] : []
            ),
            answers: body.answers.flatMap((answer) =>
              answer.kind === "named"
                ? [
                    {
                      expectedKey: CHOICE_LABELS[answer.expected] ?? answer.expected,
                      answerKey: CHOICE_LABELS[answer.answer] ?? answer.answer
                    }
                  ]
                : []
            ),
            metrics: [
              { labelKey: "Темп сохранённого задания, BPM", value: body.material.bpm },
              {
                labelKey: "Записано физических атак",
                value: body.inputJournal.events.filter((event) => event.kind === "down").length
              },
              { labelKey: "Полных прослушиваний", value: listening.full },
              { labelKey: "Частичных прослушиваний", value: listening.partial }
            ]
          }
        }
      : {}),
    id: child.resultId,
    skillKey: SKILL_LABELS[child.skill],
    source: child.source,
    purpose: child.purpose,
    status: child.status,
    performedUnits: child.performedUnits,
    helped: child.help.length > 0 || child.visualAlternative,
    auditoryVerified: child.auditoryVerified,
    visualAlternative: child.visualAlternative,
    metrics: musicControllerChildView(child, child.status === "completed", false).metrics
  };
}
function progressRows(
  history: readonly MusicResult[],
  filters: MusicProgressFilters
): readonly MusicProgressRow[] {
  return history
    .filter((result) => resultMatches(result, filters))
    .toSorted(
      (left, right) => right.completedAt - left.completedAt || right.runId.localeCompare(left.runId)
    )
    .slice(0, 20)
    .map((result) => ({
      id: result.runId,
      course: result.course,
      source: result.inputSource,
      purpose: result.purpose,
      completedAt: result.completedAt,
      evidence:
        result.course === "integrated"
          ? "combined"
          : result.course === "dictation" || (result.course === "harmony" && result.aural)
            ? "aural"
            : "visual",
      result: createMusicResultView(result),
      children:
        result.course === "integrated"
          ? result.state.results.filter((child) => childMatches(child, filters)).map(childView)
          : []
    }));
}
function childCohorts(
  history: readonly MusicResult[],
  filters: MusicProgressFilters,
  staged: readonly IntegratedSavedResult[]
): readonly MusicProgressCohort[] {
  if (filters.course !== "all" && filters.course !== "integrated") return [];
  const unique = new Map<string, IntegratedSavedResult>();
  for (const result of history)
    if (result.course === "integrated")
      for (const child of result.state.results)
        if (!unique.has(child.resultId)) unique.set(child.resultId, child);
  for (const child of staged) if (!unique.has(child.resultId)) unique.set(child.resultId, child);
  const groups = new Map<
    string,
    {
      skill: IntegratedSkill;
      source: MusicInputSource;
      purpose: MusicPurpose;
      evidence: "aural" | "visual";
      children: IntegratedSavedResult[];
    }
  >();
  for (const child of unique.values()) {
    if (!childMatches(child, filters)) continue;
    const evidence = child.auditoryVerified && !child.visualAlternative ? "aural" : "visual";
    const id = `integrated:${child.skill}:${child.source}:${child.purpose}:${evidence}`;
    const group = groups.get(id) ?? {
      skill: child.skill,
      source: child.source,
      purpose: child.purpose,
      evidence,
      children: []
    };
    group.children.push(child);
    groups.set(id, group);
  }
  return [...groups].map(([id, group]) => ({
    id,
    course: "integrated",
    skillKey: SKILL_LABELS[group.skill],
    source: group.source,
    purpose: group.purpose,
    evidence: group.evidence,
    metrics: [
      { labelKey: "Сохранено музыкальных ответов", value: group.children.length },
      {
        labelKey: "Непустых музыкальных ответов",
        value: group.children.filter(
          (child) => child.status === "completed" && child.performedUnits > 0
        ).length
      },
      {
        labelKey: "Ответов с музыкальной помощью",
        value: group.children.filter((child) => child.help.length > 0 || child.visualAlternative)
          .length
      },
      {
        labelKey: "Ответов со слуховым свидетельством",
        value: group.children.filter((child) => child.auditoryVerified && !child.visualAlternative)
          .length
      }
    ]
  }));
}
function progressCohorts(
  history: readonly MusicResult[],
  filters: MusicProgressFilters,
  staged: readonly IntegratedSavedResult[]
): readonly MusicProgressCohort[] {
  const filter = {
    source: filters.source,
    purpose: filters.purpose,
    ...(filters.course === "all" ? {} : { course: filters.course })
  };
  const groups = [
    {
      evidence: "visual" as const,
      history: history.filter(
        (result) => result.course !== "harmony" && result.course !== "dictation"
      )
    },
    {
      evidence: "visual" as const,
      history: history.filter((result) => result.course === "harmony" && !result.aural)
    },
    {
      evidence: "aural" as const,
      history: history.filter(
        (result) => result.course === "dictation" || (result.course === "harmony" && result.aural)
      )
    }
  ];
  const standalone = groups.flatMap((group) =>
    summarizeMusicProgress(group.history, filter)
      .filter((summary) => summary.course !== "integrated")
      .map((summary) => ({
        id: `${summary.course}:${summary.inputSource}:${summary.purpose}:${group.evidence}`,
        course: summary.course,
        source: summary.inputSource,
        purpose: summary.purpose,
        evidence: group.evidence,
        metrics: [
          { labelKey: "Сохранено музыкальных ответов", value: summary.completedRuns },
          { labelKey: "Непустых музыкальных ответов", value: summary.nonemptyRuns },
          { labelKey: "Ответов с музыкальной помощью", value: summary.helpedRuns },
          { labelKey: "Ответов на новом материале", value: summary.newMaterialRuns },
          { labelKey: "Ответов со слуховым свидетельством", value: summary.auditoryRuns }
        ]
      }))
  );
  return [...standalone, ...childCohorts(history, filters, staged)];
}

export function ConnectedMusicCards({ onChoose }: { readonly onChoose: () => void }) {
  const music = useRuntimeSelector((runtime) => runtime.music);
  const {
    progressOpen,
    setProgressOpen,
    courseFilter,
    setCourseFilter,
    purposeFilter,
    setPurposeFilter
  } = music;
  const filters: MusicProgressFilters = {
    course: courseFilter,
    source: music.preferences.sourceFilter,
    purpose: purposeFilter
  };
  const cards = COURSES.map((course) => ({
    course,
    completedRuns: music.history.filter(
      (result) =>
        result.course === course &&
        (music.preferences.sourceFilter === "all" ||
          result.inputSource === music.preferences.sourceFilter)
    ).length,
    resumable:
      course === "integrated" &&
      music.integrated !== null &&
      music.integrated.state.completedPhases.length < 7
  }));
  const history = progressOpen ? mergeMusicHistory([], music.history) : [];
  const staged = progressOpen ? (music.integrated?.state.results ?? []) : [];
  const completedChildIds = new Set(
    history.flatMap((result) =>
      result.course === "integrated" ? result.state.results.map((child) => child.resultId) : []
    )
  );
  const pendingChildren =
    filters.course === "all" || filters.course === "integrated"
      ? staged
          .filter((child) => !completedChildIds.has(child.resultId) && childMatches(child, filters))
          .map(childView)
      : [];
  const onFilters = (patch: Partial<MusicProgressFilters>) => {
    if (patch.course !== undefined) setCourseFilter(patch.course);
    if (patch.purpose !== undefined) setPurposeFilter(patch.purpose);
    if (patch.source !== undefined) music.setPreferences({ sourceFilter: patch.source });
  };
  return (
    <>
      <MusicCourseCatalog
        cards={cards}
        progressOpen={progressOpen}
        onProgress={() => {
          setProgressOpen((open) => !open);
        }}
        onOpen={(course) => {
          music.open(course);
          onChoose();
        }}
      />
      {progressOpen ? (
        <MusicCourseProgress
          filters={filters}
          cohorts={progressCohorts(history, filters, staged)}
          pendingChildren={pendingChildren}
          rows={progressRows(history, filters)}
          onFilters={onFilters}
        />
      ) : null}
    </>
  );
}

export function ConnectedMusicPractice() {
  const music = useRuntimeSelector((runtime) => runtime.music);
  if (!music.active) return null;
  return (
    <MusicCoursePractice
      view={music.view}
      preferences={music.preferences}
      onPreferences={music.setPreferences}
      onCommand={music.command}
      onChoose={music.choose}
    />
  );
}
