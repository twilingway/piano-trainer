## Context

`ownsNote` (`src/practice/playableRange.ts`) — единственный признак «нота игрока» для сессии, звука
(`sessionAudio` планирует ноты, которых игрок не играет), отрисовки (`FrameState.owns`) и разбора
дубля. Выбор рук — `HandChoice` в `playerPrefs`, его показывают три места: `PlayerTopBar`,
`CompactPracticeChoices`, `PlaySettings`. `App.tsx` упирается в лимит 500 строк. Партии песни — из
`midi-part-roles`. Мотивация — в proposal.md.

## Goals / Non-Goals

**Goals:** партия — ещё одно условие в `ownsNote`, а не новый путь через сессию; автоаккомпанемент —
одно условие в той же точке, где программа решает звучать.

**Non-Goals:** выбор отдельных дорожек, микшер.

## Decisions

### D1. Партия сужает руку

`PracticeOptions.parts?: ReadonlySet<string>`: id партий выбранной роли. Опции получают
`hands = {рука роли}` и `parts`; `ownsNote(note, hands, playable, parts)` требует ещё и партию ноты.
Всё, что уже работает от `owns` (ожидание, счёт, удержания, сгорание, подсказки клавиш, картинки
рук), работает без изменений.

### D2. Звучит ли программа — `session.accompanies`

`accompanies(note) = !owns(note) && (прослушивание || accompaniment !== false)`. Им фильтруются
`autoNotes` сессии и планирование звука в `sessionAudio`. Отрисовка не меняется: чужие ноты
по-прежнему видны приглушёнными.

### D3. Выбор партии живёт в `useTrainer` и привязан к `song.parts`

Состояние `{ parts, role }` действует, пока `song.parts` — тот же массив и роль среди доступных.
Транспонирование копирует песню spread'ом, массив партий тот же — выбор сохраняется; новый файл даёт
новый массив — выбор пропадает. `choosableRoles` (`midiParts.ts`) отдаёт роли, если их больше двух.
`autoaccompaniment` — поле `playerPrefs`. В Ranked и словесном режиме партии не применяются и
`accompaniment` принудительно включён.

### D4. Один объект выбора для трёх мест интерфейса

`useTrainer` отдаёт `playChoice = { hands, onHands, parts }`, где `parts: PartsChoice | undefined`
(роли, выбранная роль, переключатель). `App.tsx` раскладывает его spread'ом в верхнюю панель и
раздел «Игра» — без новых строк. Общий код выбора (`choiceValue`, `chooseValue`, `PartOptions`)
лежит рядом с `HAND_CHOICES` в `CompactPracticeChoices.tsx`. Значение `<select>` для партии —
`part:<роль>`.

### D5. Дубль хранит партии

`Take.parts?: string[]` из опций сессии; `compareTake` передаёт их в `ownsNote`. Старые дубли без
поля разбираются по рукам.

## Risks / Trade-offs

- Выключенный аккомпанемент выключает и ноты своей руки вне диапазона клавиатуры игрока: они просто
  не звучат. Это ожидаемо для «игры в тишине».
- Кадровый цикл не меняется: признаки считаются при загрузке опций.
