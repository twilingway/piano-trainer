## Context

Стан рисует OSMD из `song.musicXml`; проходы (аппликатура, названия, аккорды, переносы) связывают
ноты песни с элементами `<note>` по `SongNote.sourceIndex`. У MIDI-песни `musicXml` нет.
`transcribeTake` (`src/recording/transcribe.ts`) уже пишет двухнотоносную партитуру по сетке
шестнадцатых для дубля. `transposeSong` перечитывает песню из транспонированного MusicXML, если он
есть. Мотивация — в proposal.md.

## Goals / Non-Goals

**Goals:** одна чистая запись партитуры для дубля и MIDI; MIDI-песня сохраняет свои ноты.

**Non-Goals:** триоли, полифония на нотоносце, темп и динамика.

## Decisions

### D1. `src/song/scoreWriter.ts` — общая запись партитуры

Из `transcribe.ts` выносятся `voice`, `pieces`, запись такта и документа:
`writeScore(notes, { title, measures, fifths })` над `WrittenNote { pitch; start; end; staff }` в
шестнадцатых. Добавлено: написание бемолями при `fifths < 0`, `<time>` при смене размера,
экранирование названия и `heads` — индекс первой головки каждой ноты среди всех `<note>` (паузы
считаются, как в `musicXmlWithFingering`). `transcribeTake` строит `Placed` и зовёт `writeScore` с
`fifths: 0`; его тесты не меняются.

### D2. `src/song/midiScore.ts` — партитура из MIDI

`withWrittenScore(song, endBeats, fifths)`: начало — `startBeat`, конец — из тиков файла
(`endBeats`), округление до шестнадцатых, закрытие зазора до трети длины, запись и
`sourceIndex = heads.get(...)`. Время нот не трогается. `songFromMidi` зовёт его последним шагом;
`fifths` — из `header.keySignatures[0]` (имя ключа @tonejs/midi → квинты по таблице библиотеки),
иначе `fifthsForKey(detectKey(song))`.

### D3. Транспонирование не перечитывает MIDI

`transposeSong` перечитывает песню из партитуры только для `source === "musicxml"`. MIDI-песня
сдвигает ноты и получает транспонированный `musicXml`; порядок `<note>` не меняется, `sourceIndex`
остаётся верным.

### D4. Соглашение

`AGENTS.md` и `openspec/config.yaml` описывают стан MIDI как записанный из нот и запрещают
перечитывать песню из него.

## Risks / Trade-offs

- Живая игра с rubato даёт рваный ритм на стане; ноты при этом играются по MIDI. Упрощённая версия
  (`midi-arrangement`) — ответ для таких файлов.
- OSMD на большом файле: 8 тыс. нот, 78 тактов, ~770 КБ MusicXML — того же порядка, что крупные
  MusicXML-уроки; рисование не в кадровом цикле.
