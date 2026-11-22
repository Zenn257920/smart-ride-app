"use client";

import { useState } from "react";
import {
  apiFetch,
  fmtMMK,
  fmtTime,
  rideAppFee,
  rideDriverName,
  rideEnd,
  rideFareShare,
  rideStart,
  rideTime,
  rideTotal,
  type RideLike,
} from "@/lib/api";

interface BookingModalProps {
  ride: RideLike;
  balance: number | null;
  onClose: () => void;
  onBooked: () => void;
}

export default function BookingModal({ ride, balance, onClose, onBooked }: BookingModalProps) {
  const [method, setMethod] = useState<"ewallet" | "cash">("ewallet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const total = rideTotal(ride) ?? 0;
  const fare = rideFareShare(ride);
  const fee = rideAppFee(ride);
  const insufficient = method === "ewallet" && balance != null && balance < total;

  async function confirm() {
    setError("");
    setLoading(true);
    try {
      await apiFetch(`/api/rides/${ride.id}/book`, {
        method: "POST",
        body: JSON.stringify({ paymentMethod: method }),
      });
      onBooked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Book ride">
      <div className="card w-full max-w-md rounded-b-none p-6 sm:rounded-b-[20px]">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium text-forest dark:text-mint">Book this ride</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full px-2 py-1 text-forest/60 hover:bg-mint-soft dark:text-mint/60">✕</button>
        </div>

        <p className="mt-2 text-sm text-forest/80 dark:text-mint/80">
          {rideStart(ride)} → {rideEnd(ride)}
        </p>
        <p className="text-sm text-forest/60 dark:text-mint/60">
          {rideDriverName(ride)} · {fmtTime(rideTime(ride))}
        </p>

        <div className="mt-4 space-y-1.5 border-y border-forest/10 py-3 text-sm dark:border-mint/10">
          {fare != null ? (
            <p className="flex justify-between"><span>Fare share</span><span>{fmtMMK(fare)}</span></p>
          ) : null}
          {fee != null ? (
            <p className="flex justify-between"><span>App fee (5%)</span><span>{fmtMMK(fee)}</span></p>
          ) : null}
          <p className="flex justify-between font-medium text-base"><span>Total</span><span>{fmtMMK(total)}</span></p>
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
              Balance: {balance != null ? fmtMMK(balance) : "—"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMethod("cash")}
            aria-pressed={method === "cash"}
            className={`rounded-[12px] border-2 p-3 text-left ${method === "cash" ? "border-forest bg-mint-soft dark:border-mint dark:bg-forest-soft" : "border-forest/15 dark:border-mint/15"}`}
          >
            <span className="block text-sm font-medium">💵 Cash</span>
            <span className="mt-1 block text-xs text-forest/60 dark:text-mint/60">Pay the driver directly</span>
          </button>
        </div>

        {insufficient ? (
          <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
            Insufficient wallet balance — you need {fmtMMK(total)} but have {fmtMMK(balance ?? 0)}. Top up your wallet or pay by cash.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="btn-outline flex-1">Cancel</button>
          <button type="button" onClick={confirm} disabled={loading || insufficient} className="btn-primary flex-1">
            {loading ? "Booking…" : `Confirm · ${fmtMMK(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
