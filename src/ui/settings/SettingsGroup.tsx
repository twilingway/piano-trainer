import type { ReactNode } from "react";

export function SettingsGroup({
  title,
  children
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="settings-group" aria-label={title}>
      <h3 className="settings-group__title">{title}</h3>
      {children}
    </section>
  );
}
