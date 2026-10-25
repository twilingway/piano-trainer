# Проверка P5–P8

Ветка `feat/music-courses-p5-p8`, база `origin/dev` 78c20bc. Проверки выполняются в
`E:/MySource/ReactJS/pt-agents/music-courses-p5-p8`. Настоящая MIDI-приёмка ещё не проводилась.

## Соответствие исходной очереди

| Требование                                                              | Реализация                                                     | Проверка                                                                    |
| ----------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Общий score-first материал, seed, ритм и руки                           | `material.ts`, `random.ts`, существующие writer/parser/solver  | `material.test.ts`                                                          |
| Новизна между курсами и вкладками                                       | `novelty.ts`, `reserveMusicActivity`, прежний атомарный журнал | `novelty.test.ts`, `readingPersistence.test.ts`, `musicPersistence.test.ts` |
| P5: четыре уровня, изученные интервалы и группы                         | `sightReading.ts`                                              | `sightReading.test.ts`                                                      |
| P5: активный предпросмотр 5–15 с, позиция и manual start                | `sightReadingPreview.ts`, controller                           | `musicCourseController.test.ts`, браузер                                    |
| P5: чтение вперёд, WAIT без оценки ритма, TEMPO контроль                | `sightReadingScore.ts`, `musicPolicy.ts`, `progress.ts`        | `sightReading.test.ts`, `musicPolicy.test.ts`, `musicCourseRun.test.ts`     |
| P5: первый ответ о рисунке после контроля                               | `musicCourseControllerGroups.ts`                               | controller-тесты и браузер                                                  |
| P5: рекомендация пальца, без finger grading                             | существующий solver, явная учебная помощь                      | material/controller/UI-тесты                                                |
| P6: мажор/минор, тоники, обращения, функции, последовательности         | `harmony.ts`, `musicCourseExercise.ts`                         | harmony/exercise-тесты, транспозиция мелодии и скрытый последний аккорд     |
| P6: exact/class/bass и дубли                                            | `compareHarmonyChord`                                          | `harmony.test.ts`, `harmonyInput.test.ts`                                   |
| P6: физический hold, 200/201 мс, release, pedal и provenance            | `harmonyInput.ts`                                              | harmonyInput/Run/evidence-тесты; аппаратная часть отдельно                  |
| P6: сопровождение на общем времени                                      | существующая маршрутизация рук и PracticeSession               | Run/controller/Trainer-тесты                                                |
| P6: движение, минимум, допустимость и оптимальность отдельно от состава | `compareHarmonyTransition`, result view                        | `harmony.test.ts`, `musicCourseResults.test.ts`                             |
| P7: 2–8 нот, known/relative, раздельные показатели                      | `dictation.ts`, `dictationSession.ts`                          | dictation/Run-тесты                                                         |
| P7: полные/частичные старты, control quota 2, stale callback            | `phrasePreview.ts`, `dictationListening.ts`                    | phrasePreview/dictationSession/controller-тесты                             |
| P7: explicit finish, пустой ответ, visual fallback                      | controller, Run, UI                                            | Run/controller/UI-тесты, браузер                                            |
| P8: семь фаз, 16 реальных действий, отдельный финал                     | `integratedPlan.ts`, `IntegratedLesson`                        | integrated/controller-тесты и read-only reviewer harness всех действий      |
| P8: own-skill recommendations, minimum3/window12/diversity              | `integratedObservations`, `recommendIntegratedPhase`           | `integrated.test.ts`                                                        |
| P8: реальные тела дочерних ответов и resume границ                      | `EmbeddedMusicEvidence`, integrated persistence                | evidence/integrated/persistence/ConnectedMusicCourse-тесты                  |
| History: источники/помощь/обучение/слух раздельно                       | `progress.ts`, `MusicCourseProgress`                           | progress/UI/connected-тесты                                                 |
| Schema9: P1–P4, corrupt/future, preferences                             | reading migration, music slot                                  | migration/courseStores/musicPersistence-тесты                               |
| Один clock/adapter, отсутствие ordinary takes/рейтинга                  | `musicPolicy.ts`, `useMusicTrainer`, runtime                   | TrainerCourse/useTrainer/useMusicCourse integration-тесты                   |
| Raw/corrected/received, source proof, bounded journal                   | `MusicInputJournal`, native validators                         | evidence/RunEvidence-тесты; калибровка +100 мс и replay overlap             |
| RU/EN и уникальные catalog keys                                         | четыре music-каталога, существующий i18n                       | `musicControllerMessages.test.ts`, UI-тесты                                 |

