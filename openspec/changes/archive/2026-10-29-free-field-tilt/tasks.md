## 1. Field by tilt and length

- [x] 1.1 `FreeRoadLayout`: `tilt` and `length` replace `height` and `distance`; `freeFieldReach`
- [x] 1.2 Old height and distance become the same far edge, rounded to 0.01; new fields win
- [x] 1.3 World score poster rises with the field's reach
- [x] 1.4 Settings, hints, FAQ and help targets in RU and EN
- [x] 1.5 Tests: migration, length along the field, tilt keeps length, UI limits and targets

## 2. Verification

- [x] 2.1 `pnpm check` and `pnpm spec:validate`
- [x] 2.2 Browser on the task stand: old fields 0.45/0 and 0/59.52 read as 90°/0.45 m and 0°/59.52 m
      and are saved as tilt and length
- [x] 2.3 The user checks on 5190 that length moves the horizon without turning it
