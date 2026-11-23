// Shared client helpers for the Smart Ride UI.
// API shapes are deliberately loose: the API agent owns the exact field
// names, so every accessor below tolerates snake_case/camelCase variants
// and missing fields. See the report for the full assumed-field list.

export const YANGON: { lat: number; lng: number } = { lat: 16.8409, lng: 96.1735 };

export function fmtMMK(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("en-US")} ကျပ်`;
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function fmtTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Yangon",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", { timeZone: "Asia/Yangon", day: "numeric", month: "short", year: "numeric" });
}

/** Local datetime-local value (Asia/Yangon) for prefilling inputs. */
export function localInputValue(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yangon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: unknown })?.error ??
      (data as { message?: unknown })?.message ??
      `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : `Request failed (${res.status})`);
  }
  return data as T;
}

/** Unwrap {data} / {items} / {rides} / plain-array responses into an array. */
export function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["data", "items", "rides", "requests", "bookings", "transactions", "notifications", "matches", "pendingRequests"]) {
      if (Array.isArray(o[k])) return o[k] as T[];
    }
  }
  return [];
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RideLike {
  id: string;
  driverId?: string;
  driver_id?: string;
  driverName?: string;
  driver_name?: string;
  driver?: { id?: string; name?: string; phone?: string; rating?: number };
  // D3: present ONLY when the viewer is a party to a confirmed /
  // completed booking on this ride (server drops the key otherwise).
  driverPhone?: string;
  driver_phone?: string;
  // D4: trip state (scheduled | started | arrived) + latest driver
  // position, present on my-rides / driver-dashboard ride rows.
  tripStatus?: string;
  trip_status?: string;
  driverLat?: number;
  driver_lat?: number;
  driverLng?: number;
  driver_lng?: number;
  driverLocationAt?: string;
  driver_location_at?: string;
  startLabel?: string;
  start_label?: string;
  endLabel?: string;
  end_label?: string;
  startLat?: number;
  start_lat?: number;
  startLng?: number;
  start_lng?: number;
  endLat?: number;
  end_lat?: number;
  endLng?: number;
  end_lng?: number;
  departureTime?: string;
  departure_time?: string;
  seatsTotal?: number;
  seats_total?: number;
  seatsAvailable?: number;
  seats_available?: number;
  carModel?: string;
  car_model?: string;
  carPlate?: string;
  car_plate?: string;
  status?: string;
  routeCoordinates?: Array<[number, number]>;
  route_coordinates?: Array<[number, number]>;
  passengers?: Array<{ id?: string; name?: string; passengerId?: string; passenger_id?: string; passengerName?: string; phone?: string; passengerPhone?: string; passenger_phone?: string }>;
  passengerCount?: number;
  matchScore?: number;
  match_score?: number;
  matchPercentage?: number;
  match_percentage?: number;
  distanceKm?: number;
  distance_km?: number;
  fareShare?: number;
  fare_share?: number;
  appFee?: number;
  app_fee?: number;
  appCommissionPerPassenger?: number;
  totalPrice?: number;
  total_price?: number;
  discountedPrice?: number;
  discounted_price?: number;
  passengerPrice?: number;
  savings?: number;
  price?: number;
  [key: string]: unknown;
}

export interface BookingLike {
  id: string;
  rideId?: string;
  ride_id?: string;
  ride?: RideLike;
  passengerId?: string;
  passenger_id?: string;
  passengerName?: string;
  seats?: number;
  fareShare?: number;
  fare_share?: number;
  appFee?: number;
  app_fee?: number;
  totalPrice?: number;
  total_price?: number;
  paymentMethod?: string;
  payment_method?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  departureTime?: string;
  departure_time?: string;
  [key: string]: unknown;
}

export interface WalletTx {
  id: string;
  type?: string;
  amount?: number;
  description?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  referenceId?: string;
  [key: string]: unknown;
}

