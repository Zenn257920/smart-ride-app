// Regression test: the Leaflet stylesheet must be imported, or the map
// tiles load but are never laid out in a grid (no .leaflet-pane /
// .leaflet-tile positioning) — the map shows ~1 tile and the rest white.
// That is exactly what happened live 2026-11-23: every tile-server /
// size / watchdog fix failed because the CSS was never in the bundle.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Leaflet stylesheet", () => {
  it("is imported by the root layout", () => {
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain("leaflet/dist/leaflet.css");
  });

  it("exists in node_modules", () => {
    const css = readFileSync("node_modules/leaflet/dist/leaflet.css", "utf8");
    expect(css).toContain(".leaflet-pane");
    expect(css).toContain(".leaflet-tile");
  });
});
