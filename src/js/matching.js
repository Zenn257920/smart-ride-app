// ─── SmartRide Route Matching — Corridor-Based Algorithm ───
// Uses Point-to-Segment (P2S) projection + bearing pre-filter.
// No external API required. Runs in <1 ms per ride.

export class RouteMatcher {
  constructor() {
    this.baseTaxiPrice = 7500; // Base price in MMK
    this.DRIVER_BONUS_RATE = 0.1;
    this.APP_COMMISSION_RATE = 0.05;

    // Tuned thresholds for Yangon city scale
    this.PICKUP_THRESHOLD_KM = 2.0; // How far passenger start can be from driver route
    this.DROPOFF_THRESHOLD_KM = 2.5; // How far passenger destination can be from driver route
    this.BEARING_MAX_DIFF_DEG = 65;  // Max angle difference to be considered "same direction"
    this.TIME_WINDOW_MINUTES = 90;  // Acceptable departure time gap
  }

  // ─── Haversine distance between two lat/lng points (km) ───
  calculateDistance(lat1, lon1, lat2, lon2) {
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

  _toRad(deg) { return (deg * Math.PI) / 180; }

  // ─── Compass bearing from point A to point B (0–360°) ───
  _bearing(lat1, lon1, lat2, lon2) {
    const dLon = this._toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(this._toRad(lat2));
    const x =
      Math.cos(this._toRad(lat1)) * Math.sin(this._toRad(lat2)) -
      Math.sin(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // ─── Shortest angular difference between two bearings ───
  _bearingDiff(a, b) {
    return Math.abs(((a - b + 180) % 360) - 180);
  }

  // ─── Point-to-Segment projection ───
  // Returns { distance (km), t (0=at driver start, 1=at driver end) }
  // Works in lat/lng space — valid within ~50 km (fine for Yangon).
  _pointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      // Degenerate segment (start == end): just return distance to that point
      return { distance: this.calculateDistance(py, px, ay, ax), t: 0 };
    }

    // Parameterised nearest point t ∈ [0, 1]
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const nearestLat = ay + t * dy;
    const nearestLng = ax + t * dx;
    return {
      distance: this.calculateDistance(py, px, nearestLat, nearestLng),
      t,
    };
  }

  // ─── Core: Corridor Match Check ───
  // Returns null if not a match, or a detail object if it is.
  isOnDriverCorridor(passenger, driver) {
    // Both sides need coordinates to use the corridor algorithm
    const hasCoordsDriver =
      driver.startLat != null && driver.startLng != null &&
      driver.endLat != null && driver.endLng != null;
    const hasCoordsPassenger =
      passenger.startLat != null && passenger.startLng != null &&
      passenger.endLat != null && passenger.endLng != null;

    if (!hasCoordsDriver || !hasCoordsPassenger) return null;

    // 1. Bearing pre-filter — quick reject if travelling in different directions
    const driverBearing = this._bearing(driver.startLat, driver.startLng, driver.endLat, driver.endLng);
    const passengerBearing = this._bearing(passenger.startLat, passenger.startLng, passenger.endLat, passenger.endLng);
    const bearingDiff = this._bearingDiff(driverBearing, passengerBearing);
    if (bearingDiff > this.BEARING_MAX_DIFF_DEG) return null;

    // 2. Pickup feasibility — how far is passenger's start from the driver's route line?
    const pickup = this._pointToSegment(
      passenger.startLng, passenger.startLat,
      driver.startLng, driver.startLat,
      driver.endLng, driver.endLat,
    );
    if (pickup.distance > this.PICKUP_THRESHOLD_KM) return null;

    // 3. Dropoff feasibility — how far is passenger's destination from the route line?
    const dropoff = this._pointToSegment(
      passenger.endLng, passenger.endLat,
      driver.startLng, driver.startLat,
      driver.endLng, driver.endLat,
    );
    if (dropoff.distance > this.DROPOFF_THRESHOLD_KM) return null;

    // 4. Direction check — pickup must come before dropoff along the route
    //    (prevents matching passengers travelling backwards on the driver's route)
    if (pickup.t >= dropoff.t) return null;

    return { bearingDiff, pickupDist: pickup.distance, dropoffDist: dropoff.distance, pickupT: pickup.t, dropoffT: dropoff.t };
  }

  // ─── Composite match score (0–100) ───
  // Corridor check gates the match. Score reflects quality for ranking.
  calculateMatchScore(passenger, driver) {
    let score = 0;

    const corridorResult = this.isOnDriverCorridor(passenger, driver);

    if (corridorResult !== null) {
      // ── Corridor-based scoring (coordinates available) ──

      // Bearing alignment (0–25 pts): tighter bearing = better match
      const bearingScore = Math.round(25 * (1 - corridorResult.bearingDiff / this.BEARING_MAX_DIFF_DEG));
      score += bearingScore;

      // Pickup proximity (0–35 pts)
      if (corridorResult.pickupDist < 0.5) score += 35;
      else if (corridorResult.pickupDist < 1.0) score += 28;
      else if (corridorResult.pickupDist < 1.5) score += 20;
      else score += 12;

      // Dropoff proximity (0–25 pts)
      if (corridorResult.dropoffDist < 0.5) score += 25;
      else if (corridorResult.dropoffDist < 1.0) score += 20;
      else if (corridorResult.dropoffDist < 2.0) score += 13;
      else score += 6;

      // Time window (0–15 pts)
      score += this._timeScore(passenger.departureTime, driver.departureTime, 15);

    } else {
      // ── Fallback: no coordinates — use straight-line point matching ──
      // (legacy behaviour for old rides that have no coords)
      const startDist = this.calculateDistance(
        passenger.startLat ?? 0, passenger.startLng ?? 0,
        driver.startLat ?? 0, driver.startLng ?? 0,
      );
      const endDist = this.calculateDistance(
        passenger.endLat ?? 0, passenger.endLng ?? 0,
        driver.endLat ?? 0, driver.endLng ?? 0,
      );

      // Only give a score if both sides have coords; otherwise leave at 0
      const hasAnyCoords = (driver.startLat != null && passenger.startLat != null);
      if (!hasAnyCoords) return 0;

      if (startDist < 1) score += 40;
      else if (startDist < 3) score += 28;
      else if (startDist < 5) score += 14;

      if (endDist < 1) score += 40;
      else if (endDist < 3) score += 28;
      else if (endDist < 5) score += 14;

      score += this._timeScore(passenger.departureTime, driver.departureTime, 20);
    }

    return Math.min(100, score);
  }

  _timeScore(userTime, rideTime, maxPts) {
    if (!userTime || !rideTime) return 0;
    const diffMin = Math.abs(new Date(userTime) - new Date(rideTime)) / 60000;
    if (diffMin <= 15) return maxPts;
    if (diffMin <= 30) return Math.round(maxPts * 0.75);
    if (diffMin <= 60) return Math.round(maxPts * 0.5);
    if (diffMin <= 120) return Math.round(maxPts * 0.2);
    return 0;
  }

  // ─── Find the best matching rides for a passenger request ───
  findOptimalMatches(userRequest, availableRides) {
    const scoredRides = availableRides
      .map((ride) => ({
        ride,
        score: this.calculateMatchScore(userRequest, ride),
        corridorPassed: this.isOnDriverCorridor(userRequest, ride) !== null,
      }))
      // Must pass corridor check (if coords available) AND score > 30
      .filter(({ ride, score, corridorPassed }) => {
        const hasCoords = ride.startLat != null && userRequest.startLat != null;
        if (hasCoords && !corridorPassed) return false; // Strict gate when coords exist
        return score > 30;
      });

    scoredRides.sort((a, b) => b.score - a.score);

    return scoredRides.slice(0, 5).map(({ ride, score }) => {
      const currentPassengers = ride.bookedSeats || 0;
      const totalPassengers = currentPassengers + 1;
      const basePrice = ride.price || this.baseTaxiPrice;
      const breakdown = this.calculatePriceBreakdown(basePrice, totalPassengers);
      return {
        ...ride,
        matchScore: score,
        matchPercentage: score,
        originalPrice: basePrice,
        discountedPrice: breakdown.passengerPrice,
        fareShare: breakdown.fareShare,
        driverBonusPerPassenger: breakdown.driverBonusPerPassenger,
        appCommissionPerPassenger: breakdown.appCommissionPerPassenger,
        driverEarnings: breakdown.driverEarnings,
        appCommissionTotal: breakdown.appCommissionTotal,
        savings: breakdown.savings,
        savingsPercentage: breakdown.savingsPercentage,
        totalPassengers,
      };
    });
  }

  // ─── Price breakdown ───
  calculatePriceBreakdown(basePrice, passengerCount) {
    const fareShare = Math.floor(basePrice / passengerCount);
    const driverBonusTotal = Math.floor(basePrice * this.DRIVER_BONUS_RATE);
    const driverBonusPerPassenger = Math.floor(driverBonusTotal / passengerCount);
    const subtotal = fareShare + driverBonusPerPassenger;
    const appCommissionPerPassenger = Math.floor(subtotal * this.APP_COMMISSION_RATE);
    const passengerPrice = subtotal + appCommissionPerPassenger;
    const driverEarnings = basePrice + driverBonusTotal;
    const appCommissionTotal = appCommissionPerPassenger * passengerCount;
    return {
      fareShare,
      driverBonusPerPassenger,
      appCommissionPerPassenger,
      passengerPrice,
      driverEarnings,
      driverBonusTotal,
      appCommissionTotal,
      savings: basePrice - passengerPrice,
      savingsPercentage: Math.round(((basePrice - passengerPrice) / basePrice) * 100),
    };
  }

  // ─── Suggest carpool groups using corridor matching ───
  suggestCarpoolGroups(requests) {
    const groups = [];
    const used = new Set();

    for (let i = 0; i < requests.length; i++) {
      if (used.has(i)) continue;
      const group = [requests[i]];
      used.add(i);

      for (let j = i + 1; j < requests.length; j++) {
        if (used.has(j) || group.length >= 4) continue;

        // Try corridor match in both directions
        const fwd = this.isOnDriverCorridor(requests[j], requests[i]);
        const rev = this.isOnDriverCorridor(requests[i], requests[j]);

        if (fwd !== null || rev !== null) {
          group.push(requests[j]);
          used.add(j);
        } else {
          // Fallback to point-distance if no coords
          const hasCoords = requests[i].startLat != null && requests[j].startLat != null;
          if (!hasCoords) {
            const startDist = this.calculateDistance(
              requests[i].startLat ?? 0, requests[i].startLng ?? 0,
              requests[j].startLat ?? 0, requests[j].startLng ?? 0,
            );
            const endDist = this.calculateDistance(
              requests[i].endLat ?? 0, requests[i].endLng ?? 0,
              requests[j].endLat ?? 0, requests[j].endLng ?? 0,
            );
            if (startDist < 2 && endDist < 2) {
              group.push(requests[j]);
              used.add(j);
            }
          }
        }
      }

      if (group.length > 1) {
        const breakdown = this.calculatePriceBreakdown(this.baseTaxiPrice, group.length);
        groups.push({
          passengers: group,
          count: group.length,
          pricePerPerson: breakdown.passengerPrice,
          totalPrice: this.baseTaxiPrice,
          driverEarnings: breakdown.driverEarnings,
          appCommissionTotal: breakdown.appCommissionTotal,
          savingsPerPerson: breakdown.savings,
          totalSavings: breakdown.savings * group.length,
        });
      }
    }
    return groups;
  }

  // ─── Route distance estimate (straight-line approximation) ───
  calculateOptimalRoute(startCoords, endCoords, waypoints = []) {
    const allPoints = [startCoords, ...waypoints, endCoords];
    let totalDistance = 0;
    for (let i = 0; i < allPoints.length - 1; i++) {
      totalDistance += this.calculateDistance(
        allPoints[i].lat, allPoints[i].lng,
        allPoints[i + 1].lat, allPoints[i + 1].lng,
      );
    }
    return {
      distance: totalDistance,
      estimatedTime: totalDistance * 3,
      waypoints,
    };
  }

  // ─── Price estimate by distance ───
  estimatePrice(distanceKm, passengerCount) {
    const baseRate = 500;
    const basePrice = Math.floor(distanceKm * baseRate);
    const breakdown = this.calculatePriceBreakdown(basePrice, passengerCount || 1);
    return {
      basePrice,
      discountedPrice: breakdown.passengerPrice,
      driverEarnings: breakdown.driverEarnings,
      appCommissionTotal: breakdown.appCommissionTotal,
      savings: breakdown.savings,
      savingsPercentage: breakdown.savingsPercentage,
    };
  }

  // Alias kept for backwards compatibility
  toRad(degrees) { return this._toRad(degrees); }
}

export const routeMatcher = new RouteMatcher();
