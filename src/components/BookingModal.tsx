"use client";

import { useRef, useState } from "react";
import {
  apiFetch,
  fmtMMK,
  fmtTime,
  rideAppFee,
  rideDriverName,
  rideEnd,
  rideFareShare,
  rideSeatsAvailable,
  rideStart,
  rideTime,
  rideTotal,
  type LatLng,
  type RideLike,
} from "@/lib/api";

interface BookingModalProps {
  ride: RideLike;
  balance: number | null;
  /** The rider's own pickup/dropoff from the search that found this
   * ride — sent with the booking so the server prices with the same
   * segment inputs search used (A2: seen price == charged price). */
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  onClose: () => void;
  onBooked: () => void;
}

export default function BookingModal({ ride, balance, pickup, dropoff, onClose, onBooked }: BookingModalProps) {
  const [method, setMethod] = useState<"ewallet" | "cash">("ewallet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // B6: how many seats to book (1..seatsAvailable). The price is the
  // per-seat segment price x seats — the same amounts the server
  // charges (B3: the modal total == the charged total).
  const maxSeats = Math.max(1, rideSeatsAvailable(ride) ?? 1);
  const [seats, setSeats] = useState(1);
  const safeSeats = Math.max(1, Math.min(maxSeats, seats));

  // A3 idempotency: one key per modal-open. A retry of THIS booking
  // (e.g. after a dropped response) replays the stored result instead
  // of charging twice; the modal remounts on every open, so a later
  // booking always gets a fresh key and can never replay this one.
  const idempotencyKeyRef = useRef<string | null>(null);
  if (idempotencyKeyRef.current === null) {
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  // Per-seat amounts from the search result, scaled by the seat count
  // — exactly what the server charges (B3/B6).
  const farePerSeat = rideFareShare(ride);
  const feePerSeat = rideAppFee(ride);
  const totalPerSeat = rideTotal(ride) ?? 0;
  const fare = farePerSeat != null ? farePerSeat * safeSeats : null;
  const fee = feePerSeat != null ? feePerSeat * safeSeats : null;
  const total = totalPerSeat * safeSeats;
  const insufficient = method === "ewallet" && balance != null && balance < total;

  async function confirm() {
    setError("");
    setLoading(true);
    try {
      await apiFetch(`/api/rides/${ride.id}/book`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKeyRef.current ?? "" },
        body: JSON.stringify({
          paymentMethod: method,
          seats: safeSeats,
          ...(pickup && dropoff
            ? {
                startLat: pickup.lat,
                startLng: pickup.lng,
                endLat: dropoff.lat,
                endLng: dropoff.lng,
              }
            : {}),
        }),
      });
      onBooked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ဘွတ်ကင်လုပ်လို့ မရပါ။ ထပ်ကြိုးစားကြည့်ပါ။");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Book ride">
      <div className="card w-full max-w-md rounded-b-none p-6 sm:rounded-b-[20px]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium text-forest dark:text-mint">ဤခရီးစဉ်ကို ဘွတ်ကင်လုပ်ပါ</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full px-2 py-1 text-forest/60 hover:bg-mint-soft dark:text-mint/60">✕</button>
        </div>

        <p className="mt-2 text-sm text-forest/80 dark:text-mint/80">
          {rideStart(ride)} → {rideEnd(ride)}
        </p>
        <p className="text-sm text-forest/60 dark:text-mint/60">
          {rideDriverName(ride)} · {fmtTime(rideTime(ride))}
        </p>

        {maxSeats > 1 ? (
          <div className="mt-4">
            <label htmlFor="bookingSeats" className="label">ထိုင်ခုံ အရေအတွက်</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Fewer seats"
                disabled={safeSeats <= 1}
                onClick={() => setSeats((s) => Math.max(1, s - 1))}
                className="rounded-[12px] border border-forest/20 px-3 py-2 text-lg text-forest disabled:opacity-40 dark:border-mint/25 dark:text-mint"
              >
                −
              </button>
              <span id="bookingSeats" className="min-w-16 text-center text-lg font-medium" aria-live="polite">
                {safeSeats} / {maxSeats} ခုံ
              </span>
              <button
                type="button"
                aria-label="More seats"
                disabled={safeSeats >= maxSeats}
                onClick={() => setSeats((s) => Math.min(maxSeats, s + 1))}
                className="rounded-[12px] border border-forest/20 px-3 py-2 text-lg text-forest disabled:opacity-40 dark:border-mint/25 dark:text-mint"
              >
                +
              </button>
              <span className="text-sm text-forest/60 dark:text-mint/60">{fmtMMK(totalPerSeat)} / တစ်ခုံ</span>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-1.5 border-y border-forest/10 py-3 text-sm dark:border-mint/10">
          {fare != null ? (
            <p className="flex justify-between"><span>ခရီးစဉ်ခ ဝေစု{safeSeats > 1 ? ` (${safeSeats} ခုံ)` : ""}</span><span>{fmtMMK(fare)}</span></p>
          ) : null}
          {fee != null ? (
            <p className="flex justify-between"><span>အက်ပ်အခွန် (5%)</span><span>{fmtMMK(fee)}</span></p>
          ) : null}
          <p className="flex justify-between font-medium text-base"><span>စုစုပေါင်း</span><span>{fmtMMK(total)}</span></p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMethod("ewallet")}
            aria-pressed={method === "ewallet"}
            className={`rounded-[12px] border-2 p-3 text-left ${method === "ewallet" ? "border-forest bg-mint-soft dark:border-mint dark:bg-forest-soft" : "border-forest/15 dark:border-mint/15"}`}
          >
            <span className="block text-sm font-medium">💳 E-Wallet</span>
            <span className="mt-1 block text-xs text-forest/60 dark:text-mint/60">
              လက်ကျန်ငွေ: {balance != null ? fmtMMK(balance) : "—"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMethod("cash")}
            aria-pressed={method === "cash"}
            className={`rounded-[12px] border-2 p-3 text-left ${method === "cash" ? "border-forest bg-mint-soft dark:border-mint dark:bg-forest-soft" : "border-forest/15 dark:border-mint/15"}`}
          >
            <span className="block text-sm font-medium">💵 ငွေသား</span>
            <span className="mt-1 block text-xs text-forest/60 dark:text-mint/60">ယာဉ်မောင်းကို တိုက်ရိုက်ပေးပါ</span>
          </button>
        </div>

        {insufficient ? (
          <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
            လက်ကျန်ငွေ မလုံလောက်ပါ — {fmtMMK(total)} လိုအပ်ပြီး သင့်မှာ {fmtMMK(balance ?? 0)} သာ ရှိသည်။ ငွေဖြည့်ပါ သို့မဟုတ် ငွေသားဖြင့် ပေးပါ။
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="btn-outline flex-1">ပယ်ဖျက်မယ်</button>
          <button type="button" onClick={confirm} disabled={loading || insufficient} className="btn-primary flex-1">
            {loading ? "ဘွတ်ကင်လုပ်နေသည်…" : `အတည်ပြုမယ် · ${fmtMMK(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
