"use client";

import { useEffect, useRef, useState } from "react";
import { geocode, type GeocodeHit } from "@/lib/api";
import { MapPin } from "lucide-react";

interface LocationFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (label: string) => void;
  onSelect: (hit: GeocodeHit) => void;
  placeholder?: string;
  /** Show a "use my location" button; parent supplies the handler. */
  onUseMyLocation?: () => void;
  locating?: boolean;
}

/** Text input with Nominatim suggestions via GET /api/geocode. */
export default function LocationField({
  id,
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  onUseMyLocation,
  locating,
}: LocationFieldProps) {
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function handleChange(v: string) {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 3) {
      setHits([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await geocode(v.trim());
        setHits(results);
        setOpen(results.length > 0);
      } catch {
        setHits([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  return (
    <div ref={boxRef} className="relative min-w-0">
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          className="input"
          value={value}
          placeholder={placeholder ?? "ရန်ကုန်မြို့မှာ နေရာရှာပါ…"}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {onUseMyLocation ? (
          <button type="button" onClick={onUseMyLocation} disabled={locating} className="btn-outline inline-flex shrink-0 items-center justify-center px-3" title="ကျွန်တော့်တည်နေရာကို သုံးပါ">
            {locating ? "…" : <MapPin aria-hidden className="h-4 w-4" />}
            <span className="sr-only">ကျွန်တော့်တည်နေရာကို သုံးပါ</span>
          </button>
        ) : null}
      </div>
      {loading ? <p className="mt-1 text-xs text-forest/50 dark:text-mint/50">ရှာဖွေနေသည်…</p> : null}
      {open && hits.length > 0 ? (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-[12px] bg-white shadow-[0_8px_32px_rgba(30,73,39,0.2)] ring-1 ring-forest/10 dark:bg-[#1a3a24] dark:ring-mint/10">
          {hits.map((h, i) => (
            <li key={`${h.lat},${h.lng}-${i}`}>
              <button
                type="button"
                className="block w-full px-4 py-2.5 text-left text-sm text-forest hover:bg-mint-soft dark:text-mint dark:hover:bg-forest-soft"
                onClick={() => {
                  onSelect(h);
                  setOpen(false);
                }}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
