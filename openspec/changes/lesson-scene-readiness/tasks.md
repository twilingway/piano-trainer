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

- [ ] 3.1 Rebase на dev с PR323, pnpm check и pnpm spec:validate; записать результаты и создать PR с
      UTF8 readback.
- [ ] 3.2 Root review и визуальная проверка в одной существующей вкладке: cold-cache, ошибка,
      portrait/landscape, zoom.
- [x] 3.3 Убрать наследуемые attributes/directions/print из второго такта четырёх ми; проверить XML
      и parsed timing/IDs regression.
