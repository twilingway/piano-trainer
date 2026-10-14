# Design

## Context

База dev d863da1 включает #158. TwoHandSession принимает только пару и ждёт полного release;
waitingPairForCommit допускает только две due ноты. Обычный wait засчитывает down независимо от
физического удержания. seek сбрасывает session-статистику, terminal событие Trainer останавливает
игру и вызывает silence/cancel. Поэтому простой повтор pair-policy не реализует held bass. См.
proposal/specs и read-only аудиты spec_architect/explorer в verification.md.

## Goals / Non-Goals

**Goals:** отдельное чистое доказательство всего фрагмента; ограниченные шаги onset в одном clock;
повтор текущего Song без rollback приватных status maps; безопасная schema7; тонкие shell/view.

**Non-Goals:** расширять TwoHandSession tagged union, считать удержание по sounding/педали,
создавать музыкальный timer в React, вводить tempo-judgement/новый аудиодвижок или зависимости.

## Decisions

### 1. Генератор и сцена одного фрагмента

HeldBassExercise содержит десять описаний и generatorVersion1: пять длины2, пять длины4, басовые
квоты2 на высоту. RH имеет тридцать четвертей в допустимом диапазоне, повтор высоты допустим;
специальной квоты RH не обещаем. Seed и порядок воспроизводимы, nextSeed исключает прежнюю серию.
Текущий фрагмент сам является MusicXML/Song: G/F staves, 4/4, implicit короткий такт длины2 либо
полный длины4. Bass и первый RH onset0, далее RH на integer beats. NoteIds сверяются с parsed Song.

Одновременно Trainer держит только текущий Song/PracticeSession. Retry создаёт новый run и свежую
Song identity того же фрагмента; предыдущие course-results остаются в HeldBassSession. Следующий
Song появляется только после final proof предыдущего. Это один clock в каждый момент, не десять
параллельных clocks. Whole selection object входит в helper выбора, учитывая React Compiler и ошибку
same-seed replay #158. UI seed/index и runtime generation token не выводятся из массива hit.

Альтернатива whole-series Song потребовала бы checkpoint отката текущего диапазона и статистики; для
первого среза это лишний риск. Простое seek всей серии теряло бы ранее решённые фрагменты.

### 2. Отдельный pure HeldBassSession

Типы/генератор/evaluator/progress/validator располагаются отдельными модулями src/reading, каждый
production файл≤500 строк. State: unpresented → initial → melody step → terminal hold →
release/horizon → accepted; ошибка → full-release → fresh retry. Пауза/route loss отменяет текущую
попытку, не создавая учебную ошибку или успех. Завершённый журнал курса сохраняется.

Первое начало использует существующие raw freshness/origin/owner правила. Далее active не
ограничивается practice.waiting: up баса проверяется и во время движения clock. RH принимается
только когда её onset уже наступил на corrected timestamp в временной карте PracticeSession. Во
время двух RH held legato допустимо; третья отличная RH-held высота запрещена. Подсчёт высот
агрегирован по владельцам; один pitch не превращается в две ноты при второй pointer identity.
Очередная одинаковая RH требует last physical up → new down. Third-note после последней RH или
неожиданный новый bass down — ошибка текущей попытки. Нет скрытой очереди будущих атак.

Альтернативы: up-before-next запрещал бы обычное legato, произвольные накопленные RH высоты
превращали бы мелодию в аккорд. Max2 RH — явно учебное правило, не оценка техники.

### 3. Проверенные onset и временная карта

PracticeSession остаётся владельцем SongTimeline из src/practice/timing. Его существующие чтения
songTimeAt/performanceTimeAt переиспользуются; bounded экспорт необходимых clock anchors/wait
crossings добавляется только если текущего read API недостаточно для proof. История не продвигает
музыку. Минимальные входы: чистые down/up, raw/corrected/received, реальные presentation/activity
receipts и clock transitions из PracticeSession. Clock trace не строится по предположению «игрок
ждал N секунд», React не интегрирует elapsed для музыкального конца.

Новый ограниченный verified-onset commit допускает exact current group: два ID на первом шаге, один
на следующих. Registered fragment/run/step и текущая due форма обязательны. Paused, finished, stale
run, future/subset/duplicate ID, time<lastPerformanceMs и обычный song режим отклоняются без
мутации. Прежний commitWaitingGroup и его pair guard сохраняют свои ограничения. Общий private
commit-pass можно разделить, но публичные guards остаются раздельными.

Допустимое начало/следующая RH сначала preliminary; продвижение onset только после raw-watermark
now>lastAcceptedAttackRaw+250 мс и проверки всей полученной истории. На commit clock
перепривязывается только в PracticeSession. Late bass-up может отменить уже продвинутые steps: они
никогда не были итоговым педагогическим зачётом, весь current Song безопасно повторяется.

При движении к onset wait freezes на его точной границе. При музыкальном end бас проверяется по
raw−fixedOffset в общей карте, raw end boundary получается из того же clock. Terminal policy
получает correctedEndPerformance из реально достигнутого clock crossing, rawEnd равен
correctedEndPerformance+fixedOffset. UI просит release только после actual musical end и now≥rawEnd;
RH readiness cue также не обещает приём до corrected-now≥onset. Проверка готовности между кадрами
учитывает pending onset и его точную freeze boundary, не текущий callback snapshot. Компенсация
применяется один раз; она не изменяет музыкальную скорость или начальное raw-окно200 мс. Terminal
policy блокирует стандартный finish/silence/recording callback до полного release+horizon: сама
PracticeSession может прекратить продвижение, но Trainer продолжает обслуживать physical up и
bounded delivery proof, не отменяя кандидат своим автоматическим finish. Пользовательская пауза
по-прежнему отменяет его. Только final accepted отдаёт course completion/следующий фрагмент. Это
явный terminal gate исключительно held-bass режима; ordinary и pair finish не меняются.

