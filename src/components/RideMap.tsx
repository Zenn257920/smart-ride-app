"use client";

import { useEffect, useRef } from "react";
import type { LatLng } from "@/lib/api";
import { YANGON } from "@/lib/api";

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: "green" | "mint" | "dark";
}

interface RideMapProps {
  center?: LatLng;
  markers?: MapMarker[];
  routeCoordinates?: Array<[number, number]>;
  onPick?: (lat: number, lng: number) => void;
  height?: number;
  // D4: when false, marker updates redraw the markers but do NOT
  // re-fit the viewport — used by the passenger live view, where the
  // driver marker moves every poll and re-fitting would yank the map
  // under the user's fingers. Defaults to true (search / dashboard).
  autoFit?: boolean;
}

export default function RideMap({
  center = YANGON,
  markers = [],
  routeCoordinates,
  onPick,
  height = 320,
  autoFit = true,
}: RideMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const layerRef = useRef<unknown>(null);
  const propsRef = useRef({ center, markers, routeCoordinates, onPick });
  propsRef.current = { center, markers, routeCoordinates, onPick };

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    let layer: import("leaflet").LayerGroup | null = null;
    let Lmod: typeof import("leaflet") | null = null;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !divRef.current) return;
      Lmod = L;
      map = L.map(divRef.current, { scrollWheelZoom: true }).setView(
        [propsRef.current.center.lat, propsRef.current.center.lng],
        13,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;
      if (propsRef.current.onPick) {
        map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
          propsRef.current.onPick?.(e.latlng.lat, e.latlng.lng);
        });
      }
      draw();
    })();

    function draw() {
      if (!Lmod || !map || !layer) return;
      const L = Lmod;
      layer.clearLayers();
      const { markers: mk, routeCoordinates: rc, center: c } = propsRef.current;
      const bounds: Array<[number, number]> = [];
      if (rc && rc.length > 1) {
        L.polyline(rc, { color: "#1E4927", weight: 4, opacity: 0.85 }).addTo(layer);
        bounds.push(...rc);
      }
      for (const m of mk) {
        const color = m.color === "mint" ? "#C5EDCB" : m.color === "dark" ? "#14351c" : "#1E4927";
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${color};color:${m.color === "mint" ? "#1E4927" : "#fff"};border:2px solid #fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)">${m.label ? m.label.charAt(0) : "●"}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        L.marker([m.lat, m.lng], { icon }).addTo(layer);
        if (m.label) {
          L.marker([m.lat, m.lng], { icon }).bindTooltip(m.label, { direction: "top", offset: [0, -16] }).addTo(layer);
        }
        bounds.push([m.lat, m.lng]);
      }
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [24, 24] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.setView([c.lat, c.lng], 13);
      }
    }

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers/route when props change.
  useEffect(() => {
    const map = mapRef.current as import("leaflet").Map | null;
    const layer = layerRef.current as import("leaflet").LayerGroup | null;
    if (!map || !layer) return;
    void import("leaflet").then((L) => {
      layer.clearLayers();
      const bounds: Array<[number, number]> = [];
      if (routeCoordinates && routeCoordinates.length > 1) {
        L.polyline(routeCoordinates, { color: "#1E4927", weight: 4, opacity: 0.85 }).addTo(layer);
        bounds.push(...routeCoordinates);
      }
      for (const m of markers) {
        const color = m.color === "mint" ? "#C5EDCB" : m.color === "dark" ? "#14351c" : "#1E4927";
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${color};color:${m.color === "mint" ? "#1E4927" : "#fff"};border:2px solid #fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3)">${m.label ? m.label.charAt(0) : "●"}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(layer);
        if (m.label) marker.bindTooltip(m.label, { direction: "top", offset: [0, -16] });
        bounds.push([m.lat, m.lng]);
      }
      // D4: live views pass autoFit={false} so a moving driver marker
      // does not re-centre the map on every poll.
      if (!autoFit) return;
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
      else if (bounds.length === 1) map.setView(bounds[0], 14);
    });
  }, [markers, routeCoordinates, autoFit]);

  return (
    <div className="min-w-0 overflow-hidden rounded-[20px] ring-1 ring-forest/10 dark:ring-mint/10">
      <div ref={divRef} style={{ height }} className="w-full" aria-label="Map" />
      {onPick ? (
        <p className="bg-mint-soft px-4 py-2 text-xs text-forest dark:bg-forest-soft dark:text-mint">
          Tap the map to pick a location.
        </p>
      ) : null}
    </div>
  );
}
