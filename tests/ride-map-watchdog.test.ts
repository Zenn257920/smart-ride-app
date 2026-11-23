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

  test("ResizeObserver on the container replaces the timer + window-resize approach", () => {
    // A container that was small at creation requests only a few
    // tiles; growth alone never re-requests them. The old 500ms timer
    // missed growth when layout settled later than 500ms, and the
    // window-resize listener never fired because the WINDOW does not
    // resize — only the container grows. The observer fires on every
    // container-size change, whenever it happens.
    const addAt = rideMap.indexOf("addTileLayer(provider);");
    expect(addAt).toBeGreaterThan(-1);
    // Immediate invalidateSize after the layer is added is kept.
    const invalAt = rideMap.indexOf("map.invalidateSize();", addAt);
    expect(invalAt).toBeGreaterThan(addAt);
    // Observer wired from effect setup on the container div, calling
    // invalidateSize (guarded on cancelled + map, which is null until
    // Leaflet loads) and disconnected on unmount.
    expect(rideMap).toContain("new ResizeObserver(() => {");
    expect(rideMap).toContain("resizeObserver.observe(divRef.current)");
    expect(rideMap).toContain("if (!cancelled && map) map.invalidateSize();");
    expect(rideMap).toContain("resizeObserver.disconnect()");
    // The fragile timing approach is gone entirely.
    expect(rideMap).not.toContain("sizeTimer");
    expect(rideMap).not.toContain("resizeTimer");
    expect(rideMap).not.toContain("onResize");
    expect(rideMap).not.toContain("}, 500);");
    expect(rideMap).not.toContain('window.addEventListener("resize"');
    expect(rideMap).not.toContain('window.removeEventListener("resize"');
    expect(rideMap).not.toContain("setTimeout(");
  });
});
