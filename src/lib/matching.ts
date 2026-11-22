/**
 * Route matching + fair pricing — pure logic, no I/O, no browser APIs.
 *
 * TypeScript port of the old app's `src/js/matching.js` (RouteMatcher).
 * Every method name, constant and numeric behaviour is kept identical to
 * the original; see BUILD_SPEC.md §5. Do NOT add Gemini / API keys /
 * localStorage here — this module must stay runnable in Node/vitest.
 */

// ---------------------------------------------------------------------------
// Pricing / matching constants (same values as the original matching.js)
// ---------------------------------------------------------------------------

/** Base fare added to every distance price (MMK). */
export const BASE_FARE = 1500;
/** Per-kilometre rate (MMK). */
export const RATE_PER_KM = 500;
/** Fallback ride price when a ride has no price set (MMK). */
export const DEFAULT_PRICE = 7500;
/** App tax / commission rate applied on top of the fare share (5%). */
export const APP_TAX_RATE = 0.05;
/** App commission rate (5%). Kept separate from APP_TAX_RATE as in the original. */
export const APP_COMMISSION_RATE = 0.05;
/** Driver bonus rate (0 — no bonus in v1). */
export const DRIVER_BONUS_RATE = 0;
/** Max distance from the driver's straight-line corridor for a pickup (km). */
export const PICKUP_THRESHOLD_KM = 2.0;
/** Max distance from the driver's straight-line corridor for a dropoff (km). */
export const DROPOFF_THRESHOLD_KM = 2.5;
/** Max bearing difference between passenger and driver direction (degrees). */
export const BEARING_MAX_DIFF_DEG = 65;
/** Max departure-time difference for a match (minutes). */
export const TIME_WINDOW_MINUTES = 120;
/** Max distance from the driver's polyline route for a pickup (km). */
export const POLYLINE_PICKUP_THRESHOLD_KM = 2.0;
/** Max distance from the driver's polyline route for a dropoff (km). */
export const POLYLINE_DROPOFF_THRESHOLD_KM = 2.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A latitude/longitude point. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Coordinates shared by rides, ride requests and passengers.
 * All fields are optional/nullable because callers pass partial objects
 * (e.g. name-only requests with no coordinates at all).
 */
export interface RideCoords {
  id?: string;
  passengerId?: string;
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  departureTime?: string | Date | null;
  /** Driver route polyline as [lat, lng] pairs (OSRM / Leaflet order). */
  routeCoordinates?: Array<[number, number]>;
}

/** A passenger (or ride request) taking part in a shared ride. */
export type PassengerCoords = RideCoords;

/** A driver-offered ride. */
export interface Ride extends RideCoords {
  /** Listed ride price (MMK); falls back to DEFAULT_PRICE when absent. */
  price?: number;
  /** Driver's total route distance in km (when known). */
  distanceKm?: number;
  /** Passengers already on the ride. */
  passengers?: PassengerCoords[];
}

/** One passenger's position on the driver's route, normalised 0.0–1.0. */
export interface SegmentPassenger {
  id: string;
  /** Normalised position of the pickup on the driver's route. */
  startT: number;
  /** Normalised position of the dropoff on the driver's route. */
  endT: number;
}

/** Segment-based pricing input: the driver's route + each rider's span. */
export interface SegmentData {
  totalRouteKm: number;
  passengers: SegmentPassenger[];
}

export interface FairPriceOptions {
  segmentData?: SegmentData;
}

/** Per-passenger fare split returned by calculateFairPriceBreakdown. */
export interface PriceBreakdown {
  fareShare: number;
  driverBonusPerPassenger: number;
  appCommissionPerPassenger: number;
  passengerPrice: number;
  /** Passenger's own (or equivalent) distance, rounded to 1 decimal. */
  distanceKm: number;
  weightPercent: number;
  /** Segment mode only: km actually paid for after sharing splits. */
  equivalentKm?: number;
  /** Segment mode only: mirrors equivalentKm in the original. */
  soloKm?: number;
}

/** Result of isOnDriverCorridor / isOnDriverRoute. */
export interface CorridorMatch {
  bearingDiff: number;
  pickupDist: number;
  dropoffDist: number;
  pickupT: number;
  dropoffT: number;
  pickupSegment?: number;
  dropoffSegment?: number;
  usedPolyline?: boolean;
}

/** Result of _pointToSegment / _pointToPolyline. */
export interface PointProjection {
  distance: number;
  /** Segment-local parameter 0–1 (polyline: within the best segment). */
  t: number;
  segmentIndex?: number;
  /** Polyline only: position along the whole route, 0–1. */
  globalT?: number;
}

/** Input for priceNewBooking: one ride + the riders already on board. */
export interface NewBookingPriceInput {
  /** Listed ride price (MMK) — what the first rider pays as fareShare. */
  basePrice: number;
  /** Driver's total route distance in km (when known). */
  distanceKm?: number;
  /** Driver route: start/end coords + optional polyline. */
  ride: RideCoords;
  /** Passengers already confirmed on the ride, each with the coords they
   * ride (bookings store none, so callers pass the ride's own coords —
   * a full-route rider). */
  existingPassengers: PassengerCoords[];
  /** The rider now booking / being priced. */
  newRider: PassengerCoords;
}

