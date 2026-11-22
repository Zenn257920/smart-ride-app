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
  const namedPassengers = passengers.map((p) => p.name).filter((n) => n && n !== "Passenger");
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
          <span className="badge shrink-0">{Math.round(match)}% match</span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <p className="min-w-0 truncate"><span className="text-forest/60 dark:text-mint/60">Driver: </span>{rideDriverName(ride)}</p>
        <p className="min-w-0 truncate"><span className="text-forest/60 dark:text-mint/60">Vehicle: </span>{rideCar(ride) || "—"}{ridePlate(ride) ? ` · ${ridePlate(ride)}` : ""}</p>
        <p><span className="text-forest/60 dark:text-mint/60">Seats: </span>{seats ?? "—"}{seatsTotal != null ? ` / ${seatsTotal}` : ""}</p>
        <p><span className="text-forest/60 dark:text-mint/60">Passengers: </span>{namedPassengers.length ? namedPassengers.join(", ") : passengers.length ? `${passengers.length} rider${passengers.length === 1 ? "" : "s"}` : "None yet"}</p>
        {dist != null ? <p><span className="text-forest/60 dark:text-mint/60">Distance: </span>{dist.toFixed(1)} km</p> : null}
        {ride.savings != null && Number(ride.savings) > 0 ? (
          <p className="text-forest"><span className="text-forest/60 dark:text-mint/60">You save: </span>{fmtMMK(Number(ride.savings))}</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-forest/10 pt-3 dark:border-mint/10">
        <div className="text-sm">
          {fare != null ? <p>Fare share: <span className="font-medium">{fmtMMK(fare)}</span></p> : null}
          {fee != null ? <p className="text-forest/60 dark:text-mint/60">App fee (5%): {fmtMMK(fee)}</p> : null}
          <p className="mt-1 text-base font-medium text-forest dark:text-mint">
            Total: {total != null ? fmtMMK(total) : "—"}
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
            Book now
          </button>
        ) : null}
      </div>
    </article>
  );
}
