# Источники словарей режима «Печатать мелодию»

Статические ресурсы `public/word-typing/en.json` и `ru.json` содержат по 3000 слов. Режим 1K
использует первые 1000 записей того же ресурса.

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
`rank` пересчитано после фильтрации, `frequency` сохраняет исходное значение. Отобраны первые 3000
подходящих записей.

Подготовка ресурсов:

```text
node --experimental-strip-types src/wordTypingTools/prepare.ts
```

Исходные списки сохраняются в игнорируемом
`.browser-artifacts/word-typing/dictionary-cache/<Git SHA>/`; повторный запуск использует этот кеш
без сети. Runtime приложения читает готовые локальные JSON и не обращается к внешнему источнику.

Benchmark всех восьми комбинаций EN/RU × 1K/3K × мелодия/бас:

```text
node --experimental-strip-types src/wordTypingTools/benchmark.ts --builtin-anthem
node --experimental-strip-types src/wordTypingTools/benchmark.ts "путь/песня.musicxml" --beam 64 --output .browser-artifacts/word-typing/мой-отчёт
```

Принимаются `.musicxml`, `.xml`, `.mxl`, `.mid`, `.midi`. Команда использует существующие парсеры
проекта и записывает читаемый Markdown и полный JSON. По умолчанию отчёты лежат в
`.browser-artifacts/word-typing/benchmark.{md,json}` и не предназначены для публикации сторонних
нот.
