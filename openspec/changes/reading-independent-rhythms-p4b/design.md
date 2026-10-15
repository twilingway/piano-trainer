# Design

## Context

База18fda9e после merge159. Есть RhythmSession для10 ударов без высоты, HeldBassSession WAIT для
удержания и реальные timestamps/owners. Для двух TEMPO рук они не взаимозаменяемы: RhythmSession
решает один onset, processRhythmKey remap всех pitches в60; held-bass clockReceipt обрезает время на
nextDue даже в TEMPO. Нужны соседний pure evaluator и отдельный observer, а не расширение WAIT guard
или повторный musical clock.

## Goals / Non-Goals

Цель — простые два onset-ряда после проверенного пульса:8 четвертей C4, затем24 атаки C3/C4. Не
оцениваем физическую длительность, legato, пальцы, смену высот и чтение новых фраз. Не добавляем
TEMPO рейтинг, аккомпанемент, зависимости, сервер, адаптацию или постоянный mastery gate.

## Decisions

### 1. Пульс — текущая подготовка

Проверка8 четвертей60BPM/±150/0extra перед каждым проходом соблюдает требование roadmap «после
устойчивого пульса». Порог явно учебный. Результат P4a с паузами/половинными не доказывает этот
рисунок, поэтому не используется как сохранённый допуск. Неуспешная проверка не сохраняется в
историю основной серии. Успешная хранится в памяти до финала; после прерывания исчезает.

Курс содержит состояния preparation → pulse-count-in → pulse-playing → pulse-finalizing →
pulse-failed либо two-hands-preparation → count-in → playing → finalizing → result; cancel
возвращает preparation. Игрок запускает каждую фазу вручную. Между ними полный физический release,
новый presentation и свежий Song. Только одна PracticeSession активна в каждый момент; journal не
является clock.

Восемь предварительных hit не открывают вторую фазу: допуск выдаётся только после конца pulse Song и
закрытого delivery horizon. Поздний extra внутри corrected domain отменяет этот допуск.

### 2. Генератор и эталон

Seed/version1 выбирают порядок multiset A,A,B,B из6 возможных перестановок. NextSeed ищет
отличающийся порядок. A: LH C3 halves/RH C4 quarters; B зеркален. Два стана,4/4,60BPM,4такта,
Song.duration16с,24 notes,12 на руку,8 joint groups+8 singleton. Pulse Song:2такта8четвертей C4,
duration8с, вторая партия пустая. Полный отсчёт каждой фазы4с — часть PracticeSession lead-in, а не
MusicXML сыгрываемой серии. XML является источником IDs/onsets/durations; OSMD только рисует.

### 3. TEMPO proof

Новый `tempoClockReceipt(atMs)` использует реальный SongTimeline snapshot и end crossing без nextDue
clipping. Он явно различает songTime at receipt, start/end performance и действующие active
segments. Для атаки проектируется corrected performance=raw−fixedOffset по историческому clock. В
отсчёте активный clock позволяет первый hit с musical−150..0мс; до−150 ввод не оценивается. Pause
segments не допускают оценки, resumedclock не продолжает отменённый курс.

Границы tempo proof нельзя строить по React wall elapsed, свободному setInterval или флагам
«готово». Input0..250мс age включительно; future игнорируется,251matchingup отменяет и очищает
только старого owner. Упорядочивание по raw timestamp, затем delivery sequence; repeat и preheld
блокируются через реальные ownership snapshots/release-prefix tombstones.

Pure evaluator replay назначает nearest unmatched same pitch в±150 inclusive, затем derived hand из
score; raw event не утверждает физическую руку. Два члена joint имеют два hit/miss. Только когда
реальный clock пересёк onset+150мс, а now строго позже performance этой границы плюс
max(0,fixedOffset)+250мс, miss необратим. Положительный offset продлевает raw delivery deadline;
отрицательный не позволяет закрыть miss до реального crossing. Для tie более ранний onset, затем
noteId.

Grade domain corrected∈[−150мс,duration); pitch вне C3/C4 даёт extra неизвестной руки, не
подставляет ближайшую руку. Известная лишняя C3/C4 относится своей нотной партии. После конца новые
down не оцениваются, но ownership остаётся физическим. Поскольку up duration не оценивается, финал
не ждёт all-up: после actual endPerformance+max(0,offset)+250мс строго `>` сохраняется итог.
Следующий старт всё равно ждёт полного release.

