// ─── SmartRide Route Matching — Corridor-Based Algorithm ───
// Uses Point-to-Segment (P2S) projection + bearing pre-filter.
// No external API required. Runs in <1 ms per ride.

export class RouteMatcher {
  constructor() {
    // ─── Distance-based pricing constants ───
    this.BASE_FARE = 1500;        // Fixed starting charge (MMK)
    this.RATE_PER_KM = 500;       // Per-km charge (MMK)
    this.MIN_PRICE = 2000;        // Minimum ride price (MMK)
    this.MAX_PRICE = 15000;       // Maximum ride price (MMK)
    this.DEFAULT_PRICE = 7500;    // Fallback when no GPS available (MMK)

    this.DRIVER_BONUS_RATE = 0.1;
    this.APP_COMMISSION_RATE = 0.05;

    // Tuned thresholds for Yangon city scale
    this.PICKUP_THRESHOLD_KM = 2.0; // How far passenger start can be from driver route
    this.DROPOFF_THRESHOLD_KM = 2.5; // How far passenger destination can be from driver route
    this.BEARING_MAX_DIFF_DEG = 65;  // Max angle difference to be considered "same direction"
    this.TIME_WINDOW_MINUTES = 15;  // Hard limit: rides outside this window are an absolute unmatch
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

  // ─── Distance-based price calculation ───
  // Formula: BASE_FARE + (distanceKm × RATE_PER_KM), clamped to [MIN, MAX]
  calculateDistancePrice(distanceKm) {
    const raw = this.BASE_FARE + Math.floor(distanceKm * this.RATE_PER_KM);
    return Math.max(this.MIN_PRICE, Math.min(this.MAX_PRICE, raw));
  }

  // ─── Calculate price from GPS coordinates ───
  // Returns { price, distanceKm } or null if coords missing
  calculatePriceFromCoords(startLat, startLng, endLat, endLng) {
    if (startLat == null || startLng == null || endLat == null || endLng == null) {
      return null;
    }
    const distanceKm = this.calculateDistance(startLat, startLng, endLat, endLng);
    return {
      price: this.calculateDistancePrice(distanceKm),
      distanceKm: Math.round(distanceKm * 10) / 10,
    };
  }

  // ─── Fair proportional price breakdown ───
  // Each passenger pays based on their own distance, not equal split.
  // passengerDistances = [15, 10, 5] (km each passenger travels)
  // Returns array of per-passenger breakdowns
  calculateFairPriceBreakdown(totalRoutePrice, passengerDistances) {
    const totalKm = passengerDistances.reduce((a, b) => a + b, 0);
    if (totalKm === 0) {
      // Fallback: equal split if no distances
      return passengerDistances.map(() => this._equalShareBreakdown(totalRoutePrice, passengerDistances.length));
    }

    const driverBonusTotal = Math.floor(totalRoutePrice * this.DRIVER_BONUS_RATE);

    return passengerDistances.map(myKm => {
      const weight = myKm / totalKm;
      const fareShare = Math.floor(totalRoutePrice * weight);
      const driverBonusShare = Math.floor(driverBonusTotal * weight);
      const subtotal = fareShare + driverBonusShare;
      const appFee = Math.floor(subtotal * this.APP_COMMISSION_RATE);
      const passengerPrice = subtotal + appFee;

      return {
        fareShare,
        driverBonusPerPassenger: driverBonusShare,
        appCommissionPerPassenger: appFee,
        passengerPrice,
        distanceKm: Math.round(myKm * 10) / 10,
        weightPercent: Math.round(weight * 100),
      };
    });
  }

  // Helper: equal-share breakdown for a single passenger (fallback)
  _equalShareBreakdown(totalRoutePrice, passengerCount) {
    const fareShare = Math.floor(totalRoutePrice / passengerCount);
    const driverBonusTotal = Math.floor(totalRoutePrice * this.DRIVER_BONUS_RATE);
    const driverBonusPerPassenger = Math.floor(driverBonusTotal / passengerCount);
    const subtotal = fareShare + driverBonusPerPassenger;
    const appFee = Math.floor(subtotal * this.APP_COMMISSION_RATE);
    return {
      fareShare,
      driverBonusPerPassenger,
      appCommissionPerPassenger: appFee,
      passengerPrice: subtotal + appFee,
      distanceKm: 0,
      weightPercent: Math.round(100 / passengerCount),
    };
  }

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

  // ─── Calculate passenger's distance along the driver route ───
  // Uses the passenger's own start/end GPS coordinates.
  getPassengerDistance(passenger, driver) {
    // If passenger has GPS, use their own start→end distance
    if (passenger.startLat != null && passenger.endLat != null) {
      return this.calculateDistance(
        passenger.startLat, passenger.startLng,
        passenger.endLat, passenger.endLng,
      );
    }
    // Fallback: assume full route distance
    if (driver.startLat != null && driver.endLat != null) {
      return this.calculateDistance(
        driver.startLat, driver.startLng,
        driver.endLat, driver.endLng,
      );
    }
    return 0;
  }

  // ─── Composite match score (0–100) ───
  // Corridor check gates the match. Score reflects quality for ranking.
  calculateMatchScore(passenger, driver) {
    // ── Hard time gate: >15 min difference = absolute unmatch ──
    if (!this._isWithinTimeWindow(passenger.departureTime, driver.departureTime)) return 0;

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

      // Time is already validated above — add full time bonus points
      score += 15;

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

      // Time is already validated above — add full time bonus points
      score += 20;
    }

    return Math.min(100, score);
  }

