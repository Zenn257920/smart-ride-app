// @vitest-environment jsdom
/**
 * ResizeObserver recovery for the Leaflet map (2026-11-23).
 *
 * Behavioural proof, with real Leaflet 1.9.4 in jsdom: a map whose
 * container is 0px wide at layer-add requests only the centre column
 * (2 tiles). If layout settles late — the container grows to 940px
 * at 2 seconds, long after the old 500ms timer would have fired —
 * nothing recovers the map unless a ResizeObserver fires
 * invalidateSize(). jsdom has no native ResizeObserver, so a mock
 * stands in (fired explicitly on growth, as a real observer would).
 * The wiring replicated here is exactly what
 * src/components/RideMap.tsx does: observe the container div from
 * effect setup, call map.invalidateSize() on every callback (guarded
 * on cancelled + map), disconnect on unmount.
 */
import { beforeAll, describe, expect, test } from "vitest";

const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const CENTER: [number, number] = [16.8, 96.15];
const ZOOM = 13;

/** Mock ResizeObserver: records instances; tests fire callbacks
 *  explicitly when the container grows, as a real observer would. */
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  disconnected = false;
  observeCalls = 0;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    MockResizeObserver.instances.push(this);
  }
  observe() {
    this.observeCalls += 1;
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    if (this.disconnected) return;
    this.callback([], this as unknown as ResizeObserver);
  }
  static fireAll() {
    for (const inst of MockResizeObserver.instances) inst.fire();
  }
  static reset() {
    MockResizeObserver.instances = [];
  }
}

beforeAll(() => {
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (window as any).ResizeObserver = MockResizeObserver;
});

function newMapDiv(width: number, height: number) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let w = width;
  let h = height;
  Object.defineProperty(el, "clientWidth", {
    get: () => w,
    configurable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    get: () => h,
    configurable: true,
  });
  el.getBoundingClientRect = () =>
    ({
      width: w,
      height: h,
      left: 0,
      top: 0,
      right: w,
      bottom: h,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return { el, setSize: (nw: number, nh: number) => { w = nw; h = nh; } };
}

function tileCount() {
  return document.querySelectorAll(".leaflet-tile").length;
}

function uniqTileCount() {
  const srcs = [...document.querySelectorAll(".leaflet-tile")].map((i) =>
    (i as HTMLImageElement).getAttribute("src"),
  );
  return new Set(srcs).size;
}

function loadAllTiles() {
  for (const img of [...document.querySelectorAll(".leaflet-tile")]) {
    img.dispatchEvent(new window.Event("load"));
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ResizeObserver tile recovery", () => {
  test("late growth at 2s recovers the full 8-tile viewport via the observer", async () => {
    const L = (await import("leaflet")).default;
    MockResizeObserver.reset();
    const { el, setSize } = newMapDiv(0, 360);

    // Wiring replicated from src/components/RideMap.tsx.
    let cancelled = false;
    let map: any = null;
    const resizeObserver = new (globalThis as any).ResizeObserver(() => {
      if (!cancelled && map) map.invalidateSize();
    });
    resizeObserver.observe(el);

    map = L.map(el, { scrollWheelZoom: true }).setView(CENTER, ZOOM);
    L.tileLayer(ESRI, { attribution: "Esri", maxZoom: 19 }).addTo(map);
    map.invalidateSize();
    await sleep(300);
    expect(tileCount()).toBe(2);
    // The 2 requested tiles load (as live) — the small set completes.
    loadAllTiles();
    await sleep(100);

    // The old 500ms timer would have fired by now (still 0px) and
    // never again. Layout settles LATE: container grows at 2s.
    await sleep(1600); // ~2s since layer-add
    setSize(940, 360);
    await sleep(300);
    expect(tileCount()).toBe(2); // no recovery without the observer

    // The ResizeObserver fires on the growth.
    MockResizeObserver.fireAll();
    await sleep(300);
    expect(tileCount()).toBe(8);
    expect(uniqTileCount()).toBe(8);

    // Unmount: observer disconnects; later growth does nothing.
    cancelled = true;
    resizeObserver.disconnect();
    map.remove();
    expect(resizeObserver.disconnected).toBe(true);
    el.remove();
  }, 15000);

  test("observer created before the map exists is a safe no-op until then", async () => {
    const L = (await import("leaflet")).default;
    MockResizeObserver.reset();
    const { el, setSize } = newMapDiv(0, 360);
    let cancelled = false;
    let map: any = null;
    let invalidateCalls = 0;
    const ro = new (globalThis as any).ResizeObserver(() => {
      if (!cancelled && map) {
        invalidateCalls += 1;
        map.invalidateSize();
      }
    });
    ro.observe(el);
    // Fires while the map is still null (initial observation / growth
    // during the probe delay) — must not throw.
    MockResizeObserver.fireAll();
    await sleep(100);
    expect(invalidateCalls).toBe(0);

    map = L.map(el, { scrollWheelZoom: true }).setView(CENTER, ZOOM);
    L.tileLayer(ESRI, { attribution: "Esri", maxZoom: 19 }).addTo(map);
    await sleep(200);
    expect(tileCount()).toBe(2);
    setSize(940, 360);
    MockResizeObserver.fireAll();
    await sleep(300);
    expect(tileCount()).toBe(8);
    expect(invalidateCalls).toBe(1);
    map.remove();
    el.remove();
  }, 15000);
});
