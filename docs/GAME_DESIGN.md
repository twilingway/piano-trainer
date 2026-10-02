# Правила игры и Timing Engine

Исходные требования игрока:

- [GAME_RULES.md](GAME_RULES.md) — оценки, Combo, Score, аккорды, удержания и режимы игры.
- [TIMING_ENGINE.md](TIMING_ENGINE.md) — MIDI timestamps, offsets, калибровка и единый timeline.

Документы описывают целевое поведение, а не подтверждают наличие всех этих возможностей в текущей
версии. Проект внедрения — [rhythm-game-timing](../openspec/changes/rhythm-game-timing/proposal.md).
Точные решения и открытые вопросы — [design.md](../openspec/changes/rhythm-game-timing/design.md),
состояние работ — [tasks.md](../openspec/changes/rhythm-game-timing/tasks.md).

Текущая версия ещё оценивает tempo-нажатия в окне ±180 мс по времени последнего кадра и считает
Accuracy как долю попаданий. Пятиступенчатые оценки, Score и новый Timing Engine требуют отдельной
реализации. Обучение «Ждать ноту» и педагогический разбор дублей сохраняют свой смысл.
