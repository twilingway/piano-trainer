import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOptions } from "./options.ts";
import { frames, prepare, setup } from "./pipeline.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const help = `Локальный разбор видеоуроков (без сервера и загрузки аудио в облако).

pnpm lesson-video:setup [--python путь] [--model turbo|large-v3] [--no-download]
pnpm lesson-video:prepare --video путь --id lesson-01 --start 01:00 [--end 02:00] [--model turbo|large-v3]
pnpm lesson-video:frames --video путь --id lesson-01 --at 65,74.5,01:30
pnpm lesson-video:frames --video путь --id lesson-01 --every 30 [--start 0] [--end 10:00] [--max-frames 80]

Время всегда относится к исходному видео; --end не включён в выбор кадров.
Артефакты: local-lessons/.analysis/<id>; среда и модели: .browser-artifacts/lesson-analysis.
Другой источник, диапазон или модель требуют нового --id. Подробнее: docs/VIDEO_LESSON_PIPELINE.md.`;

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(help);
    return;
  }
  const commands = { setup, prepare, frames };
  await commands[options.command](root, options);
}
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
