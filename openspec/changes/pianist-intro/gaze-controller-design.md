# Аддитивный взгляд исполнителя

Контроллер получает actual camera world position после восстановления родного baked/base pose. Он
калибрует eye origin/forward/up по posed eyeball/iris geometry и head/neck basis; фиксированные
мировые −Z или −Y не используются. Готовая pure cameraGaze ограничивает голову25°/12°, глаза8° и
плавно выключает внимание за спиной.

Каждое apply снимает только собственную предыдущую поправку, если native animation ещё не записала
свежую базу; prepare доступен перед base-frame update. Head/neck меняются только quaternion,
переводы/масштабы/parents/action не изменяются. Neck получает20% общей поправки, голова остальное с
точной world compensation. Повторная пауза и seek не накапливают вращение.

Глаза вращаются только через центрированный pivot: готовые PianistIris copies либо исходные
центрированные MPFB eyeballs. Skinned raw full008 группы с pivot у корня не вращаются; ожидается
созданный ранее PianistFace. Неизвестные/некалибруемые модели остаются без повреждения. Controller
не владеет source geometry/material и не меняет render bridge.
