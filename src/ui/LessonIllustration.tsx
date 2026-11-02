export type LessonIllustrationId =
  | "right-hand"
  | "left-hand"
  | "intervals"
  | "rhythm"
  | "two-hands"
  | "held-bass"
  | "two-rhythms"
  | "sight-reading"
  | "harmony"
  | "dictation"
  | "integrated";

const illustrationUrls = import.meta.glob<string>("./lesson-art/*.webp", {
  eager: true,
  query: "?url",
  import: "default"
});

/** Decorative art; the translated card title and objective carry the accessible meaning. */
export function LessonIllustration({
  lesson,
  className = "lesson-illustration"
}: {
  readonly lesson: LessonIllustrationId;
  readonly className?: string;
}) {
  const src = illustrationUrls[`./lesson-art/${lesson}.webp`];
  if (!src) return null;
  return (
    <img
      className={className}
      src={src}
      alt=""
      aria-hidden="true"
      width={256}
      height={256}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