/** Result of priceNewBooking: one breakdown per rider, new rider last. */
export interface NewBookingPrice {
  isFirstRider: boolean;
  /** Breakdowns in rider order: existing passengers first, new rider last. */
  breakdowns: PriceBreakdown[];
  /** The new rider's own breakdown (== breakdowns[breakdowns.length - 1]). */
  newRider: PriceBreakdown;
}

/** A ride enriched with its match score and the new rider's pricing. */
export interface MatchResult extends Ride {
  matchScore: number;
  matchPercentage: number;
  originalPrice: number;
  isFirstRider: boolean;
  discountedPrice: number;
  fareShare: number;
  driverBonusPerPassenger: number;
  appCommissionPerPassenger: number;
  driverEarnings: number;
  appCommissionTotal: number;
  savings: number;
  savingsPercentage: number;
  totalPassengers: number;
  passengerDistanceKm: number;
  passengerWeightPercent: number;
}

/** One suggested carpool group of compatible ride requests. */
export interface CarpoolGroup {
  passengers: PassengerCoords[];
  count: number;
  totalPrice: number;
  driverEarnings: number;
  appCommissionTotal: number;
  perPassengerBreakdowns: PriceBreakdown[];
  pricePerPerson: number;
  savingsPerPerson: number;
  totalSavings: number;
}

/** Price preview returned by estimatePrice. */
export interface PriceEstimate {
  basePrice: number;
  discountedPrice: number;
  driverEarnings: number;
  appCommissionTotal: number;
  savings: number;
  savingsPercentage: number;
}

/** Price for one passenger's own route (calculatePriceFromCoords). */
export interface CoordsPrice {
  price: number;
  passengerCost: number;
  appTax: number;
  distanceKm: number;
}

/** Route summary returned by calculateOptimalRoute. */
export interface OptimalRoute {
  distance: number;
  estimatedTime: number;
  waypoints: LatLng[];
}

interface Segment {
  segStart: number;
  segEnd: number;
  segKm: number;
  ridersOnSegment: number[];
}

// ---------------------------------------------------------------------------
// RouteMatcher
// ---------------------------------------------------------------------------

export class RouteMatcher {
  readonly BASE_FARE = BASE_FARE;
  readonly RATE_PER_KM = RATE_PER_KM;
  readonly DEFAULT_PRICE = DEFAULT_PRICE;

  readonly APP_TAX_RATE = APP_TAX_RATE;

  readonly DRIVER_BONUS_RATE = DRIVER_BONUS_RATE;
  readonly APP_COMMISSION_RATE = APP_COMMISSION_RATE;

  readonly PICKUP_THRESHOLD_KM = PICKUP_THRESHOLD_KM;
  readonly DROPOFF_THRESHOLD_KM = DROPOFF_THRESHOLD_KM;
  readonly BEARING_MAX_DIFF_DEG = BEARING_MAX_DIFF_DEG;
  readonly TIME_WINDOW_MINUTES = TIME_WINDOW_MINUTES;

  readonly POLYLINE_PICKUP_THRESHOLD_KM = POLYLINE_PICKUP_THRESHOLD_KM;
  readonly POLYLINE_DROPOFF_THRESHOLD_KM = POLYLINE_DROPOFF_THRESHOLD_KM;

  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  _toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  calculateDistancePrice(distanceKm: number): number {
    return this.BASE_FARE + Math.floor(distanceKm * this.RATE_PER_KM);
  }

  calculatePassengerCost(distanceKm: number): number {
    const subtotal = this.calculateDistancePrice(distanceKm);
    return Math.floor(subtotal * (1 + this.APP_TAX_RATE));
  }

  calculatePriceFromCoords(
    startLat: number | null | undefined,
    startLng: number | null | undefined,
    endLat: number | null | undefined,
    endLng: number | null | undefined,
  ): CoordsPrice | null {
    if (
      startLat == null ||
      startLng == null ||
      endLat == null ||
      endLng == null
    ) {
      return null;
    }
    const distanceKm = this.calculateDistance(
      startLat,
      startLng,
      endLat,
      endLng,
    );
    const subtotal = this.calculateDistancePrice(distanceKm);
    const appTax = Math.floor(subtotal * this.APP_TAX_RATE);
    const passengerCost = subtotal + appTax;
    return {
      price: subtotal,
      passengerCost,
      appTax,
      distanceKm: Math.round(distanceKm * 10) / 10,
    };
  }

