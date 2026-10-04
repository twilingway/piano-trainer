# Задача для Codex: Word Typing Mode для piano simulator

## Обязательный стек

Реализуй эту задачу на **TypeScript / Node.js**, а не на TypeScript.

- Используй TypeScript `strict`.
- Используй существующий package manager проекта (`pnpm`/`npm`/`yarn`) и существующий test runner,
  если они уже есть.
- Не добавляй TypeScript-прототипы, TypeScript CLI или TypeScript-зависимости для этой задачи.
- Все новые модули Word Typing, CLI, benchmark, downloader/cache словарей, parser adapters, Trie,
  Beam Search, scoring и metrics должны быть TypeScript.
- Если в проекте уже есть JS/TS музыкальная инфраструктура, интегрируйся с ней вместо создания
  параллельной реализации.

Изучи существующий проект целиком перед изменениями. Не переписывай архитектуру без необходимости и
не ломай существующие piano-layout режимы.

В репозитории должна быть/будет спецификация `WORD_TYPING_SKILL.md`. Считай её главным техническим
документом этой задачи и реализуй прототип согласно ей.

## Цель

Добавить универсальный генератор `Word Typing`, который преобразует монофоническую музыкальную линию
из MIDI/MusicXML в последовательность читаемых английских или русских слов.

Игрок видит и вслепую печатает текст, а каждая физическая клавиша воспроизводит требуемую ноту.

Ключевая модель:

```text
InputToken → exactly one Pitch
Pitch → many InputTokens
```

То есть одной высоте можно назначить несколько букв/клавиш, но конкретный InputToken в рамках
mapping всегда означает одну высоту.

## Важно

Не путай Word Typing с обычным piano mode:

```text
обычный piano:
Shift = sharp
Alt = flat

Word Typing:
Shift/Alt = дополнительные InputToken и используются только как fallback
```

## Приоритет доступных вводов

Использовать каскад:

