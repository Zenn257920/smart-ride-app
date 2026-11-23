"use client";

import {
  fmtMMK,
  fmtTime,
  rideAppFee,
  rideCar,
  rideDistance,
  rideDriverName,
  rideEnd,
  rideFareShare,
  rideMatch,
  ridePassengers,
  ridePlate,
  rideSeatsAvailable,
  rideSeatsTotal,
  rideStart,
  rideTime,
  rideTotal,
  type RideLike,
} from "@/lib/api";
import { Phone } from "lucide-react";

interface RideCardProps {
  ride: RideLike;
  selected?: boolean;
  onSelect?: (ride: RideLike) => void;
  onBook?: (ride: RideLike) => void;
  showMatch?: boolean;
}

export default function RideCard({ ride, selected, onSelect, onBook, showMatch = true }: RideCardProps) {
  const match = rideMatch(ride);
  const total = rideTotal(ride);
  const fare = rideFareShare(ride);
  const fee = rideAppFee(ride);
  const seats = rideSeatsAvailable(ride);
  const seatsTotal = rideSeatsTotal(ride);
  const passengers = ridePassengers(ride);
  const dist = rideDistance(ride);

  return (
    <article
      onClick={() => onSelect?.(ride)}
      className={`card cursor-pointer transition-shadow hover:shadow-[0_4px_24px_rgba(30,73,39,0.16)] ${
        selected ? "ring-2 ring-forest dark:ring-mint" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-forest dark:text-mint">
            {rideStart(ride)} → {rideEnd(ride)}
          </p>
          <p className="mt-1 text-sm text-forest/70 dark:text-mint/70">{fmtTime(rideTime(ride))}</p>
        </div>
        {showMatch && match != null ? (
          <span className="badge shrink-0">{Math.round(match)}% ကိုက်ညီသည်</span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <p className="min-w-0 truncate"><span className="text-forest/60 dark:text-mint/60">ယာဉ်မောင်း: </span>{rideDriverName(ride)}</p>
        <p className="min-w-0 truncate"><span className="text-forest/60 dark:text-mint/60">ယာဉ်: </span>{rideCar(ride) || "—"}{ridePlate(ride) ? ` · ${ridePlate(ride)}` : ""}</p>
        <p><span className="text-forest/60 dark:text-mint/60">ထိုင်ခုံ: </span>{seats ?? "—"}{seatsTotal != null ? ` / ${seatsTotal}` : ""}</p>
        <p>
          <span className="text-forest/60 dark:text-mint/60">ခရီးသည်: </span>
          {passengers.length === 0 ? (
            "မရှိသေးပါ"
          ) : (
            passengers.map((p, i) => (
              <span key={p.id ?? i}>
                {i > 0 ? ", " : ""}
                {p.name}
                {/* D3: phone is only in the data when the server scoped
                    it to this viewer (the ride's driver, confirmed
                    booking) — search lists never carry it. */}
                {p.phone ? (
                  <>
                    {" "}
                    <a href={`tel:${p.phone}`} onClick={(e) => e.stopPropagation()} className="underline">
                      <Phone aria-hidden className="mr-0.5 inline h-3.5 w-3.5" /> {p.phone}
                    </a>
                  </>
                ) : null}
              </span>
            ))
          )}
        </p>
        {dist != null ? <p><span className="text-forest/60 dark:text-mint/60">အကွာအဝေး: </span>{dist.toFixed(1)} km</p> : null}
        {ride.savings != null && Number(ride.savings) > 0 ? (
          <p className="text-forest"><span className="text-forest/60 dark:text-mint/60">သင်သက်သာမည့်ငွေ: </span>{fmtMMK(Number(ride.savings))}</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-forest/10 pt-3 dark:border-mint/10">
        <div className="text-sm">
          {fare != null ? <p>ခရီးစဉ်ခ ဝေစု: <span className="font-medium">{fmtMMK(fare)}</span></p> : null}
          {fee != null ? <p className="text-forest/60 dark:text-mint/60">အက်ပ်အခွန် (5%): {fmtMMK(fee)}</p> : null}
          <p className="mt-1 text-base font-medium text-forest dark:text-mint">
            စုစုပေါင်း: {total != null ? fmtMMK(total) : "—"}
          </p>
        </div>
        {onBook ? (
          <button
            type="button"
            className="btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              onBook(ride);
            }}
          >
            အခုပဲ ဘွတ်ကင်လုပ်မယ်
          </button>
        ) : null}
      </div>
    </article>
  );
}
