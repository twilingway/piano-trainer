# Источники словарей режима «Печатать мелодию»

Статические ресурсы `public/word-typing/en.json` и `ru.json` содержат по 10 000 слов; генератор
всегда выбирает из всего словаря. Рядом лежат пары слов `en-bigrams.json` и `ru-bigrams.json` (по 40
000 самых частых пар из этих слов).

Объём (JSON без отступов, сжатие — при передаче, отдельный архив не нужен):

| Ресурс          | Размер |   gzip | brotli |
| --------------- | -----: | -----: | -----: |
| ru.json         | 532 КБ | 103 КБ |  71 КБ |
| en.json         | 466 КБ |  96 КБ |  65 КБ |
| ru-bigrams.json | 415 КБ | 146 КБ | 106 КБ |
| en-bigrams.json | 414 КБ | 149 КБ | 111 КБ |

Источник: [FrequencyWords, Hermit Dave](https://github.com/hermitdave/FrequencyWords), списки частот
слов из субтитров OpenSubtitles 2018:

- [EN, исходные 50 000 слов](https://github.com/hermitdave/FrequencyWords/blob/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/en/en_50k.txt).
- [RU, исходные 50 000 слов](https://github.com/hermitdave/FrequencyWords/blob/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/ru/ru_50k.txt).
- Зафиксированная версия Git: `525f9b560de45753a5ea01069454e72e9aa541c6`.
- Версия подготовленных ресурсов:
  `FrequencyWords-2018-525f9b560de45753a5ea01069454e72e9aa541c6-filtered-v1`.
- [README источника и условия использования](https://github.com/hermitdave/FrequencyWords/blob/525f9b560de45753a5ea01069454e72e9aa541c6/README.md).

Словарные данные, включая подготовленные JSON, распространяются по
[Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).
Условия включают указание авторства и изменений и распространение производных словарных данных под
той же лицензией. Лицензия относится к отдельным ресурсам словарей; исходный код генератора и
приложения не становится производной словарной базой. Код самого FrequencyWords имеет отдельную
лицензию MIT и здесь не копируется.

Изменения исходных данных: NFC, нижний регистр, только буквы выбранного языка (EN `a-z`, RU `а-яё`),
удаление повторов и записей без положительной целочисленной частоты. Однобуквенные слова ограничены
EN `a/i` и RU `и/я/а/в/с/к/у/о`. Удалена явная ненормативная лексика по регулярным выражениям
`PROFANITY` в `src/wordTypingTools/dictionarySource.ts`. Фильтр направлен на известные обсценные
основы и не гарантирует нейтральность всех слов субтитров. Порядок исходных частот сохраняется; поле
`rank` пересчитано после фильтрации, `frequency` сохраняет исходное значение. Отобраны первые 10 000
подходящих записей.

## Пары слов: Tatoeba

Пары слов посчитаны по предложениям [Tatoeba](https://tatoeba.org) — выгрузки
[`rus_sentences.tsv.bz2`](https://downloads.tatoeba.org/exports/per_language/rus/rus_sentences.tsv.bz2)
и
[`eng_sentences.tsv.bz2`](https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2)
от 2026-10-03 (версия ресурса `Tatoeba-2026-10-03-pairs-v1`). Предложения Tatoeba распространяются
по [Creative Commons Attribution 2.0 France](https://creativecommons.org/licenses/by/2.0/fr/) (часть
— CC0); © участники проекта Tatoeba. Изменения: предложения не публикуются, из них посчитано,
сколько раз два слова словаря стоят рядом внутри фразы (пунктуация, цифры, апостроф и слово вне
словаря разрывают цепочку); сохранены пары, встреченные не меньше двух раз, 40 000 самых частых, в
виде `[ранг первого, ранг второго, число, …]` по рангам словаря.

Выгрузки Tatoeba обновляются ежедневно и не версионируются, поэтому первая подготовка сохраняет
архив и дату выгрузки в игнорируемом `.browser-artifacts/word-typing/tatoeba-cache/`; повторный
запуск читает этот кеш без сети. Без кеша подготовка скачает текущую выгрузку с новой датой — тогда
нужно поднять `BIGRAM_VERSION` в `src/app/useWordTyping.ts`. Распаковка идёт системным `bzip2` (есть
в Git Bash).

Подготовка ресурсов:

```text
node --experimental-strip-types src/wordTypingTools/prepare.ts
```

Исходные списки сохраняются в игнорируемом
`.browser-artifacts/word-typing/dictionary-cache/<Git SHA>/`; повторный запуск использует этот кеш
без сети. Runtime приложения читает готовые локальные JSON и не обращается к внешнему источнику.

Benchmark восьми комбинаций EN/RU × с биграммами и без × мелодия/бас:

```text
node --experimental-strip-types src/wordTypingTools/benchmark.ts --builtin-anthem
node --experimental-strip-types src/wordTypingTools/benchmark.ts "путь/песня.musicxml" --beam 64 --output .browser-artifacts/word-typing/мой-отчёт
```

Принимаются `.musicxml`, `.xml`, `.mxl`, `.mid`, `.midi`. Команда использует существующие парсеры
проекта и записывает читаемый Markdown и полный JSON. По умолчанию отчёты лежат в
`.browser-artifacts/word-typing/benchmark.{md,json}` и не предназначены для публикации сторонних
нот.
