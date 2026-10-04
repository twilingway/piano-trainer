# Источники словарей режима «Печатать мелодию»

Статические ресурсы `public/word-typing/en.json` и `ru.json` содержат по 3000 слов: режимы 1K и 3K
используют первые 1000 и 3000 записей. `en-10k.json` и `ru-10k.json` содержат по 10 000 слов для
режима 10K; их первые 3000 записей совпадают с малым ресурсом. Малый файл нужен, чтобы частые
размеры не загружали большой список.

Объём (JSON без отступов): RU 3000 — 157 КБ (gzip ≈ 31 КБ), RU 10 000 — 532 КБ (gzip ≈ 103 КБ,
brotli ≈ 71 КБ); EN 10 000 — 466 КБ (gzip ≈ 96 КБ). Сжатие при передаче — забота сервера
(`gzip_types application/json`), отдельный архив не нужен.

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
подходящих записей; малый ресурс — первые 3000 из них.

Подготовка ресурсов:

```text
node --experimental-strip-types src/wordTypingTools/prepare.ts
```

Исходные списки сохраняются в игнорируемом
`.browser-artifacts/word-typing/dictionary-cache/<Git SHA>/`; повторный запуск использует этот кеш
без сети. Runtime приложения читает готовые локальные JSON и не обращается к внешнему источнику.

Benchmark всех двенадцати комбинаций EN/RU × 1K/3K/10K × мелодия/бас:

```text
node --experimental-strip-types src/wordTypingTools/benchmark.ts --builtin-anthem
node --experimental-strip-types src/wordTypingTools/benchmark.ts "путь/песня.musicxml" --beam 64 --output .browser-artifacts/word-typing/мой-отчёт
```

Принимаются `.musicxml`, `.xml`, `.mxl`, `.mid`, `.midi`. Команда использует существующие парсеры
проекта и записывает читаемый Markdown и полный JSON. По умолчанию отчёты лежат в
`.browser-artifacts/word-typing/benchmark.{md,json}` и не предназначены для публикации сторонних
нот.
