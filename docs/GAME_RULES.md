# MIDI Piano Hero --- правила игры

## 1. Концепция

MIDI Piano Hero --- ритм-игра для настоящего MIDI-пианино. Ноты движутся к Hit Line, а игрок
нажимает соответствующие клавиши в нужный момент.

Главные цели: точность, длинное Combo, высокий множитель, правильные аккорды и удержания, высокий
Score, Rank и Full Combo.

## 2. Оценка попадания

Timing Error Оценка Базовые очки

---

±30 ms PERFECT 100 ±60 ms GREAT 80 ±100 ms GOOD 50 ±150 ms OK 25 \> ±150 ms MISS 0

`Timing Error = CorrectedHitTime - ExpectedNoteTime`

MISS сбрасывает Combo и множитель.

## 3. Combo и множитель

     Combo   Multiplier

---

      0--9           ×1
    10--24           ×2
    25--49           ×3
    50--99           ×4
      100+           ×5

`Score = Base Score × Multiplier`

## 4. Аккорды

Ноты, начинающиеся практически одновременно (ориентир ±30 ms), объединяются в аккорд. Каждая нота
аккорда имеет собственную стоимость. Если сыграна только часть аккорда --- `PARTIAL`: правильные
ноты могут дать базовые очки, но Combo сбрасывается.

## 5. Лишние ноты

Неправильная клавиша в активном окне ожидаемой ноты считается `WRONG NOTE` и сбрасывает Combo. Это
защищает игру от случайного нажатия множества клавиш.

## 6. Длинные ноты

Длинная нота состоит из атаки, удержания и отпускания. Атака оценивается стандартно. За удержание
начисляются дополнительные очки, например `+10 Base Points` каждые 100 ms. Раннее отпускание
прекращает начисление Hold Score.

В Pro-режиме отдельно оценивается Release Accuracy.

## 7. Streak Bonus

    Combo     Бонус

---

       50      +500
      100    +1 000
      250    +2 500
      500    +5 000
     1000   +10 000

## 8. Flow и Energy

20 PERFECT/GREAT подряд активируют Flow. PERFECT даёт +2 Energy, GREAT +1. При накоплении минимум 50
Energy можно включить Overdrive.

Overdrive удваивает текущий множитель: ×3 → ×6, ×5 → ×10.

`Note Score = Accuracy Points × Combo Multiplier × Overdrive`

## 9. Accuracy

Результат Accuracy Value

---

PERFECT 100% GREAT 80% GOOD 50% OK 25% MISS 0%

`Accuracy = полученные Accuracy Points / максимально возможные × 100%`

Score и Accuracy считаются независимо.

## 10. Rank

    Accuracy  Rank

---

        100%   S+
        ≥98%   S
        ≥95%   A+
        ≥90%   A
        ≥85%   B
        ≥75%   C
        ≥60%   D
       \<60%   F

Без MISS, WRONG NOTE и PARTIAL CHORD выдаётся `FULL COMBO`. Все ноты PERFECT ---
`PERFECT FULL COMBO`.

## 11. Звёзды

Звёзды оценивают эффективность Score относительно целевого максимума: \<30% ★, ≥30% ★★, ≥50% ★★★,
≥70% ★★★★, ≥85% ★★★★★.

## 12. Сложность

Easy: окна примерно ±50/90/140/200 ms. Normal: ±30/60/100/150 ms. Hard: ±25/50/85/125 ms. Expert:
±20/40/70/100 ms.

## 13. Practice Mode

Выбор участка, Loop, скорость 50--100%, отдельные руки/партии, остановка после ошибки.

## 14. No-Fail и Performance

No-Fail не останавливает песню из-за ошибок. Performance скрывает лишние подсказки и предназначен
для полного исполнения.

## 15. MIDI Velocity и педаль

Velocity не влияет на стандартный Score, но сохраняется для статистики и будущего Expression Mode.
Sustain Pedal (CC64) в обычном режиме не ломает Combo; в Pro может оцениваться отдельно.

## 16. Результаты песни

Показываются Score, Rank, Accuracy, Max Combo, Notes, PERFECT/GREAT/GOOD/OK/MISS, Chords,
Average/Median Timing Error, Early/Late, Hold/Release Accuracy и Overdrive Score.

## 17. Главный принцип

Игра отдельно награждает: 1. правильные ноты; 2. точный timing; 3. стабильность исполнения.

Цепочка прогрессии: закончить песню → 3--5 звёзд → 90%+ → S → Full Combo → Perfect Full Combo +
максимальный Score.