  /**
   * Calculate fair price breakdown for shared rides.
   *
   * When segmentData is provided, uses segment-based pricing where each
   * segment of the route is split among riders present on that segment.
   * Otherwise falls back to individual distance-based pricing.
   *
   * @param totalRoutePrice - Base route price (unused in segment mode)
   * @param passengerDistances - Each passenger's individual distance
   * @param options - Optional configuration
   * @param options.segmentData - Segment-based pricing data
   */
  calculateFairPriceBreakdown(
    totalRoutePrice: number,
    passengerDistances: number[],
    options?: FairPriceOptions,
  ): PriceBreakdown[] {
    if (passengerDistances.length === 0) {
      return [];
    }

    const totalKm = passengerDistances.reduce((a, b) => a + b, 0);

    if (totalKm === 0) {
      return passengerDistances.map(() =>
        this._equalShareBreakdown(totalRoutePrice, passengerDistances.length),
      );
    }

    // --- Segment-based pricing (new) ---
    if (options && options.segmentData) {
      return this._segmentBasedBreakdown(
        options.segmentData,
        passengerDistances,
      );
    }

    // --- Fallback: individual distance-based pricing (original) ---
    return passengerDistances.map((myKm) => {
      const weight = myKm / totalKm;
      const fareShare = this.calculateDistancePrice(myKm);
      const appFee = Math.floor(fareShare * this.APP_TAX_RATE);
      const passengerPrice = fareShare + appFee;

      return {
        fareShare,
        driverBonusPerPassenger: 0,
        appCommissionPerPassenger: appFee,
        passengerPrice,
        distanceKm: Math.round(myKm * 10) / 10,
        weightPercent: Math.round(weight * 100),
      };
    });
  }

  /**
   * Segment-based pricing: split the driver's route into segments at each
   * passenger's pickup/dropoff point. Each segment's fare is divided equally
   * among riders present on that segment.
   */
  _segmentBasedBreakdown(
    segmentData: SegmentData,
    passengerDistances: number[],
  ): PriceBreakdown[] {
    const { totalRouteKm, passengers } = segmentData;

    // Collect all unique breakpoints (T values) from passenger start/end
    const breakpointSet = new Set<number>();
    breakpointSet.add(0);
    breakpointSet.add(1);
    for (const p of passengers) {
      breakpointSet.add(Math.max(0, Math.min(1, p.startT)));
      breakpointSet.add(Math.max(0, Math.min(1, p.endT)));
    }
    const breakpoints = Array.from(breakpointSet).sort((a, b) => a - b);

    // Build segments between consecutive breakpoints
    const segments: Segment[] = [];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const segStart = breakpoints[i];
      const segEnd = breakpoints[i + 1];
      const segKm = (segEnd - segStart) * totalRouteKm;

      // Find which passengers are riding on this segment
      const ridersOnSegment: number[] = [];
      for (let pIdx = 0; pIdx < passengers.length; pIdx++) {
        const p = passengers[pIdx];
        // Passenger rides segment if their range covers it
        // (startT <= segStart AND endT >= segEnd)
        if (p.startT <= segStart + 1e-9 && p.endT >= segEnd - 1e-9) {
          ridersOnSegment.push(pIdx);
        }
      }

      segments.push({ segStart, segEnd, segKm, ridersOnSegment });
    }

    // Accumulate equivalent km for each passenger
    const equivKm = new Array<number>(passengers.length).fill(0);
    for (const seg of segments) {
      if (seg.ridersOnSegment.length === 0) continue;
      const perPerson = seg.segKm / seg.ridersOnSegment.length;
      for (const pIdx of seg.ridersOnSegment) {
        equivKm[pIdx] += perPerson;
      }
    }

    // Total equivalent km determines each passenger's weight
    const totalEquivKm = equivKm.reduce((a, b) => a + b, 0);

