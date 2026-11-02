# Задачи

## 1. Совместимость и источник

- [x] 1.1 Сравнить текущие Blender/native/public rig и реальные rest/bind/weights/correctives;
      сохранить приватный отчёт различий и исходные SHA.
- [x] 1.2 Добавить проверку rig compatibility с отрицательными same-name/wrong-parent/rest/bind
      controls; узкие Vitest-проверки должны отклонять несовместимый экспорт до воспроизведения.

## 2. Допуск поз и переходов

- [ ] 2.1 Закрыть prerequisite collision/containment, C3, native LEFT/C6 и shared torso; ledger
      указывает exact bilateral/world и saved Blender evidence для каждой принятой позы.
- [ ] 2.2 Подготовить offline-фазы и переходы, проверить skin/pads/nails и удержание контактов на
      дробных отсчётах; неизвестные назначения дают явный отказ.
- [ ] 2.3 Реализовать чистый sampler абсолютного времени; onset/release, повтор, held+moving,
      pause/seek/replay проверяются тестами без таймеров.

## 3. Экспорт и игра

- [ ] 3.1 Экспортировать private asset с нужными correctives и фактическим Three.js surface proof.
- [ ] 3.2 Подключить DEV private loader с provenance/admission gates и корректной очисткой ресурсов;
      проверить отсутствие private данных в production и сохранность fallback.
- [ ] 3.3 Проверить готовые руки в видимом браузере и Blender сверху/сбоку, записать visual status,
      покрытие и отказы; остановить собственный стенд после проверки.

## 4. Проверка и публикация

- [ ] 4.1 Независимое review подтверждает геометрию, sampler, приватность и раздельные гейты.
- [ ] 4.2 Выполнить pnpm check и pnpm spec:validate, открыть PR в dev с точными
      evidence/ограничениями.