### 4. Raw replay, границы и память

Музыкальный конец — crossing song.duration (2/4 доли), не PracticeSession.finished: обычный finish
включает inputGrace и не определяет длительность баса. Отдельный тест исключает прибавление этих250
мс к notated hold end; readiness между15/60 FPS сверяется с freeze boundary.

События сортируются по raw, tie — delivery order; first attack фиксирует offset всей попытки. Raw
проверяет origin, freshness, presentation/activity и физическое held; corrected проверяет положение
в clock. Gate включает travelling/terminal hold, после musical end down запрещён. Preheld до
предъявления не становится атакой; local cancel сохраняет прочих физических owners, global
input-loss очищает их. Expired matching up251 отменяет попытку и снимает только того старого
владельца; старый up до новой атаки её не снимает. Future raw не меняет held.

На попытку максимум256 input событий,64 clock transitions и64 receipts активности/показа.
Переполнение отменяет кандидат без ложного успеха, требует полного release и нового начала; invalid
result без такого bounded proof не сохраняется. Terminal final после обеих границ: musical end
достигнут, all-release доказан, now>max(rawEnd,lastPhysicalRelease)+250. На rawEnd равенство
достаточно; off за1 мс до end — early hold, включая out-of-order delivery.

Strict validator восстанавливает generator/Song, step IDs, допустимые anchors/frozen waits,
подтверждённые commit timestamps и input replay. Clock trace не может содержать ускорение, прыжок
вперёд, отрицательную скорость или независимый elapsed. Final proof и помощь проверяются вместе;
отсутствие trace или невозможная музыкальная длина не заменяются success boolean.

### 5. Shell, звук и помощь

Trainer получает соседнюю scoped policy, взаимно исключённую с pair/rhythm/ordinary reading. Raw
down/up перехватываются до ordinary judgement/recorder. useHeldBassCourse владеет lifecycle и
связывает курс, current Song, hints/receipts, persisted result. App не расширяется логикой. Каждый
callback несёт run/fragment/presentation/step identity. Закрытие окна отменяет кандидата и после
реального full-release начинает свежий current fragment, сохраняя помощь и course-журнал.

Клавиатура ПК звучит в useKeyInput, pointer в useTrainer, MIDI на физическом пианино; новый
evaluator не создаёт собственного звука. Педаль может поддерживать audible звук, но physical up
всегда поступает оценщику. Pause/exit отключают программный звук без ghost bass; при возобновлении
не посылаются искусственные bass-on от preheld. Новая кнопка не запускает сервер/аудио сама.

Помощь5/10 секунд относится к активному waiting актуального шага, не к travelling/end. Однократно
показанный уровень сохраняется в attempt/fragment, даже если курсор идёт дальше; новый шаг не
получает автоквитанцию старого текста. Ручная помощь показывает текущую цель, имена после staff/text
render, клавиши после Pixi frame receipt. Whole XML остаётся стабильным между шагами, меняются
cursor/highlight и актуальный hint-layer, чтобы не перерисовывать OSMD на каждом кадре. Сцена на
мобильном экране учитывает высоту двух станов по опыту #158.

### 6. Локальное сохранение и доставка

Schema7 добавляет heldBass без изменения database/store/key; reading.activeCourse получает отдельный
held-bass mode. Миграции1–6 идемпотентно добавляют defaults, сохраняют siblings, legacybackup,
observations/schedules P2 и coordination без переклассификации их результатов. Новый validator
независим от simultaneous proof; history20 с dedupe resultId/runId, source filter по успешной
попытке со всей предшествующей историей. Dates calendar отделены от performance/clock offsets;
missing medians остаются null. Профиль адаптации не расширяется.

Atomic merge использует changed-field guards, защищает другие вкладки и late hydrate.
Abort/quota/corrupt/future version показывают ошибку и не перезаписывают неизвестные поля. Rollback
schema6 встретит future schema7 и должен оставить blob нетронутым, работать в памяти; это
проверяется migration tests, а не ручной очисткой storage.

## Risks / Trade-offs

- [Конец Song отменит held до proof] → отдельный scoped terminal gate и тест отсутствия silence/
  onRunFinished до release, ordinary/pair regressions.
- [Out-of-order up или freeze делает длительность ложной] → replay input с настоящей временной
  картой и watermark, 15/60 FPS и offset tests.
- [Retry теряет previous results или переносит помощь] → current-fragment Song и независимый course
  journal, run/step-bound receipts, stale callback и compiled same-seed test.
- [Раннюю верную ноту игрок принимает за зависание] → явная причина ошибки, full-release и курсор
  начала; не засчитываем удержанную future ноту автоматически.
- [Три held мелодические ноты похожи на legato] → правило max2 объясняется в знакомстве; нет
  обещания проверки артикуляции, длительности RH или пальца.
- [Реальное устройство ещё не проверено] → пользователь отложил hardware до общего прохода;
  docs/MIDI_COURSE_ACCEPTANCE.md и открытая acceptance задача без ложного pass.

## Migration Plan

1. Подтвердить concrete proposal, не начинать production до ответа.
2. Реализовать и проверить pure generator/evaluator/clock/validator и scoped policy.
3. Добавить sibling schema7 и RU/EN интерфейс; проверить regressions и браузер ветки.
4. Опубликовать task PR в dev; после пользовательского merge ff-only обновить основной5190.
5. После всех шагов провести общую аппаратную приёмку с игроком; архивировать только честно
   завершённые изменения. Main/release — отдельная задача пользователя.