    // Calculate fare for each passenger based on their equivalent km
    return passengers.map((p, i) => {
      const myEquivKm = equivKm[i];
      const fareShare = this.calculateDistancePrice(myEquivKm);
      const appFee = Math.floor(fareShare * this.APP_TAX_RATE);
      const passengerPrice = fareShare + appFee;
      const weight = totalEquivKm > 0 ? myEquivKm / totalEquivKm : 0;

      return {
        fareShare,
        driverBonusPerPassenger: 0,
        appCommissionPerPassenger: appFee,
        passengerPrice,
        distanceKm: Math.round((passengerDistances[i] || myEquivKm) * 10) / 10,
        equivalentKm: Math.round(myEquivKm * 10) / 10,
        soloKm: Math.round(
          (passengerDistances[i] - (passengerDistances[i] - myEquivKm)) * 10,
        ) / 10,
        weightPercent: Math.round(weight * 100),
      };
    });
  }

  _equalShareBreakdown(
    totalRoutePrice: number,
    passengerCount: number,
  ): PriceBreakdown {
    const fareShare = Math.floor(totalRoutePrice / passengerCount);
    const appFee = Math.floor(fareShare * this.APP_TAX_RATE);
    return {
      fareShare,
      driverBonusPerPassenger: 0,
      appCommissionPerPassenger: appFee,
      passengerPrice: fareShare + appFee,
      distanceKm: 0,
      weightPercent: Math.round(100 / passengerCount),
    };
  }

  /**
   * Build segmentData for calculateFairPriceBreakdown from passenger/driver objects.
   *
   * Resolves each passenger's pickupT/dropoffT on the driver's route using
   * isOnDriverRoute() or isOnDriverCorridor(). Falls back to proportional
   * estimation from straight-line distances when no route match is found.
   *
   * @returns segmentData or null if insufficient data
   */
  buildSegmentData(
    passengers: PassengerCoords[],
    driver: RideCoords,
    totalRouteKm: number,
  ): SegmentData | null {
    if (!passengers || passengers.length === 0 || totalRouteKm <= 0) {
      return null;
    }

    const segPassengers: SegmentPassenger[] = [];
    for (const p of passengers) {
      if (p.startLat == null || p.endLat == null) {
        // Can't determine position on route — return null to use fallback
        return null;
      }

      // Try polyline route match first
      let match = this.isOnDriverRoute(p, driver);
      if (!match) {
        // Try corridor match
        match = this.isOnDriverCorridor(p, driver);
      }

      if (match) {
        segPassengers.push({
          id: p.id || p.passengerId || `p${segPassengers.length}`,
          startT: match.pickupT,
          endT: match.dropoffT,
        });
      } else {
        // Estimate T position from straight-line distance ratios
        const startDist = this.calculateDistance(
          driver.startLat as number,
          driver.startLng as number,
          p.startLat,
          p.startLng as number,
        );
        const endDist = this.calculateDistance(
          driver.startLat as number,
          driver.startLng as number,
          p.endLat,
          p.endLng as number,
        );
        const driverDist = this.calculateDistance(
          driver.startLat as number,
          driver.startLng as number,
          driver.endLat as number,
          driver.endLng as number,
        );
        if (driverDist <= 0) return null;

        segPassengers.push({
          id: p.id || p.passengerId || `p${segPassengers.length}`,
          startT: Math.min(1, startDist / driverDist),
          endT: Math.min(1, endDist / driverDist),
        });
      }
    }

    return { totalRouteKm, passengers: segPassengers };
  }

  _bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = this._toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(this._toRad(lat2));
    const x =
      Math.cos(this._toRad(lat1)) * Math.sin(this._toRad(lat2)) -
      Math.sin(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  _bearingDiff(a: number, b: number): number {
    return Math.abs(((a - b + 180) % 360) - 180);
  }

  _pointToSegment(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): PointProjection {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return { distance: this.calculateDistance(py, px, ay, ax), t: 0 };
    }

    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const nearestLat = ay + t * dy;
    const nearestLng = ax + t * dx;
    return {
      distance: this.calculateDistance(py, px, nearestLat, nearestLng),
      t,
    };
  }

  isOnDriverCorridor(
    passenger: PassengerCoords,
    driver: RideCoords,
  ): CorridorMatch | null {
    const hasCoordsDriver =
      driver.startLat != null &&
      driver.startLng != null &&
      driver.endLat != null &&
      driver.endLng != null;
    const hasCoordsPassenger =
      passenger.startLat != null &&
      passenger.startLng != null &&
      passenger.endLat != null &&
      passenger.endLng != null;

    if (!hasCoordsDriver || !hasCoordsPassenger) return null;

    // hasCoordsDriver / hasCoordsPassenger above guarantee non-null coords.
    const driverBearing = this._bearing(
      driver.startLat as number,
      driver.startLng as number,
      driver.endLat as number,
      driver.endLng as number,
    );
    const passengerBearing = this._bearing(
      passenger.startLat as number,
      passenger.startLng as number,
      passenger.endLat as number,
      passenger.endLng as number,
    );
    const bearingDiff = this._bearingDiff(driverBearing, passengerBearing);
    if (bearingDiff > this.BEARING_MAX_DIFF_DEG) return null;

    const pickup = this._pointToSegment(
      passenger.startLng as number,
      passenger.startLat as number,
      driver.startLng as number,
      driver.startLat as number,
      driver.endLng as number,
      driver.endLat as number,
    );
    if (pickup.distance > this.PICKUP_THRESHOLD_KM) return null;

    const dropoff = this._pointToSegment(
      passenger.endLng as number,
      passenger.endLat as number,
      driver.startLng as number,
      driver.startLat as number,
      driver.endLng as number,
      driver.endLat as number,
    );
    if (dropoff.distance > this.DROPOFF_THRESHOLD_KM) return null;

    if (pickup.t >= dropoff.t) return null;

    return {
      bearingDiff,
      pickupDist: pickup.distance,
      dropoffDist: dropoff.distance,
      pickupT: pickup.t,
      dropoffT: dropoff.t,
    };
  }

  _pointToPolyline(
    px: number,
    py: number,
    routeCoords: Array<[number, number]>,
    thresholdKm: number,
  ): PointProjection | null {
    let bestDist = Infinity;
    let bestSegment = -1;
    let bestT = 0;

    for (let i = 0; i < routeCoords.length - 1; i++) {
      const [aLat, aLng] = routeCoords[i];
      const [bLat, bLng] = routeCoords[i + 1];

      const result = this._pointToSegment(px, py, aLng, aLat, bLng, bLat);
      if (result.distance < bestDist) {
        bestDist = result.distance;
        bestSegment = i;
        bestT = result.t;
      }

      if (bestDist < 0.1) break;
    }

    if (bestDist > thresholdKm) return null;

    const globalT = (bestSegment + bestT) / (routeCoords.length - 1);

    return { distance: bestDist, segmentIndex: bestSegment, t: bestT, globalT };
  }

  isOnDriverRoute(
    passenger: PassengerCoords,
    driver: RideCoords,
  ): CorridorMatch | null {
    if (!driver.routeCoordinates || driver.routeCoordinates.length < 2)
      return null;

    const hasCoordsPassenger =
      passenger.startLat != null &&
      passenger.startLng != null &&
      passenger.endLat != null &&
      passenger.endLng != null;
    if (!hasCoordsPassenger) return null;

    const driverBearing = this._bearing(
      driver.routeCoordinates[0][0],
      driver.routeCoordinates[0][1],
      driver.routeCoordinates[driver.routeCoordinates.length - 1][0],
      driver.routeCoordinates[driver.routeCoordinates.length - 1][1],
    );
    // hasCoordsPassenger above guarantees non-null passenger coords.
    const passengerBearing = this._bearing(
      passenger.startLat as number,
      passenger.startLng as number,
      passenger.endLat as number,
      passenger.endLng as number,
    );
    const bearingDiff = this._bearingDiff(driverBearing, passengerBearing);
    if (bearingDiff > this.BEARING_MAX_DIFF_DEG) return null;

    const pickup = this._pointToPolyline(
      passenger.startLng as number,
      passenger.startLat as number,
      driver.routeCoordinates,
      this.POLYLINE_PICKUP_THRESHOLD_KM,
    );
    if (!pickup) return null;

    const dropoff = this._pointToPolyline(
      passenger.endLng as number,
      passenger.endLat as number,
      driver.routeCoordinates,
      this.POLYLINE_DROPOFF_THRESHOLD_KM,
    );
    if (!dropoff) return null;

    if (pickup.globalT! >= dropoff.globalT!) return null;

    return {
      bearingDiff,
      pickupDist: pickup.distance,
      dropoffDist: dropoff.distance,
      pickupT: pickup.globalT!,
      dropoffT: dropoff.globalT!,
      pickupSegment: pickup.segmentIndex,
      dropoffSegment: dropoff.segmentIndex,
      usedPolyline: true,
    };
  }

  buildDetourWaypoints(passenger: PassengerCoords, driver: RideCoords): LatLng[] {
    if (!driver.routeCoordinates || driver.routeCoordinates.length < 2) {
      return [
        { lat: passenger.startLat as number, lng: passenger.startLng as number },
        { lat: passenger.endLat as number, lng: passenger.endLng as number },
      ];
    }

    const pickup = this._pointToPolyline(
      passenger.startLng as number,
      passenger.startLat as number,
      driver.routeCoordinates,
      this.POLYLINE_PICKUP_THRESHOLD_KM * 2,
    );
    const dropoff = this._pointToPolyline(
      passenger.endLng as number,
      passenger.endLat as number,
      driver.routeCoordinates,
      this.POLYLINE_DROPOFF_THRESHOLD_KM * 2,
    );

    // NOTE: matches the original — pickup/dropoff are computed but the
    // returned waypoints are always just the passenger's start and end.
    void pickup;
    void dropoff;

    const waypoints: LatLng[] = [];
    waypoints.push({
      lat: passenger.startLat as number,
      lng: passenger.startLng as number,
    });
    waypoints.push({
      lat: passenger.endLat as number,
      lng: passenger.endLng as number,
    });

    return waypoints;
  }

  getPassengerDistance(
    passenger: PassengerCoords,
    driver: RideCoords,
  ): number {
    if (passenger.startLat != null && passenger.endLat != null) {
      return this.calculateDistance(
        passenger.startLat,
        passenger.startLng as number,
        passenger.endLat,
        passenger.endLng as number,
      );
    }

    if (driver.startLat != null && driver.endLat != null) {
      return this.calculateDistance(
        driver.startLat,
        driver.startLng as number,
        driver.endLat,
        driver.endLng as number,
      );
    }
    return 0;
  }

  calculateMatchScore(passenger: PassengerCoords, driver: RideCoords): number {
    if (
      !this._isWithinTimeWindow(passenger.departureTime, driver.departureTime)
    )
      return 0;

    let score = 0;

    const polylineResult = this.isOnDriverRoute(passenger, driver);

    if (polylineResult !== null) {
      const bearingScore = Math.round(
        25 * (1 - polylineResult.bearingDiff / this.BEARING_MAX_DIFF_DEG),
      );
      score += bearingScore;

      if (polylineResult.pickupDist < 0.3) score += 35;
      else if (polylineResult.pickupDist < 0.8) score += 30;
      else if (polylineResult.pickupDist < 1.2) score += 22;
      else score += 14;

      if (polylineResult.dropoffDist < 0.3) score += 25;
      else if (polylineResult.dropoffDist < 0.8) score += 22;
      else if (polylineResult.dropoffDist < 1.5) score += 15;
      else score += 8;

      score += 15;

      return Math.min(100, score);
    }

    const corridorResult = this.isOnDriverCorridor(passenger, driver);

    if (corridorResult !== null) {
      const bearingScore = Math.round(
        25 * (1 - corridorResult.bearingDiff / this.BEARING_MAX_DIFF_DEG),
      );
      score += bearingScore;

      if (corridorResult.pickupDist < 0.5) score += 35;
      else if (corridorResult.pickupDist < 1.0) score += 28;
      else if (corridorResult.pickupDist < 1.5) score += 20;
      else score += 12;

      if (corridorResult.dropoffDist < 0.5) score += 25;
      else if (corridorResult.dropoffDist < 1.0) score += 20;
      else if (corridorResult.dropoffDist < 2.0) score += 13;
      else score += 6;

      score += 15;
    } else {
      const hasFullCoordsDriver =
        driver.startLat != null &&
        driver.startLng != null &&
        driver.endLat != null &&
        driver.endLng != null;
      const hasFullCoordsPassenger =
        passenger.startLat != null &&
        passenger.startLng != null &&
        passenger.endLat != null &&
        passenger.endLng != null;

      if (hasFullCoordsDriver && hasFullCoordsPassenger) {
        return 0;
      }

      const startDist = this.calculateDistance(
        passenger.startLat ?? 0,
        passenger.startLng ?? 0,
        driver.startLat ?? 0,
        driver.startLng ?? 0,
      );
      const endDist = this.calculateDistance(
        passenger.endLat ?? 0,
        passenger.endLng ?? 0,
        driver.endLat ?? 0,
        driver.endLng ?? 0,
      );

      const hasAnyCoords =
        driver.startLat != null && passenger.startLat != null;
      if (!hasAnyCoords) return 0;

      if (startDist < 1) score += 40;
      else if (startDist < 3) score += 28;
      else if (startDist < 5) score += 14;

      if (endDist < 1) score += 40;
      else if (endDist < 3) score += 28;
      else if (endDist < 5) score += 14;

      score += 20;
    }

    return Math.min(100, score);
  }

  _isWithinTimeWindow(
    userTime: string | Date | null | undefined,
    rideTime: string | Date | null | undefined,
  ): boolean {
    if (!userTime || !rideTime) return true;
    const diffMin =
      Math.abs(new Date(userTime).getTime() - new Date(rideTime).getTime()) /
      60000;
    return diffMin <= this.TIME_WINDOW_MINUTES;
  }

  /**
   * Price a new booking on a ride — the ONE pricing function both search
   * (findOptimalMatches) and booking (POST /api/rides/:id/book) use, so
   * the price a rider sees is the price they are charged (A2).
   *
   * First rider: pays the full listed price + 5% fee. 2nd+ rider: the
   * fair segment split is recomputed over everyone on board (existing
   * passengers + the new rider) and the new rider pays their segment
   * breakdown — never the old simple split floor(basePrice / N).
   *
   * Callers pass the new rider's ACTUAL pickup/dropoff coords when they
   * have them (search does; booking does when the client sends the coords
   * it searched with). Without them the rider is treated as riding the
   * driver's full route, exactly as search treats a booking's passengers.
   */
  priceNewBooking(input: NewBookingPriceInput): NewBookingPrice {
    const { basePrice, distanceKm, ride, existingPassengers, newRider } =
      input;
    const passengerKm = this.getPassengerDistance(newRider, ride);
    const totalPassengers = existingPassengers.length + 1;
    const isFirstRider = totalPassengers === 1;

    if (isFirstRider) {
      const appTax = Math.floor(basePrice * this.APP_TAX_RATE);
      const breakdown: PriceBreakdown = {
        fareShare: basePrice,
        driverBonusPerPassenger: 0,
        appCommissionPerPassenger: appTax,
        passengerPrice: basePrice + appTax,
        distanceKm: Math.round(passengerKm * 10) / 10,
        weightPercent: 100,
      };
      return { isFirstRider: true, breakdowns: [breakdown], newRider: breakdown };
    }

    const existingPassengerDistances = existingPassengers.map((p) => {
      if (p.startLat != null && p.endLat != null) {
        return this.calculateDistance(
          p.startLat,
          p.startLng as number,
          p.endLat,
          p.endLng as number,
        );
      }
      if (ride.startLat != null && ride.endLat != null) {
        return this.calculateDistance(
          ride.startLat,
          ride.startLng as number,
          ride.endLat,
          ride.endLng as number,
        );
      }
      return passengerKm || 10;
    });
    const allDistances = [...existingPassengerDistances, passengerKm || 10];

    const allPassengerObjs: PassengerCoords[] = [
      ...existingPassengers.map((p, i) => ({
        id: p.id || p.passengerId || `p${i}`,
        startLat: p.startLat ?? ride.startLat,
        startLng: p.startLng ?? ride.startLng,
        endLat: p.endLat ?? ride.endLat,
        endLng: p.endLng ?? ride.endLng,
      })),
      {
        id: newRider.id || newRider.passengerId || "new",
        startLat: newRider.startLat,
        startLng: newRider.startLng,
        endLat: newRider.endLat,
        endLng: newRider.endLng,
      },
    ];

    const driverRouteKm =
      distanceKm ||
      this.getPassengerDistance(
        {
          startLat: ride.startLat,
          startLng: ride.startLng,
          endLat: ride.endLat,
          endLng: ride.endLng,
        },
        ride,
      ) ||
      allDistances.reduce((a, b) => Math.max(a, b), 0);

    const segmentData = this.buildSegmentData(
      allPassengerObjs,
      ride,
      driverRouteKm,
    );
    const breakdowns = segmentData
      ? this.calculateFairPriceBreakdown(0, allDistances, { segmentData })
      : this.calculateFairPriceBreakdown(0, allDistances);

    return {
      isFirstRider: false,
      breakdowns,
      newRider: breakdowns[breakdowns.length - 1],
    };
  }

  findOptimalMatches(
    userRequest: PassengerCoords,
    availableRides: Ride[],
  ): MatchResult[] {
    const scoredRides = availableRides
      .map((ride) => ({
        ride,
        score: this.calculateMatchScore(userRequest, ride),

        routeMatched: this.isOnDriverRoute(userRequest, ride) !== null,
        corridorPassed: this.isOnDriverCorridor(userRequest, ride) !== null,
      }))

      .filter(({ ride, score, routeMatched, corridorPassed }) => {
        if (
          !this._isWithinTimeWindow(
            userRequest.departureTime,
            ride.departureTime,
          )
        )
          return false;

        if (routeMatched) return score > 30;

        const hasCoords = ride.startLat != null && userRequest.startLat != null;
        if (hasCoords && !corridorPassed) return false;
        return score > 30;
      });

    scoredRides.sort((a, b) => b.score - a.score);

    return scoredRides.slice(0, 5).map(({ ride, score }) => {
      const basePrice = ride.price || this.DEFAULT_PRICE;

      // One shared pricing path with POST /api/rides/:id/book (A2): the
      // price shown here is the price booking charges for the same inputs.
      const priced = this.priceNewBooking({
        basePrice,
        distanceKm: ride.distanceKm,
        ride,
        existingPassengers: ride.passengers || [],
        newRider: userRequest,
      });

      if (priced.isFirstRider) {
        const myBreakdown = priced.newRider;
        return {
          ...ride,
          matchScore: score,
          matchPercentage: score,
          originalPrice: basePrice,
          isFirstRider: true,
          discountedPrice: myBreakdown.passengerPrice,
          fareShare: myBreakdown.fareShare,
          driverBonusPerPassenger: 0,
          appCommissionPerPassenger: myBreakdown.appCommissionPerPassenger,
          driverEarnings: basePrice,
          appCommissionTotal: myBreakdown.appCommissionPerPassenger,
          savings: 0,
          savingsPercentage: 0,
          totalPassengers: 1,
          passengerDistanceKm: myBreakdown.distanceKm,
          passengerWeightPercent: 100,
        };
      }

      const myBreakdown = priced.newRider;
      const breakdowns = priced.breakdowns;

      return {
        ...ride,
        matchScore: score,
        matchPercentage: score,
        originalPrice: basePrice,
        isFirstRider: false,
        discountedPrice: myBreakdown.passengerPrice,
        fareShare: myBreakdown.fareShare,
        driverBonusPerPassenger: 0,
        appCommissionPerPassenger: myBreakdown.appCommissionPerPassenger,
        driverEarnings: basePrice,
        appCommissionTotal: breakdowns.reduce(
          (sum, b) => sum + b.appCommissionPerPassenger,
          0,
        ),
        savings: basePrice - myBreakdown.passengerPrice,
        savingsPercentage: Math.round(
          ((basePrice - myBreakdown.passengerPrice) / basePrice) * 100,
        ),
        totalPassengers: breakdowns.length,
        passengerDistanceKm: myBreakdown.distanceKm,
        passengerWeightPercent: myBreakdown.weightPercent,
      };
    });
  }

  calculatePriceBreakdown(basePrice: number, passengerCount: number): {
    fareShare: number;
    driverBonusPerPassenger: number;
    appCommissionPerPassenger: number;
    passengerPrice: number;
    driverEarnings: number;
    driverBonusTotal: number;
    appCommissionTotal: number;
    savings: number;
    savingsPercentage: number;
  } {
    const fareShare = Math.floor(basePrice / passengerCount);
    const appCommissionPerPassenger = Math.floor(
      fareShare * this.APP_TAX_RATE,
    );
    const passengerPrice = fareShare + appCommissionPerPassenger;
    const driverEarnings = basePrice;
    const appCommissionTotal = appCommissionPerPassenger * passengerCount;
    return {
      fareShare,
      driverBonusPerPassenger: 0,
      appCommissionPerPassenger,
      passengerPrice,
      driverEarnings,
      driverBonusTotal: 0,
      appCommissionTotal,
      savings: basePrice - passengerPrice,
      savingsPercentage: Math.round(
        ((basePrice - passengerPrice) / basePrice) * 100,
      ),
    };
  }

  suggestCarpoolGroups(requests: PassengerCoords[]): CarpoolGroup[] {
    const groups: CarpoolGroup[] = [];
    const used = new Set<number>();

    for (let i = 0; i < requests.length; i++) {
      if (used.has(i)) continue;
      const group = [requests[i]];
      used.add(i);

      for (let j = i + 1; j < requests.length; j++) {
        if (used.has(j) || group.length >= 4) continue;

        const fwd = this.isOnDriverCorridor(requests[j], requests[i]);
        const rev = this.isOnDriverCorridor(requests[i], requests[j]);

        if (fwd !== null || rev !== null) {
          group.push(requests[j]);
          used.add(j);
        } else {
          const hasCoords =
            requests[i].startLat != null && requests[j].startLat != null;
          if (!hasCoords) {
            const startDist = this.calculateDistance(
              requests[i].startLat ?? 0,
              requests[i].startLng ?? 0,
              requests[j].startLat ?? 0,
              requests[j].startLng ?? 0,
            );
            const endDist = this.calculateDistance(
              requests[i].endLat ?? 0,
              requests[i].endLng ?? 0,
              requests[j].endLat ?? 0,
              requests[j].endLng ?? 0,
            );
            if (startDist < 2 && endDist < 2) {
              group.push(requests[j]);
              used.add(j);
            }
          }
        }
      }

      if (group.length > 1) {
        const distances = group.map((req) => {
          if (req.startLat != null && req.endLat != null) {
            return this.calculateDistance(
              req.startLat,
              req.startLng as number,
              req.endLat,
              req.endLng as number,
            );
          }
          return 10;
        });

        // Use the first member as the "driver" reference for segment data
        const leader = group[0];
        const leaderKm = distances[0] || 10;
        const maxKm = distances.reduce((a, b) => Math.max(a, b), leaderKm);
        const segmentData = this.buildSegmentData(
          group.map((req, idx) => ({
            id: req.id || req.passengerId || `p${idx}`,
            startLat: req.startLat,
            startLng: req.startLng,
            endLat: req.endLat,
            endLng: req.endLng,
          })),
          leader,
          maxKm,
        );

        const breakdowns = segmentData
          ? this.calculateFairPriceBreakdown(0, distances, { segmentData })
          : this.calculateFairPriceBreakdown(0, distances);
        const totalFares = breakdowns.reduce((s, b) => s + b.fareShare, 0);

        groups.push({
          passengers: group,
          count: group.length,
          totalPrice: totalFares,
          driverEarnings: totalFares,
          appCommissionTotal: breakdowns.reduce(
            (sum, b) => sum + b.appCommissionPerPassenger,
            0,
          ),
          perPassengerBreakdowns: breakdowns,

          pricePerPerson: Math.floor(
            breakdowns.reduce((sum, b) => sum + b.passengerPrice, 0) /
              group.length,
          ),
          savingsPerPerson: 0,
          totalSavings: 0,
        });
      }
    }
    return groups;
  }

  calculateOptimalRoute(
    startCoords: LatLng,
    endCoords: LatLng,
    waypoints: LatLng[] = [],
  ): OptimalRoute {
    const allPoints = [startCoords, ...waypoints, endCoords];
    let totalDistance = 0;
    for (let i = 0; i < allPoints.length - 1; i++) {
      totalDistance += this.calculateDistance(
        allPoints[i].lat,
        allPoints[i].lng,
        allPoints[i + 1].lat,
        allPoints[i + 1].lng,
      );
    }
    return {
      distance: totalDistance,
      estimatedTime: totalDistance * 3,
      waypoints,
    };
  }

  estimatePrice(
    distanceKm: number,
    passengerCount?: number,
  ): PriceEstimate {
    const basePrice = this.calculateDistancePrice(distanceKm);
    const appTax = Math.floor(basePrice * this.APP_TAX_RATE);
    const passengerCost = basePrice + appTax;
    if (!passengerCount || passengerCount <= 1) {
      return {
        basePrice,
        discountedPrice: passengerCost,
        driverEarnings: basePrice,
        appCommissionTotal: appTax,
        savings: 0,
        savingsPercentage: 0,
      };
    }
    const breakdown = this.calculatePriceBreakdown(basePrice, passengerCount);
    return {
      basePrice,
      discountedPrice: breakdown.passengerPrice,
      driverEarnings: breakdown.driverEarnings,
      appCommissionTotal: breakdown.appCommissionTotal,
      savings: breakdown.savings,
      savingsPercentage: breakdown.savingsPercentage,
    };
  }

  toRad(degrees: number): number {
    return this._toRad(degrees);
  }
}

export const routeMatcher = new RouteMatcher();
