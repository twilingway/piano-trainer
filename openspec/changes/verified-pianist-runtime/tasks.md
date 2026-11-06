# Задачи

## 1. Совместимость и источник

- [x] 1.1 Сравнить текущие Blender/native/public rig и реальные rest/bind/weights/correctives;
      сохранить приватный отчёт различий и исходные SHA.
- [x] 1.2 Добавить проверку rig compatibility с отрицательными same-name/wrong-parent/rest/bind
      controls; узкие Vitest-проверки должны отклонять несовместимый экспорт до воспроизведения.

## 2. Допуск поз и переходов

- [ ] 2.1 Закрыть prerequisite collision/containment, C3, native LEFT/C6 и shared torso; ledger
      указывает exact bilateral/world и saved Blender evidence для каждой принятой позы.
- [x] 2.1.1 Выполнить новый exact RH-аудит последних трёх C3 endpoints; source/full156 guards и
      отчёт с фактическими отказами проверены, новые позы не записаны.
- [ ] 2.1.2 Закрыть C3 contact/skin/key/arm/natural без новых пересечений; принятие каждого шага
      подтверждается unchanged exact judge, literal FREE и сохранением удерживаемых контактов.
- [x] 2.1.3 Выполнить finite LEFT90seeds+2baseline; все 92 строки, source/raw parity и явные отказы
      сохранены; raw contact не объявляется physical PASS.
- [ ] 2.1.4 Подтвердить LEFT C6 и inventory74 exact physical/world, затем независимый saved Blender
      readback; результат конечной seed-семьи не объявляется доказанной невозможностью.
- [x] 2.1.5 Проверить committed actual-source BVH receipt по всем шести ledgers и полному source
      coverage; отдельно сохранить статус physical/saved/export/visual.
- [ ] 2.1.6 Закрыть per-candidate bilateral/shared-torso и строгий writer с независимым saved
      Blender proof; обе руки используют один корпус и сохраняют контакты в общей геометрии.
- [ ] 2.1.7 Выполнить key-only raw LEFT и inactive RIGHT диагностику в общем pressed set: полные
      points/triangles и native ROW/masks проверены, permission684 не подменяется preferred411;
      negative fixtures не дают общего GREEN при отсутствующих corrected/nail/containment proofs.
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
