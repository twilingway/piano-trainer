import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import { localizeStartupHtml, startupBootstrapSource, startupStylesSource } from "./pianoStartup";

describe("standalone startup bootstrap", () => {
  it("contains neither module imports nor external download dependencies", () => {
    const source = startupBootstrapSource(process.cwd(), "/");
    expect(source).not.toMatch(/^\s*(?:import|export)\s/m);
    expect(source).toContain("bootPianoStartup(");
    expect(source).toContain("/models/keyboard88.glb");
    expect(source).not.toContain("react");
    expect(() => new Script(source)).not.toThrow();
  });

  it("localizes static fallback HTML for a translated build entry", () => {
    const html = localizeStartupHtml(
      "before<!-- piano-startup:start -->old<!-- piano-startup:end -->after",
      "ru"
    );
    expect(html).toContain('id="startup-title">Загружаем пианино');
    expect(html).toContain('id="startup-brand" class="startup-brand">Нотопад');
    expect(html).toMatch(/^before.*after$/s);
  });

  it("emits a standalone early stylesheet capture", () => {
    const source = startupStylesSource(process.cwd());
    expect(source).not.toMatch(/^\s*(?:import|export)\s/m);
    expect(source).toContain("captureStartupStyles();");
    expect(() => new Script(source)).not.toThrow();
  });
});
