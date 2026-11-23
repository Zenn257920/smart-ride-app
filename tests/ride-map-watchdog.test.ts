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
});
