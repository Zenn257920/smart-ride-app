"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, asArray, fmtTime, type NotificationLike } from "@/lib/api";

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationLike[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.filter((n) => !n.read).length;

  async function load() {
    try {
      const data = await apiFetch<unknown>("/api/notifications");
      setItems(asArray<NotificationLike>(data));
    } catch {
      /* bell stays quiet when the endpoint is unavailable */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAllRead() {
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      /* surface silently; list still shows */
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-mint hover:bg-white/10"
      >
        <span aria-hidden className="text-lg">🔔</span>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-mint px-1 text-[11px] font-medium text-forest">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed inset-x-4 top-[4.5rem] z-50 overflow-hidden rounded-[20px] bg-white shadow-[0_8px_32px_rgba(30,73,39,0.25)] ring-1 ring-forest/10 dark:bg-[#1a3a24] dark:ring-mint/10 sm:inset-x-auto sm:right-4 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-forest/10 px-4 py-3 dark:border-mint/10">
            <span className="text-sm font-medium text-forest dark:text-mint">Notifications</span>
            <button type="button" onClick={markAllRead} className="text-xs text-forest/70 underline hover:text-forest dark:text-mint/70 dark:hover:text-mint">
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-forest/60 dark:text-mint/60">No notifications yet.</p>
            ) : (
              items.slice(0, 20).map((n) => (
                <div key={n.id} className={`border-b border-forest/5 px-4 py-3 last:border-0 dark:border-mint/5 ${n.read ? "" : "bg-mint-soft dark:bg-forest-soft/40"}`}>
                  <p className="break-words text-sm text-forest dark:text-mint">{n.message ?? "Notification"}</p>
                  <p className="mt-0.5 text-xs text-forest/50 dark:text-mint/50">{fmtTime(n.createdAt ?? n.created_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