Bounded proof каждой фазы:256 input events,64 clock anchors,32 presentation/help receipts; overflow
отменяет без результата, без молчаливого усечения «валидной» истории. Итог содержит обе фазы, fixed
calibration/origin, actual clocks/input/help, phase/run/presentation identities.

### 4. Shell и звук

Для MIDI выбранное устройство известно до старта. Канал1–16 фиксируется первым доставленным свежим
Down работающей фазы внутри grade-domain с допустимыми timestamps, даже при wrong pitch. Порядок
доставки фиксирует origin необратимо; поздний более ранний raw другого канала не переключает его. На
первой wrong ноте возникает extra; невыбранные каналы не решают gate. Подготовительный ввод до−150мс
не фиксирует канал. Выбранный канал показывается игроку.

Отдельная Trainer policy наблюдает исходные Down/Up до обычного pressKeyAt и не вызывает remap60,
verified WAIT commit или pair guard. TEMPO обе руки/speed1/countIn4/noaccompaniment/noteResultfalse,
обычный дубль и рейтинг отключены. Собственные hit/miss/extra marks не смешиваются с обычными stats.
Terminal gate обслуживает actualclock/delivery и исходные Down/Up до закрытия горизонта, включая
поздний Down с corrected временем внутри grade-domain; не объявляет успех по
`PracticeSession.finished`, где присутствует input grace. После final root останавливает Trainer.
Явная Pause отменяет, даже если session.finished уже true.

Существующий audio путь играет действительную нажатую высоту выбранного инструмента; обучение не
синтезирует вторую руку. Подготовка содержит две позиции/действующие назначения, опциональную
подсветку фактического кадра и предупреждение о mouse/rollover. Метроном слышен по clock. Изменение
калибровки, speed/origin, окно/hidden/device loss/pointercancel отменяет обе фазы без результата.
Stale sound/Staff/policy callbacks привязаны к current session/presentation и не запускают новый.

### 5. Сводка и сохранение

Итог основной серии содержит успешный pulse proof,24 note outcomes, extra, early/late count, signed
и absolute medians deviation отдельно LH/RH. Spread8joint только при2hit; null для пустой выборки.
Wrong octave extra имеет unknown hand, остаётся в общей extra summary; не помечается ошибкой
неподтверждённой физической руки. Не называем эти числа PERFECT/mastery или самостоятельным чтением
неизвестных нот. Фильтр по выбранному source сохраняет все события.

Schema8 sibling `independentRhythm` того же IDB key. Миграции1–7, history20, replay всех метрик и
успешного gate; immutable deep copies. Atomic merge/hydration/abort/quota/future/corrupt/rollback7
повторяют проверенные contracts прежнего reading repository. Pulse permit/phase/owners не
персистятся; restart/reload всегда начинается остановленным pulse-check. P2 отдельно.

## Risks / Trade-offs

- ±150 каждой руки допускает spread300; это честная onset оценка, spread отдельная метрика.
- Onset-only половинную можно отпустить рано; UI должен прямо объяснить отсутствие оценки up.
- Требование8/8 может требовать повторов; есть понятный переход к «Ритму», без заявления mastery.
- Прямой reuse прежних RhythmSession/clockReceipt дал бы ложные hit или замороженное время.
- ПК rollover/мультитач/реальные MIDI и слышимость — отдельная пользовательская приёмка.
- История с proofs больше прежней; IDB хранит20 и bounded evidence, не localStorage.

## Migration Plan

Proposal/specs/design/review и draft PR → подтверждение материальных правил → pure генератор и
evaluator с tests → tempo observer/clock tests → schema8 и replay tests → RU/EN/UI/Compiler/browser
→ pnpm check/spec gate → task PR в dev → user merge/ff-only5190. Аппаратные пункты общего
MIDI-чеклиста остаются после всех шагов; change до них не архивируется. Новых зависимостей нет.

## Подтверждение перед реализацией

Production заблокирована до подтверждения предложенного gate8/8,60BPM,±150,onset-only/spread, отмены
всего прохода и schema8. После подтверждения задачи ниже применяются к этой конкретной конфигурации;
при изменении параметра proposal/specs/design/tasks пересматриваются до кода.
