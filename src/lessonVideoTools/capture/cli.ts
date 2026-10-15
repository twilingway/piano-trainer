import { download } from "./acquire.ts";
import { setupCapture } from "./environment.ts";
import { exportCapture } from "./export.ts";
import { infer } from "./inference.ts";
import { captureOptions } from "./options.ts";

const HELP = `Локальный пакет наблюдений для Claude Code (без Blender и сервера).
pnpm lesson-video:setup-capture --python путь-к-Python-3.11
pnpm lesson-video:download --id video-01 --url https://www.youtube.com/watch?v=...
pnpm lesson-video:download --id video-01 --video путь-к-файлу
pnpm lesson-video:music --id video-01
pnpm lesson-video:hands --id video-01 [--calibration путь.json] [--start 0 --end 20] [--hand-model путь.task]
pnpm lesson-video:export --id video-01 [--calibration путь.json] [--review путь.json] [--bundle имя]
Результаты: local-lessons/.analysis/<id>/capture/. Подробности: docs/VIDEO_CAPTURE.md.
Предсказания остаются draft до ручной сверки; 3D — оценка, не точный захват движения.`;

export async function captureCli(root: string, args: readonly string[]): Promise<void> {
  const options = captureOptions(args);
  if (options.help) {
    console.log(HELP);
    return;
  }
  switch (options.command) {
    case "setup-capture":
      await setupCapture(root, { python: options.python });
      break;
    case "download":
      await download(root, { id: options.id, source: options.source });
      break;
    case "music":
    case "hands":
      await infer(root, options);
      break;
    case "export":
      await exportCapture(root, options);
      break;
  }
}
