# Дизайн

## Context

См. proposal.md. Есть instance-owned TrainerSnapshotSource, pure core, React Compiler и ленивые
настройки. Preferences сейчас принадлежат хукам; часть загрузчиков доверяет JSON.

## Goals / Non-Goals

Единое владение общими данными, выборочные подписки, совместимое хранение. Не менять pure core и
кадровый цикл; меню, черновики и transient resources остаются локальными.

## Decisions

- createAppStore, React Provider и typed hooks. Domain reducers/selectors/commands; hooks становятся
  runtime-адаптерами без своих копий перенесённого состояния.
- Listener middleware сохраняет изменённые persistent projections. Гидратация и ошибки не запускают
  запись. Существующие keys и DB schema сохраняются; redux-persist не нужен.
- JSON проверяется по полям: boolean/enum/finite number, диапазоны и Finger 1..5. Map/Set
  реконструируются на границе pure core, в store только serializable records/entries.
- Song slice владеет исходной песней и параметрами; derived песни вычисляются memoized selectors
  через pure functions. Review хранит Take и выбор, сравнение/партитура вычисляются.
- Runtime владеет Trainer, Pixi, audio, Worker и FileSystem handles. Стабильный источник доставляет
  committed view models и команды; не является вторым владельцем domain state. Connected regions
  выбирают только нужные поля.
- Library содержит metadata/status, bytes и handles в repository. Async результаты сверяются с
  revision выбора; write/delete подтверждаются transaction complete.
- Ошибки разделены по keys/операциям, показываются через t() и RU/EN каталог; отказ хранения
  сохраняет рабочую память.
- Настройки читаются до store; librarySource захватывается до effects. Initial mount не перетирает
  сохранённые данные.

## Risks / Trade-offs

- Лишние render → selectors, lazy sections, неизменный snapshot adapter, тесты подписок.
- Двойное владение → удаление useState и прежних effects после каждого переноса.
- Устаревшие операции → revision/cancellation на смене выбора и unmount.
- Несовместимость → тесты прежних keys/formats; rollback читает старые форматы.

## Migration Plan

Три PR: settings/persistence; song/runtime/composition; library/review. Каждый проходит pnpm check и
pnpm spec:validate. Второй и третий этапы продолжаются от актуальной dev с сохранением изменений
CI/CD и отдельными PR в dev. Версия пакета меняется только в релизном PR dev → main. Сервер
автоматически не запускается. Остальные багфиксы вне scope.
