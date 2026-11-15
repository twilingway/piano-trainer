# Задачи

## 1. Контракт и вход

- [x] 1.1 Получить complete предыдущий saved roundtrip и независимый strict read verdict; проверить
      фактические SHA source/saved/report/COMMITTED, partial явно отклоняется.
- [x] 1.2 Независимо проверить design/spec, exact eleven-field whitelist, Float64 chains, directed
      ROW и metadata/active-attribute normalization; сохранить review до реализации writer.
- [ ] 1.3 Подготовить immutable finite PLAN и CPU negative fixtures: ROW three-cycle/reflection/
      chain, premature F32/dtype/nonfinite/duplicate/alias/stale/partial; записать команду и
      результат.

## 2. Private writer и readback

- [ ] 2.1 Реализовать exclusive private byte-copy и 11 attrs с pure raw preparation; CPU tests
      сверяют raw values и отклоняют любое изменение старых named attrs.
- [ ] 2.2 Измерить actual evaluated fields: five stages N1672/guards1671/1673 и полный
      union124/52rig/88keys; typed fixtures проверяют correspondence и exact preservation.
- [ ] 2.3 После отдельного code/PLAN review выполнить один managed save и fresh reopen; два разных
      PID, реальные exit0, sourceSHA и отсутствие чужих остановок входят в receipt.

## 3. Проверка и публикация

- [ ] 3.1 Независимо перечитать complete bytes/nested arrays/hashes; final reviewer проверяет весь
      proof и null authority без наследования contact/old-TRI/visual admission.
- [ ] 3.2 Выполнить pnpm check и pnpm spec:validate, записать оставшиеся гейты и stop-state; открыть
      PR в dev с текстом, не публикуя модели, массивы и .blend.
