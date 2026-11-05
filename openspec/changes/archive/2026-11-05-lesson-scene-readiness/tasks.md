## 1. Готовность графики

- [x] 1.1 Реестр текущих ресурсов, decode/cache/cancel/error и presentation gate; проверить focused
      tests.
- [x] 1.2 Стабильное img, размер/центровка, художественное имя/промпт-метаданные; проверить tests и
      diff изображений.

## 2. Геометрия подсказок

- [x] 2.1 Play вне нот/над клавишами с event-driven resize/zoom; проверить pure geometry и hook
      tests.
- [x] 2.2 Короткий hold справа с clamp/следующими знаками и прогрессом; проверить geometry/overlay
      tests.

## 3. Интеграция

- [x] 3.1 Rebase на dev с PR323, pnpm check и pnpm spec:validate; записать результаты и создать PR с
      UTF8 readback.
- [x] 3.2 Root review GO и визуальная проверка в одной существующей вкладке: reload с очищенным JS
      decoded-map, portrait/landscape, видимость Play/teacher/hold; error/stale/zoom — focused
      tests. Границы и provenance записаны в docs/LESSON_SCENE_READINESS_QA_2026_11_05.md.
- [x] 3.3 Убрать наследуемые attributes/directions/print из второго такта четырёх ми; проверить XML
      и parsed timing/IDs regression.