## Ревью и исправления

Спецификация прошла независимый архитектурный аудит. Реализация прошла read-only review pure-core,
runtime, сохранения и асинхронных границ. Сквозной reviewer harness создал все 16 P8-действий через
настоящие классы PracticeSession/MusicCourseRun, создал дочерние тела и итог и подтвердил
native-валидацию. Это программная проверка, не аппаратный MIDI.

Закрыты найденные случаи: неверная принадлежность источнику после переименования записи, смешение
raw-аудио и corrected-ввода при калибровке, ложный ноль групп без наблюдения, независимый вопрос
группы после контроля и отсутствие отдельной оценки диапазона перехода. Счётчики групп P8 сверяются
с журналом; без сопоставленных нот P5 время/удержание не считаются измеренными. Итог P8
восстанавливается без повторного сохранения. Повторный независимый review препятствий для архивации
не обнаружил.

## Программная и браузерная приёмка

`pnpm check` прошёл: 443 файла, 4130 тестов; 3 файла/10 тестов пропущены прежними условиями.
Дополнительно прошли 23 проверки с React Compiler и production build. `pnpm spec:validate` — 73
passed, 0 failed. Предупреждения относятся к прежним артефактам. После HMR runtime-контекстов
выполнялась свежая загрузка. Данные пользователя не очищались для проверки значений по умолчанию.

Стенд: `http://localhost:5192/?music-courses-qa=goal`, отдельный browser context `music-courses-qa`.
Данные стенда пользователя на 5190 не сбрасывались. Снимки сохраняются локально в основной папке
`.browser-artifacts/music-courses-spec/` и в Git не входят.

| Сценарий видимого Chrome                           | Наблюдение                                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P5 training: позиция, WAIT, явное завершение       | Сохранена фактическая нота; неизмеренные показатели не выдаются за точность                                                                                                |
| P5 control: preview, TEMPO, ошибочный выбор группы | Стан закрыт до manual start; позиция меняется по кадрам; первый неверный выбор сохранён как 1 ошибка, native history row создан                                            |
| P6: тон/полутон и удержанный C major               | Отдельные pointer-control и keyboard-training записи; DOM input проходит hold/release                                                                                      |
| P7: полный эталон, две атаки, explicit finish      | До ответа SVG нет; после — эталонный стан и два списка реальных нот; метрики разделены                                                                                     |
| P8: все семь фаз через интерфейс                   | В IndexedDB 16 разных дочерних действий и ровно один native parent, 7 completedPhases                                                                                      |
| P8: reload после поиска клавиш и после финала      | Границы и итог 7/16 восстановлены; число детей/родителей не растёт                                                                                                         |
| 320×568, 390×844, 667×375 и desktop                | RU/EN, каталог, прогресс, настройки и активный P5; горизонтального overflow и пересечения панели/стана/клавиш нет                                                          |
| Недоступный звук                                   | В отдельном контексте временно включён mute через существующий Tone API: есть повтор и зрительный путь; после визуального ответа слуховая история пуста; mute восстановлен |
| Ошибка стана                                       | В отдельном контексте временно отклонён OSMD.load: видны ошибка и повтор; после восстановления метода повтор успешно показывает SVG                                        |
| Существующий P1                                    | Из библиотеки открыты отдельные ноты, запущен WAIT, обработан ввод, music UI отсутствует; старые P1–P4 также покрыты полным suite и compiler-проверками                    |

Нажатия автоматизированы через компьютерную клавиатуру/DOM; исходные данные генератора
использовались как тестовый ответ. Это проверяет интерфейс, runtime и сохранение, а не игру человека
или аппаратный MIDI. Проверены наблюдения аудиодвижка и переходы UI; слышимость инструментом не
подтверждена. Контролируемые ошибки вводились только в отдельной тестовой вкладке; исходники и
сохранённые пользовательские настройки не подменялись.

Основная тестовая вкладка после свежей загрузки не содержит console errors. Аппаратная матрица и
ограничения аудионаблюдения — `docs/MUSIC_COURSES.md`. Остаётся публикация PR/обязательный CI и
отдельная совместная MIDI-приёмка.
