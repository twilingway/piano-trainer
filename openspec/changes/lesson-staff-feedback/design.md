# Подтверждённая обратная связь на стане

## Context

Правильность уже определена чистыми sessions/policies. Единого accepted-hit callback для всех восьми
панелей нет: независимые ритмы имеют свои outcomes, а аккорды музыкального курса принимаются в
frame. Одиночный reading prompt локально перенумеровывает beat и немедленно меняет XML после
правильного ответа. Нельзя повторно угадывать правильность по сырому MIDI.

## Goals / Non-Goals

Цель — декоративный эффект у подтверждённой головки с прежним порядком урока. Не менять grading,
timers/clock pure core, MusicXML transforms, OSMD измерение, записанные предпочтения либо
scene-эффекты обычных песен.

## Decisions

- Общий ephemeral source с типизированным receipt:
  `{runId,presentationId,receiptId,notes:[{noteId,staffBeat,pitch}]}`. Он создаётся стабильно в
  usePlayerRuntime до hooks и передаётся им как optional sink. Подписка не переигрывает прежний
  receipt. Renderer отсекает дубликаты после проверки текущей готовой presentation: Set noteId
  только для неё, без истории предыдущих runs/presentations. Очистка новой серии/выхода не
  переживает reload. Это UI-доставка, не Redux/localStorage и не новая оценка.
- Точный public контракт source находится в отдельном небольшом файле рядом со staff helpers, без
  DOM/React/timers; renderer и app-адаптеры используют одну реализацию. Отказ декоративного listener
  не должен ломать нажатие или прогресс.
- Адаптеры испускают только уже принятый результат синхронно до publish/смены prompt. Reading RH/LH:
  возвращённая ReadingSession.answer с равными expected/played. TwoHand: accepted onCommit.
  HeldBass: подтверждённый acknowledgeOnset, только новый onset. IndependentRhythm: переход authored
  outcome в hit в cachePhase. Interval: correct answerPitch в see-and-play. Rhythm: attack kind=hit.
  Music: hit из input; аккорды — принятый HarmonyChordInput в frame. Ноты
  сопровождения/прослушивания и ответы без показанной сыгранной ноты не испускаются.
- Использовать идентичности реального run/presentation и authored note IDs. Для обычного reading
  prompt beat берётся из prompt, не из исходной песни. Для других панелей — координата действительно
  показанного authored score. Не использовать raw время нажатия как координату ноты.
- Отдельный императивный overlay-владелец рядом со Staff захватывает старые head rects через
  indexNotes/markKey ДО перерисовки. Overlay — sibling staff-page, не часть измеряемого SVG ink. Он
  переживает обычную замену XML, но очищается на новой серии/выходе/ошибке/hidden. Staff.tsx
  получает только тонкое подключение; courseStaffView/offscreen helpers не меняются.
- Короткая CSS-анимация — обратная связь интерфейса и не продвигает музыкальное время. Она не
  перехватывает указатель/фокус; reduced motion — статическое выделение. Нет создания
  Text/Graphics/texture в кадровом цикле.
- ReadingDisplayProfile принудительно задаёт flatNoteBurning/flatPressEffects/noteParticles=false
  только для effective view. Все practiceActive уже проходят через него. Базовые pressed tint и
  travel в KeyboardLayer независимы от этих flags; saved StaffPrefs не меняются.

## Risks / Trade-offs

- Нота пропадает при смене XML → синхронный захват старой геометрии и независимый overlay lifecycle.
- Stale/double receipts → идентичности presentation/run, дедупликация и явная очистка.
- Частичный аккорд/held кадры → события только после реального accepted, tests каждого канала.
- Неполный визуальный источник/ошибка OSMD → отсутствие эффекта, без блокировки урока.
- React нагрузка → стабильный source и императивная подписка, без общего rerender на каждый кадр.
- Пересечение с метками октав → профиль сохраняет остальные preferences через spread; не меняет их
  флаги.

## Migration Plan

Миграции нет: новый эффект не сохраняет данных. Откат не затрагивает результаты упражнений или
пользовательские настройки. Новые строковые подписи, если потребуются, локализуются сразу.

## Уточнения архитектурного ревью

- HeldBass acknowledgeOnset возвращает void и может отменить prompt даже при accepted=true.
  Публиковать feedback можно только после проверки фактически добавленного нового onset и
  неотменённого post-ack snapshot. Самого boolean callback недостаточно.
- Показ подсказки не является принятым исполнением; правильный ответ после подсказки по-прежнему
  может вспыхнуть после принятия упражнением. Никакого нового наказания за подсказку нет.
- indexNotes объединяет одинаковые beat/pitch разных станов и голосов. Авторский noteId receipt не
  даёт права подсветить всю такую группу. Нужна однозначная привязка конкретной головки; если её
  доказать нельзя, эффект безопасно пропускается. Обязателен DOM-тест унисона.

## Контракт доставки после уточнения ревью

Transport имеет publish(receipt), clear() и subscribe(listener): unsubscribe. Event — union
accepted(receipt) | clear. Подписка синхронна и без replay; каждый listener изолирован от
исключений. Dedupe принадлежит renderer после проверки готового presentationId, а не transport:
stale receipt не сбрасывает Set текущей presentation. Обычная смена presentation сбрасывает лишь
этот Set, сохраняя уже захваченные вспышки. clear очищает вспышки и инвалидирует текущий
presentationId до готовности другого id. Это закрывает окно между domain reset и React commit, без
present() в семи адаптерах и без неограниченной истории receipt.

## ?????????? ??????????

usePracticeCourses ??????? ???? ?????????? transport ????? ????? ?????????? ? ????????? ????? 500
????? usePlayerRuntime. Overlay ????? fixed viewport ?????? ????????? Staff, ????????? ??
staff-page; bounds ??????????? ??? scroll/resize ? ???????????? relayout. ??? ?? ????????? scroll
extent ???? ??? ?????? ??????? ????????? ?????. ?????????? Rhythm ?? ??????? ????? transport: cancel
????????? ???????? ???????? ??????/run/session. ???? ????????? lifecycle ???????? ?????????? ?????
???????????? ??????????????? ? ????????.