  // ─── Hard time gate: returns false if departure times differ by more than 15 minutes ───
  // If either time is missing, we allow the match (no time data = no restriction).
  _isWithinTimeWindow(userTime, rideTime) {
    if (!userTime || !rideTime) return true;
    const diffMin = Math.abs(new Date(userTime) - new Date(rideTime)) / 60000;
    return diffMin <= this.TIME_WINDOW_MINUTES;
  }

  // ─── Find the best matching rides for a passenger request ───
  findOptimalMatches(userRequest, availableRides) {
    const scoredRides = availableRides
      .map((ride) => ({
        ride,
        score: this.calculateMatchScore(userRequest, ride),
        corridorPassed: this.isOnDriverCorridor(userRequest, ride) !== null,
      }))
      // Must pass time window (hard gate), corridor check (if coords available), AND score > 30
      .filter(({ ride, score, corridorPassed }) => {
        // Hard time gate: reject if departure times differ by more than 15 minutes
        if (!this._isWithinTimeWindow(userRequest.departureTime, ride.departureTime)) return false;
        const hasCoords = ride.startLat != null && userRequest.startLat != null;
        if (hasCoords && !corridorPassed) return false; // Strict gate when coords exist
        return score > 30;
      });

    scoredRides.sort((a, b) => b.score - a.score);

    return scoredRides.slice(0, 5).map(({ ride, score }) => {
      const basePrice = ride.price || this.DEFAULT_PRICE;

      // Calculate this passenger's individual distance
      const passengerKm = this.getPassengerDistance(userRequest, ride);

      // Collect all existing passenger distances + this new passenger
      const existingPassengerDistances = (ride.passengers || []).map(p => {
        if (p.startLat != null && p.endLat != null) {
          return this.calculateDistance(p.startLat, p.startLng, p.endLat, p.endLng);
        }
        // Existing passengers without GPS: assume full route distance
        if (ride.startLat != null && ride.endLat != null) {
          return this.calculateDistance(ride.startLat, ride.startLng, ride.endLat, ride.endLng);
        }
        return passengerKm || 10; // fallback
      });

      const allDistances = [...existingPassengerDistances, passengerKm || 10];
      const totalPassengers = allDistances.length;
      const isFirstRider = totalPassengers === 1;

      if (isFirstRider) {
        // First rider: pays full route price, no bonus/commission
        return {
          ...ride,
          matchScore: score,
          matchPercentage: score,
          originalPrice: basePrice,
          isFirstRider: true,
          discountedPrice: basePrice,
          fareShare: basePrice,
          driverBonusPerPassenger: 0,
          appCommissionPerPassenger: 0,
          driverEarnings: basePrice,
          appCommissionTotal: 0,
          savings: 0,
          savingsPercentage: 0,
          totalPassengers: 1,
          passengerDistanceKm: Math.round(passengerKm * 10) / 10,
          passengerWeightPercent: 100,
        };
      }

      // Fair proportional pricing
      const breakdowns = this.calculateFairPriceBreakdown(basePrice, allDistances);
      const myBreakdown = breakdowns[breakdowns.length - 1]; // Last entry = the new passenger

      const driverBonusTotal = Math.floor(basePrice * this.DRIVER_BONUS_RATE);

      return {
        ...ride,
        matchScore: score,
        matchPercentage: score,
        originalPrice: basePrice,
        isFirstRider: false,
        discountedPrice: myBreakdown.passengerPrice,
        fareShare: myBreakdown.fareShare,
        driverBonusPerPassenger: myBreakdown.driverBonusPerPassenger,
        appCommissionPerPassenger: myBreakdown.appCommissionPerPassenger,
        driverEarnings: basePrice + driverBonusTotal,
        appCommissionTotal: breakdowns.reduce((sum, b) => sum + b.appCommissionPerPassenger, 0),
        savings: basePrice - myBreakdown.passengerPrice,
        savingsPercentage: Math.round(((basePrice - myBreakdown.passengerPrice) / basePrice) * 100),
        totalPassengers,
        passengerDistanceKm: myBreakdown.distanceKm,
        passengerWeightPercent: myBreakdown.weightPercent,
      };
    });
  }

  // ─── Price breakdown (equal split — kept for backward compatibility) ───
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
        // Calculate distances for fair pricing
        const distances = group.map(req => {
          if (req.startLat != null && req.endLat != null) {
            return this.calculateDistance(req.startLat, req.startLng, req.endLat, req.endLng);
          }
          return 10; // fallback ~10km
        });
        // Route price based on the longest rider's distance
        const maxDist = Math.max(...distances);
        const routePrice = this.calculateDistancePrice(maxDist);
        const breakdowns = this.calculateFairPriceBreakdown(routePrice, distances);
        const driverBonusTotal = Math.floor(routePrice * this.DRIVER_BONUS_RATE);

        groups.push({
          passengers: group,
          count: group.length,
          totalPrice: routePrice,
          driverEarnings: routePrice + driverBonusTotal,
          appCommissionTotal: breakdowns.reduce((sum, b) => sum + b.appCommissionPerPassenger, 0),
          perPassengerBreakdowns: breakdowns,
          // Average for display
          pricePerPerson: Math.floor(breakdowns.reduce((sum, b) => sum + b.passengerPrice, 0) / group.length),
          savingsPerPerson: Math.floor(breakdowns.reduce((sum, b) => sum + (routePrice - b.passengerPrice), 0) / group.length),
          totalSavings: breakdowns.reduce((sum, b) => sum + (routePrice - b.passengerPrice), 0),
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
    const basePrice = this.calculateDistancePrice(distanceKm);
    if (!passengerCount || passengerCount <= 1) {
      return {
        basePrice,
        discountedPrice: basePrice,
        driverEarnings: basePrice,
        appCommissionTotal: 0,
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

  // Alias kept for backwards compatibility
  toRad(degrees) { return this._toRad(degrees); }
}

export const routeMatcher = new RouteMatcher();
