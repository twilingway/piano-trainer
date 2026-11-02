# Tasks

## 1. Контракт и измерения

- [x] 1.1 Проверить артефакты spec_architect и
      `pnpm spec validate runtime-preparation-feedback --strict` до production-кода.
- [x] 1.2 Измерить смену руки: session/load, подготовку sprites/текстур и плана рук, первый кадр;
      записать область измерения.

## 2. Звук

- [x] 2.1 Вычислять размеры фактических MP3 при dev/build; единый audio-owner хранит cache, pending
      и snapshots.
- [x] 2.2 Потоковый single fetch/decode; тесты shared consumers, warm cache, decoder wait,
      failed-file retry и background failure.
- [x] 2.3 Подключить позднюю панель/фоновый статус, RU/EN, готовность и повтор; сохранить первый
      жест и отмену.
- [x] 2.4 Проверить все legacy callers ensureSound и отсутствие запуска после ошибки; тесты отсчёта
      0 и позднего promise.

## 3. Партия

- [x] 3.1 Дать busy первый paint до тяжёлого применения; поколение запроса отменяет stale intent при
      новом выборе/песне/unmount.
- [x] 3.2 Если измерение подтверждает повторную работу, повторно использовать только неизменную
      визуальную подготовку; сохранить clock, позиции, FX/pose/reset и записи.
- [x] 3.3 Снять индикатор после актуального кадра; тесты быстрых Left/Right/Both/Listen и
      paused/playing.

## 4. Приёмка

- [x] 4.1 Видимый Chrome RU/EN: холодная/тёплая загрузка, замедленная сеть, отказ MP3+повтор,
      декодирование, подготовка партии до CPU и 568×320/667×375.
- [x] 4.2 Независимое reviewer-ревью, затем `pnpm check` и `pnpm spec:validate`; записать
      фактические ограничения и открыть PR в dev.
