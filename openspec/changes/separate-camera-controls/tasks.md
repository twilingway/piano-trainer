# Tasks

Production-реализация не начата. Это сохранённая следующая задача, а не готовое разделение камер.
Тесты выполняются в конце реализации задачи по указанию пользователя.

## 1. Контракт проекций

- [ ] 1.1 Реализовать чистый общий route-progress/contact adapter для legacy/free-road; добавить
      регрессии дальних raw world matrices и near-join при всех camera.* и worldFov. Проверка в
      конце: соответствующие Vitest projection suites.
- [ ] 1.2 Проверить finite/CPU–GLSL parity и белые/чёрные контакты для horizon 99/100/101/150%,
      pan/scale, разных диапазонов и resize; добавить тесты и описание численных бюджетов. Проверка
      в конце: projection/contact suites.

## 2. Владельцы камер и passes

- [ ] 2.1 Подключить independent world bounds/pose во всех 3D-композициях, standard-free перевести
      на world+keyboard passes без второго пианино; добавить regressions picking и неизменности
      дальней проекции. Проверка: render tests и видимый standard/standard-free/game/free.
- [ ] 2.2 Согласовать тела/головы/хвосты/цифры/ореол/направляющие/огонь с одним adapter, сохранить
      постановочный приоритет и clock. Проверка: CPU/GLSL tests, удержание ноты и live resource
      counters в браузере.

## 3. Настройки и сохранение

- [ ] 3.1 Разделить группы и сбросы keyboard/world с RU/EN, существующим FOV мира и orbit/WASD;
      объяснить fixed-режимы и постановочный приоритет. Добавить UI regressions
      callbacks/reset/disabled. Проверка в конце: settings suites.
- [ ] 3.2 Сохранить прежние keys/defaults/profiles, нормализовать повреждение только своего набора,
      не обещать restore runtime-орбиты. Добавить store/profile/reload regressions и краткую
      документацию. Проверка в конце: preferences suites.

## 4. Интеграция и передача

- [ ] 4.1 Независимое reviewer review; видимый Chrome 1440×1000, 320×568, 390×844, 667×375, RU/EN,
      обе клавиши, оба сброса, reload, игра/пауза, отсутствие MIDI/модели и постановка; измерить ≤1
      CSS px на контакте.
- [ ] 4.2 В конце прогнать pnpm check и pnpm spec:validate, сохранить acceptance, архивировать
      OpenSpec, commit/push и PR в dev; остановить свой стенд. Основная папка/5190 сохраняются;
      аппаратная MIDI-приёмка остаётся отложенной.
