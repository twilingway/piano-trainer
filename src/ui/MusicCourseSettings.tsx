import { useI18n } from "../app/useI18n";
import type { MusicCoursePracticeProps } from "./musicCourseTypes";

const HARMONY_LESSONS = [
  ["tone-semitone", "Тон и полутон"],
  ["triads", "Трезвучия"],
  ["inversions", "Обращения аккордов"],
  ["functions", "Функции аккордов"],
  ["progressions", "Аккордовые последовательности"],
  ["accompaniment", "Сопровождение мелодии"],
  ["voice-leading", "Плавное голосоведение"]
] as const;
function SettingSelect<Value extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly (readonly [Value, string])[];
  readonly onChange: (value: Value) => void;
}) {
  const { t } = useI18n();
  return (
    <label>
      {t(label)}
      <select
        value={value}

        onChange={(event) => {
          const selected = options.find(
            ([candidate]) => String(candidate) === event.currentTarget.value
          );
          if (selected) onChange(selected[0]);
        }}
      >
        {options.map(([candidate, key]) => (
          <option key={candidate} value={candidate}>
            {t(key)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MusicCourseSettings({
  view,
  preferences: prefs,
  onPreferences
}: MusicCoursePracticeProps) {
  const { t } = useI18n();
  return (
    <details className="music-course-settings">
      <summary>{t("Настройки музыкального курса")}</summary>
      <p className="reading-muted">{t("Изменения задания применятся к следующему запуску.")}</p>
      <fieldset>
        <legend>{t("Следующее музыкальное задание")}</legend>
        <SettingSelect
          label="Режим музыкального задания"
          value={prefs.purpose}

          options={[
            ["training", "Учусь с подсказками"],
            ["control", "Проверяю себя без подсказок"]
          ]}
          onChange={(purpose) => {
            onPreferences({ purpose });
          }}
        />
        <SettingSelect
          label="Ввод в музыкальном курсе"
          value={prefs.inputSource}

          options={[
            ["midi", "MIDI-инструмент"],
            ["keyboard", "Клавиатура компьютера"],
            ["pointer", "Клавиши на экране"]
          ]}
          onChange={(inputSource) => {
            onPreferences({ inputSource });
          }}
        />
        <SettingSelect
          label="История музыкального курса"
          value={prefs.sourceFilter}

          options={[
            ["all", "Все способы музыкального ввода"],
            ["midi", "MIDI-инструмент"],
            ["keyboard", "Клавиатура компьютера"],
            ["pointer", "Клавиши на экране"]
          ]}
          onChange={(sourceFilter) => {
            onPreferences({ sourceFilter });
          }}
        />
        {view.course === "sight-reading" ? (
          <>
            <SettingSelect
              label="Материал чтения с листа"
              value={prefs.sightLevel}

              options={[
                ["notes", "Одиночные звуки"],
                ["steps", "Ступенное движение"],
                ["triads", "Трезвучные группы"],
                ["two-hands", "Короткая фраза двумя руками"]
              ]}
              onChange={(sightLevel) => {
                onPreferences({ sightLevel });
              }}
            />
            <label>
              {t("Предпросмотр перед чтением, секунд")}
              <input
                type="number"
                min={5}
                max={15}
                step={1}
                value={prefs.sightPreviewSeconds}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (Number.isInteger(value) && value >= 5 && value <= 15)
                    onPreferences({ sightPreviewSeconds: value });
                }}
              />
            </label>
          </>
        ) : null}
        {view.course === "harmony" ? (
          <>
            <SettingSelect
              label="Тема урока гармонии"
              value={prefs.harmonyLesson}
              options={HARMONY_LESSONS}

              onChange={(harmonyLesson) => {
                onPreferences({ harmonyLesson });
              }}
            />
            <SettingSelect
              label="Действие с аккордом"
              value={prefs.harmonyMode}

              options={[
                ["build-chord", "Построить аккорд"],
                ["name-chord", "Назвать аккорд"],
                ["invert-chord", "Сыграть обращение"],
                ["complete-progression", "Дополнить последовательность"]
              ]}
              onChange={(harmonyMode) => {
                onPreferences({ harmonyMode });
              }}
            />
            <label>
              <input
                type="checkbox"
                checked={prefs.harmonyAural}
                onChange={(event) => {
                  onPreferences({ harmonyAural: event.currentTarget.checked });
                }}
              />
              {t("Определять аккорд на слух")}
            </label>
            <label>
              {t("Основной звук аккорда")}
              <select
                value={prefs.harmonyRoot}
                onChange={(event) => {
                  const harmonyRoot = Number(event.currentTarget.value);
                  if (Number.isInteger(harmonyRoot) && harmonyRoot >= 48 && harmonyRoot <= 72)
                    onPreferences({ harmonyRoot });
                }}
              >
                {Array.from({ length: 25 }, (_, index) => index + 48).map((pitch) => (
                  <option key={pitch} value={pitch}>
                    {musicCourseNoteLabel(pitch, t)}
                  </option>
                ))}
              </select>
            </label>
            <SettingSelect
              label="Лад трезвучия"
              value={prefs.harmonyQuality}

              options={[
                ["major", "Мажорное трезвучие"],
                ["minor", "Минорное трезвучие"]
              ]}
              onChange={(harmonyQuality) => {
                onPreferences({ harmonyQuality });
              }}
            />
            <SettingSelect
              label="Расположение аккорда"
              value={prefs.harmonyInversion}

              options={[
                [0, "Основной вид аккорда"],
                [1, "Первое обращение аккорда"],
                [2, "Второе обращение аккорда"]
              ]}
              onChange={(harmonyInversion) => {
                onPreferences({ harmonyInversion });
              }}
            />
            <SettingSelect
              label="План аккордовой последовательности"
              value={prefs.harmonyProgression}

              options={[
                ["I-IV-V-I", "Последовательность I–IV–V–I"],
                ["I-V-vi-IV", "Последовательность I–V–vi–IV"]
              ]}
              onChange={(harmonyProgression) => {
                onPreferences({ harmonyProgression });
              }}
            />
          </>
        ) : null}
        {view.course === "dictation" ? (
          <>
            <label>
              {t("Количество нот диктанта")}
              <input
                type="number"
                min={2}
                max={8}
                step={1}
                value={prefs.dictationLength}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (Number.isInteger(value) && value >= 2 && value <= 8)
                    onPreferences({ dictationLength: value });
                }}
              />
            </label>
            <SettingSelect
              label="Опора в начале диктанта"
              value={prefs.dictationStartMode}

              options={[
                ["known", "Первая нота известна"],
                ["relative", "Любая начальная нота"]
              ]}
              onChange={(dictationStartMode) => {
                onPreferences({ dictationStartMode });
              }}
            />
          </>
        ) : null}
      </fieldset>
    </details>
  );
}

export function musicCourseNoteLabel(pitch: number, t: (key: string) => string): string {
  const names = ["до", "до♯", "ре", "ре♯", "ми", "фа", "фа♯", "соль", "соль♯", "ля", "ля♯", "си"];
  return `${t(names[pitch % 12] ?? names[0] ?? "")}${String(Math.floor(pitch / 12) - 1)}`;
}
