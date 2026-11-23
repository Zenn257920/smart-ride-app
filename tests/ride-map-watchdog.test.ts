/**
 * Stall watchdog wiring in RideMap (2026-11-23).
 *
 * Live verification showed Esri serving 1–2 tiles of an 8-tile
 * viewport and then nothing for 60s: hung tile requests never fire
 * `tileerror`, so the error-based fallback cannot see the stall.
 * RideMap therefore tracks outstanding tiles (tileloadstart /
 * tileload / tileerror / load) and, on zero progress for
 * TILE_STALL_SWAP_MS, probes the next providers and swaps to the
 * first one whose probe tile loads. These are source assertions for
 * the wiring — the decision itself is covered by pure tests in
 * tests/map-tiles.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

describe("RideMap stall watchdog wiring", () => {
  const rideMap = src("components/RideMap.tsx");

  test("tracks outstanding tiles from Leaflet's load lifecycle events", () => {
    expect(rideMap).toContain('tileLayer.on("tileloadstart"');
    expect(rideMap).toContain('tileLayer.on("tileload"');
    expect(rideMap).toContain('tileLayer.on("tileerror"');
    // `load` (visible set complete) resets the pending count — the
    // safety net for tiles pruned mid-flight without load/error.
    expect(rideMap).toContain('tileLayer.on("load"');
    expect(rideMap).toContain("pendingTiles = 0;");
  });

  test("checks the stall on an interval and cleans it up on unmount", () => {
    expect(rideMap).toContain("shouldSwapOnStall(pendingTiles");
    expect(rideMap).toContain("setInterval(");
    expect(rideMap).toContain("clearInterval(stallTimer)");
  });

  test("swap is probe-gated — a provider is only selected when its probe loads", () => {
    expect(rideMap).toContain("probeProvider(providers[i])");
    // The swap reuses the normal layer swap (old layer removed, so
    // its hung requests are aborted).
    expect(rideMap).toContain("addTileLayer(providers[i])");
  });

  test("the swap happens only after a successful probe — never before it", () => {
    const probeAt = rideMap.indexOf(
      "if (await probeProvider(providers[i])) {",
    );
    expect(probeAt).toBeGreaterThan(-1);
    const swapAt = rideMap.indexOf("providerIndex = i;", probeAt);
    expect(swapAt).toBeGreaterThan(probeAt);
    // When no probe succeeds the code re-arms instead of swapping.
    expect(rideMap).toContain("// Nothing better answered: stay");
  });

  test("error-based fallback is untouched", () => {
    expect(rideMap).toContain("fallbackProvider(");
    expect(rideMap).toContain("consecutiveErrors = 0;");
  });

  test("watchdog also swaps when the layer's `load` never fired", () => {
    // The pending counter can be blinded (zero-area mount requests no
    // tiles, so pending sits at 0 and `load` never fires) — the
    // missing-load rule is the second trigger in checkStall.
    expect(rideMap).toContain("shouldSwapOnMissingLoad(Date.now() - layerAddedAt, loadFired)");
    expect(rideMap).toContain("layerAddedAt = Date.now();");
    expect(rideMap).toContain("loadFired = false;");
    expect(rideMap).toContain("loadFired = true;");
    // The re-arm after "nothing better answered" resets both clocks,
    // so the watchdog does not probe in a tight loop.
    expect(rideMap).toContain("layerAddedAt = Date.now();");
    const rearmAt = rideMap.indexOf("// Nothing better answered: stay");
    expect(rearmAt).toBeGreaterThan(-1);
    expect(rideMap.indexOf("layerAddedAt = Date.now();", rearmAt)).toBeGreaterThan(rearmAt);
  });

  test("invalidateSize after tile-layer setup, delayed, and on resize", () => {
    // A container that was small at creation requests only a few
    // tiles; growth alone never re-requests them. invalidateSize
    // after the layer is added (and once more 500ms later, for layout
    // still settling) makes Leaflet request the full tile set.
    const addAt = rideMap.indexOf("addTileLayer(provider);");
    expect(addAt).toBeGreaterThan(-1);
    const invalAt = rideMap.indexOf("map.invalidateSize();", addAt);
    expect(invalAt).toBeGreaterThan(addAt);
    expect(rideMap).toContain("setTimeout(() => {");
    expect(rideMap).toContain("}, 500);");
    // Debounced window-resize backstop, cleaned up on unmount.
    expect(rideMap).toContain('window.addEventListener("resize", onResize)');
    expect(rideMap).toContain('window.removeEventListener("resize", onResize)');
    expect(rideMap).toContain("}, 150);");
    expect(rideMap).toContain("clearTimeout(resizeTimer)");
    expect(rideMap).toContain("clearTimeout(sizeTimer)");
  });
});