export interface NotificationLike {
  id: string;
  message?: string;
  type?: string;
  read?: boolean;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface RideRequestLike {
  id: string;
  passengerId?: string;
  passenger_id?: string;
  passengerName?: string;
  passenger_name?: string;
  startLabel?: string;
  start_label?: string;
  endLabel?: string;
  end_label?: string;
  startLat?: number;
  start_lat?: number;
  startLng?: number;
  start_lng?: number;
  endLat?: number;
  end_lat?: number;
  endLng?: number;
  end_lng?: number;
  departureTime?: string;
  departure_time?: string;
  status?: string;
  estimatedPrice?: number;
  estimated_price?: number;
  prepaidAmount?: number;
  prepaid_amount?: number;
  passengers?: Array<{ id?: string; passengerId?: string; passenger_id?: string; name?: string; passengerName?: string; passenger_name?: string; fareShare?: number; totalPrice?: number; status?: string }>;
  passengerCount?: number;
  // Unified matching: best score (0–100) against the searched trip /
  // the driver's offered rides, or null when nothing matched.
  matchScore?: number | null;
  matchPercentage?: number | null;
  // The driver's ride that produced matchScore (pending / scored
  // variants only), or null.
  matchedRide?: { id: string; startLabel: string; endLabel: string } | null;
  // Search requestMatches only: joined members / seats left (4 max).
  memberCount?: number;
  seatsLeft?: number;
  [key: string]: unknown;
}

export function rideStart(r: RideLike): string {
  return r.startLabel ?? r.start_label ?? "—";
}
export function rideEnd(r: RideLike): string {
  return r.endLabel ?? r.end_label ?? "—";
}
export function rideStartLat(r: RideLike): number | undefined {
  return r.startLat ?? r.start_lat ?? undefined;
}
export function rideStartLng(r: RideLike): number | undefined {
  return r.startLng ?? r.start_lng ?? undefined;
}
export function rideEndLat(r: RideLike): number | undefined {
  return r.endLat ?? r.end_lat ?? undefined;
}
export function rideEndLng(r: RideLike): number | undefined {
  return r.endLng ?? r.end_lng ?? undefined;
}
export function rideTime(r: RideLike): string | undefined {
  return r.departureTime ?? r.departure_time;
}
export function rideDriverName(r: RideLike): string {
  return r.driverName ?? r.driver_name ?? r.driver?.name ?? "Driver";
}
export function rideCar(r: RideLike): string {
  return r.carModel ?? r.car_model ?? "";
}
export function ridePlate(r: RideLike): string {
  return r.carPlate ?? r.car_plate ?? "";
}
export function rideSeatsAvailable(r: RideLike): number | undefined {
  return r.seatsAvailable ?? r.seats_available;
}
export function rideSeatsTotal(r: RideLike): number | undefined {
  return r.seatsTotal ?? r.seats_total;
}
export function rideRoute(r: RideLike): Array<[number, number]> | undefined {
  return r.routeCoordinates ?? r.route_coordinates;
}
export function rideTotal(r: RideLike): number | undefined {
  return r.totalPrice ?? r.total_price ?? r.discountedPrice ?? r.discounted_price ?? r.passengerPrice ?? r.price;
}
export function rideFareShare(r: RideLike): number | undefined {
  return r.fareShare ?? r.fare_share;
}
export function rideAppFee(r: RideLike): number | undefined {
  return r.appFee ?? r.app_fee ?? r.appCommissionPerPassenger;
}
export function rideMatch(r: RideLike): number | undefined {
  return r.matchScore ?? r.match_score ?? r.matchPercentage ?? r.match_percentage;
}
export function rideDistance(r: RideLike): number | undefined {
  return r.distanceKm ?? r.distance_km;
}
export function ridePassengers(r: RideLike): Array<{ id?: string; name?: string; phone?: string }> {
  const p = (r.passengers ?? []) as Array<Record<string, unknown>>;
  return p.map((x) => ({
    id: (x.id ?? x.passengerId ?? x.passenger_id) as string | undefined,
    name: (x.name ?? x.passengerName ?? "Passenger") as string,
    // D3: only present when the server included it (viewer is the
    // ride's driver and the booking is confirmed). Never present on
    // search / open-ride lists, so strangers see no phone here.
    phone: (x.phone ?? x.passengerPhone ?? x.passenger_phone) as string | undefined,
  }));
}

/** The driver's phone for this ride, when the server included it (D3). */
export function rideDriverPhone(r: RideLike): string | undefined {
  return r.driverPhone ?? r.driver_phone ?? r.driver?.phone ?? undefined;
}

/** The trip state for this ride (D4), defaulting to 'scheduled'. */
export function rideTripStatus(r: RideLike): string {
  return r.tripStatus ?? r.trip_status ?? "scheduled";
}

// --- Geocode / route proxies -------------------------------------------------

export interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

export async function geocode(q: string): Promise<GeocodeHit[]> {
  const data = await apiFetch<unknown>(`/api/geocode?q=${encodeURIComponent(q)}`);
  const arr = asArray<Record<string, unknown>>(data);
  return arr
    .map((x) => {
      const lat = Number(x.lat ?? x.latitude);
      const lng = Number(x.lon ?? x.lng ?? x.longitude);
      const label = String(x.display_name ?? x.displayName ?? x.label ?? x.name ?? "");
      if (!label || Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return { label, lat, lng };
    })
    .filter((x): x is GeocodeHit => x !== null)
    .slice(0, 6);
}

export interface RouteResult {
  coordinates: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
}

export async function fetchRoute(
  start: LatLng,
  end: LatLng,
): Promise<RouteResult | null> {
  try {
    const data = await apiFetch<unknown>(
      `/api/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}`,
    );
    const o = data as Record<string, unknown>;
    const routes = (o.routes as Array<Record<string, unknown>> | undefined) ?? [];
    const first = routes[0];
    if (first) {
      const geom = first.geometry as { coordinates?: Array<[number, number]> } | undefined;
      const coords = (geom?.coordinates ?? []).map(([lng, lat]): [number, number] => [lat, lng]);
      return {
        coordinates: coords.length ? coords : [[start.lat, start.lng], [end.lat, end.lng]],
        distanceKm: Number(first.distance ?? 0) / 1000,
        durationMin: Math.round(Number(first.duration ?? 0) / 60),
      };
    }
    if (Array.isArray(o.coordinates)) {
      const coords = (o.coordinates as Array<[number, number]>).map(([a, b]): [number, number] =>
        // Accept either [lat,lng] or OSRM [lng,lat]; Yangon lat ~16.8, lng ~96.2
        Math.abs(a - 16.8) < Math.abs(b - 16.8) ? [a, b] : [b, a],
      );
      return {
        coordinates: coords,
        distanceKm: Number(o.distanceKm ?? o.distance_km ?? 0),
        durationMin: Number(o.durationMin ?? 0),
      };
    }
    return null;
  } catch {
    return null;
  }
}