```text
1. обычные буквы языка
2. `1234567890-=
3. Shift + key
4. Alt/Option + key
```

Генератор должен очень сильно предпочитать первый уровень.

Не вставляй цифры внутрь нормальных слов, если можно избежать этого.

Хорошо:

```text
BEAUTIFUL MUSIC [7] AGAIN
```

Плохо:

```text
BEAU7IFUL MUS1C
```

## Языки

Поддержать:

```text
en
ru
```

Нужны частотные словари и возможность benchmark:

```text
EN 1000
EN 3000
RU 1000
RU 3000
```

Найди подходящие публичные frequency word lists самостоятельно, реализуй downloader/cache и сохраняй
источник/версию словаря.

Top 1000 и top 3000 для одного языка должны быть срезами одного и того же упорядоченного frequency
list, чтобы benchmark был честным.

Если сеть недоступна во время runtime, используй уже скачанный cache. Не выдавай маленький
fallback-словарь за полноценный 1K/3K benchmark.

## Музыка

Поддержи существующий формат проекта. Если уже есть MusicXML/MIDI parser --- используй его.

Не создавай второй parser без необходимости.

Для Word Typing:

```text
1 note-on = 1 символ
```

Длительность ноты влияет на время удержания, но не создаёт повторные буквы.

Слова могут свободно пересекать границы тактов.

Паузы являются мягкими предпочтительными границами слов/фраз.

Аккорды пока не решаем. Для полифонического файла нужно уметь отдельно выбрать/извлечь:

```text
melody
bass
```

## Оптимизатор

Не делай простой greedy.

Реализуй:

```text
Beam Search + Trie
```

либо эквивалентный bounded dynamic search.

State должен учитывать:

- позицию в нотах;
- существующий InputToken → Pitch mapping;
- Pitch → InputTokens;
- выбранные слова;
- score;
- fallback;
- Shift;
- Alt.

Beam width должен быть конфигурируемым.

Оптимизируй representation, если копирование Map на каждом состоянии становится bottleneck.

## Scoring

Основной порядок ценностей:

```text
readable real words
frequency/commonness
longer words
coverage
few fallback keys
typing comfort
```

Очень сильно штрафуй:

```text
top-row fallback
Shift
Alt
garbage
```

Причём:

```text
Alt penalty > Shift penalty > top-row penalty > normal letter
```

Добавь штраф за чрезмерное количество коротких слов (`of in is to...`), чтобы генератор предпочитал
длинные общеупотребительные слова.

Все веса вынеси в config.

## Quality metrics

Для каждого результата посчитать минимум:

```text
total notes
unique pitches
dictionary coverage %
normal letters %
top row %
Shift %
Alt %
word count
average word length
longest word
average/frequency rank
readability score
typing comfort score
overall quality score
runtime
```

Добавь grade / stars 1--5.

## Результат

Генератор должен вернуть:

- получившийся текст;
- token-by-token sequence;
- InputToken → Pitch mapping;
- Pitch → InputTokens mapping;
- quality metrics.

Результат должен быть сериализуемым в JSON.

## Cache

Кешируй готовую оптимизацию песни.

Cache key должен учитывать:

```text
music hash
selected part
language
dictionary version
dictionary size
algorithm version
scoring config
mapping scope
```

## Benchmark CLI

Добавь удобную команду/скрипт, которая принимает MusicXML/MIDI и автоматически прогоняет:

```text
EN-1000
EN-3000
RU-1000
RU-3000
```

отдельно для melody и bass.

Выведи таблицу:

```text
language
dictionary size
part
notes
unique pitches
coverage
normal letters
top row
Shift
Alt
avg word length
longest word
quality
runtime
```

После таблицы покажи полный сгенерированный текст и mapping каждого прогона.

Сохрани machine-readable benchmark JSON рядом с human-readable report.

## Первый тест

Используй файл:

```text
Гимн России · Лёгкий — бас одной нотой.musicxml
```

Он должен быть в workspace или я положу его туда.

В предыдущем эксперименте ориентировочно было:

```text
melody ≈ 98 note-on / 11 pitches
bass ≈ 36 note-on / 5 pitches
```

Не хардкодь эти значения --- перепроверь parser'ом.

Аккорды в этом benchmark пока игнорируй.

## Что нужно сделать

1.  Сначала исследуй repository и существующую архитектуру.
2.  Напиши короткий implementation plan.
3.  Реализуй dictionary downloader/cache.
4.  Реализуй нормализацию EN/RU.
5.  Реализуй Trie.
6.  Реализуй extraction melody/bass через существующую музыкальную инфраструктуру.
7.  Реализуй Word Typing optimizer.
8.  Реализуй scoring.
9.  Реализуй metrics.
10. Реализуй cache результатов.
11. Реализуй benchmark CLI.
12. Добавь unit tests для mapping invariants, dictionary normalization, scoring и deterministic
    generation.
13. Прогони benchmark на гимне для 1K/3K EN/RU.
14. Покажи фактические результаты, а не предполагаемые.
15. Если 3K даёт хуже читаемость, проанализируй почему и поправь scoring.
16. Не трогай UI сверх необходимого для прототипа, если задача может быть проверена CLI/тестами.

## Инварианты

Обязательно:

```text
один InputToken не может играть две разные высоты
одна высота может иметь много InputToken
каждый note-on должен получить игровой InputToken
слово может пересекать такт
duration не меняет количество символов
Shift/Alt используются только после исчерпания более дешёвых вариантов
```

Генерация при одинаковом input/config должна быть deterministic.

## Definition of Done

Задача считается выполненной, когда я могу выполнить одну команду на MusicXML гимна и получить
реальные результаты:

```text
EN 1K melody
EN 3K melody
RU 1K melody
RU 3K melody

EN 1K bass
EN 3K bass
RU 1K bass
RU 3K bass
```

с текстом, mapping, quality metrics и временем работы.

После реализации дай:

1.  список изменённых/созданных файлов;
2.  команды запуска;
3.  результаты тестов;
4.  benchmark-таблицу гимна;
5.  найденные ограничения;
6.  предложения для следующей версии.

Не заявляй о 100% покрытии или качестве без фактического benchmark.
