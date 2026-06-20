// ─── SmartRide Route Matching — Corridor-Based Algorithm ───
// Uses Point-to-Segment (P2S) projection + bearing pre-filter.
// No external API required. Runs in <1 ms per ride.

export class RouteMatcher {
  constructor() {
    // ─── Distance-based pricing constants
    this.BASE_FARE = 1500;        // Fixed starting charge (MMK)
    this.RATE_PER_KM = 500;       // Per-km charge (MMK)
    this.DEFAULT_PRICE = 7500;    // Fallback when no GPS available (MMK)

    // Application tax: 5% on subtotal (base + per-km)
    // Passenger cost = (BASE_FARE + RATE_PER_KM × km) × 1.05
    this.APP_TAX_RATE = 0.05;

    // Legacy aliases kept for backward compatibility
    this.DRIVER_BONUS_RATE = 0;   // No separate driver bonus
    this.APP_COMMISSION_RATE = 0.05;

    // Tuned thresholds for Yangon city scale
    this.PICKUP_THRESHOLD_KM = 2.0; // How far passenger start can be from driver route
    this.DROPOFF_THRESHOLD_KM = 2.5; // How far passenger destination can be from driver route
    this.BEARING_MAX_DIFF_DEG = 65;  // Max angle difference to be considered "same direction"
    this.TIME_WINDOW_MINUTES = 120; // Limit: rides outside this window are an unmatch (2 hrs for geocoded text search)

    // Polyline-based matching thresholds (tighter because actual road path is more accurate)
    this.POLYLINE_PICKUP_THRESHOLD_KM = 2.0;  // Passenger pickup within 2km of actual road
    this.POLYLINE_DROPOFF_THRESHOLD_KM = 2.0; // Passenger dropoff within 2km of actual road
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

  // ─── Distance-based price calculation (subtotal before tax) ───
  // Formula: BASE_FARE + (distanceKm × RATE_PER_KM)
  // e.g. 10 km → 1500 + 5000 = 6500 MMK
  calculateDistancePrice(distanceKm) {
    return this.BASE_FARE + Math.floor(distanceKm * this.RATE_PER_KM);
  }

  // ─── Passenger cost = subtotal + 5% app tax ───
  // e.g. 10 km → subtotal 6500 × 1.05 = 6825 MMK
  calculatePassengerCost(distanceKm) {
    const subtotal = this.calculateDistancePrice(distanceKm);
    return Math.floor(subtotal * (1 + this.APP_TAX_RATE));
  }

  // ─── Calculate price from GPS coordinates ───
  // Returns { price (subtotal), passengerCost (with 5% tax), appTax, distanceKm } or null
  calculatePriceFromCoords(startLat, startLng, endLat, endLng) {
    if (startLat == null || startLng == null || endLat == null || endLng == null) {
      return null;
    }
    const distanceKm = this.calculateDistance(startLat, startLng, endLat, endLng);
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

  // ─── Fair per-passenger price breakdown ───
  // Each passenger pays based on their OWN distance:
  //   passengerCost = (1500 + 500 × km) × 1.05  (5% app tax)
  // passengerDistances = [15, 10, 5] (km each passenger travels)
  // Returns array of per-passenger breakdowns
  calculateFairPriceBreakdown(totalRoutePrice, passengerDistances) {
    const totalKm = passengerDistances.reduce((a, b) => a + b, 0);
    if (totalKm === 0) {
      // Fallback: equal split if no distances
      return passengerDistances.map(() => this._equalShareBreakdown(totalRoutePrice, passengerDistances.length));
    }

    return passengerDistances.map(myKm => {
      const weight = myKm / totalKm;
      // Each passenger's subtotal based on their own distance
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

  // Helper: equal-share breakdown for a single passenger (fallback)
  _equalShareBreakdown(totalRoutePrice, passengerCount) {
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

  // ─── Polyline-based proximity check ───
  // Checks if a point is within thresholdKm of ANY segment in a polyline.
  // routeCoords = [[lat, lng], [lat, lng], ...]
  // Returns { distance (km), segmentIndex, t } or null if not within threshold.
  _pointToPolyline(px, py, routeCoords, thresholdKm) {
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

      // Early exit if we're already very close
      if (bestDist < 0.1) break;
    }

    if (bestDist > thresholdKm) return null;

    // Compute a global "progress" along the polyline (0 = start, 1 = end)
    const globalT = (bestSegment + bestT) / (routeCoords.length - 1);

    return { distance: bestDist, segmentIndex: bestSegment, t: bestT, globalT };
  }

  // ─── Core: Polyline Route Match Check ───
  // Uses stored routeCoordinates (actual road path) instead of straight-line corridor.
  // Returns null if not a match, or a detail object if it is.
  isOnDriverRoute(passenger, driver) {
    // Need polyline data from driver's route
    if (!driver.routeCoordinates || driver.routeCoordinates.length < 2) return null;

    // Need passenger coordinates
    const hasCoordsPassenger =
      passenger.startLat != null && passenger.startLng != null &&
      passenger.endLat != null && passenger.endLng != null;
    if (!hasCoordsPassenger) return null;

    // 1. Bearing pre-filter — quick reject if travelling in very different directions
    const driverBearing = this._bearing(
      driver.routeCoordinates[0][0], driver.routeCoordinates[0][1],
      driver.routeCoordinates[driver.routeCoordinates.length - 1][0],
      driver.routeCoordinates[driver.routeCoordinates.length - 1][1]
    );
    const passengerBearing = this._bearing(
      passenger.startLat, passenger.startLng, passenger.endLat, passenger.endLng
    );
    const bearingDiff = this._bearingDiff(driverBearing, passengerBearing);
    if (bearingDiff > this.BEARING_MAX_DIFF_DEG) return null;

    // 2. Pickup proximity — is passenger's start within 2km of any point on the actual road?
    const pickup = this._pointToPolyline(
      passenger.startLng, passenger.startLat,
      driver.routeCoordinates,
      this.POLYLINE_PICKUP_THRESHOLD_KM
    );
    if (!pickup) return null;

    // 3. Dropoff proximity — is passenger's destination within 2km of the actual road?
    const dropoff = this._pointToPolyline(
      passenger.endLng, passenger.endLat,
      driver.routeCoordinates,
      this.POLYLINE_DROPOFF_THRESHOLD_KM
    );
    if (!dropoff) return null;

    // 4. Direction check — pickup must come before dropoff along the route
    if (pickup.globalT >= dropoff.globalT) return null;

    return {
      bearingDiff,
      pickupDist: pickup.distance,
      dropoffDist: dropoff.distance,
      pickupT: pickup.globalT,
      dropoffT: dropoff.globalT,
      pickupSegment: pickup.segmentIndex,
      dropoffSegment: dropoff.segmentIndex,
      usedPolyline: true,
    };
  }

  // ─── Build detour waypoints ───
  // Inserts passenger pickup and dropoff into the driver's route as intermediate waypoints.
  // Returns array of waypoint objects [{lat, lng}, ...] for the detour.
  buildDetourWaypoints(passenger, driver) {
    if (!driver.routeCoordinates || driver.routeCoordinates.length < 2) {
      // Fallback: just use passenger points as waypoints
      return [
        { lat: passenger.startLat, lng: passenger.startLng },
        { lat: passenger.endLat, lng: passenger.endLng },
      ];
    }

    // Find where on the route to insert pickup and dropoff
    const pickup = this._pointToPolyline(
      passenger.startLng, passenger.startLat,
      driver.routeCoordinates,
      this.POLYLINE_PICKUP_THRESHOLD_KM * 2 // Wider threshold for waypoint insertion
    );
    const dropoff = this._pointToPolyline(
      passenger.endLng, passenger.endLat,
      driver.routeCoordinates,
      this.POLYLINE_DROPOFF_THRESHOLD_KM * 2
    );

    // Build waypoints: passenger pickup first, then dropoff
    const waypoints = [];
    waypoints.push({ lat: passenger.startLat, lng: passenger.startLng });
    waypoints.push({ lat: passenger.endLat, lng: passenger.endLng });

    return waypoints;
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

    // ── Try polyline-based matching first (most accurate) ──
    const polylineResult = this.isOnDriverRoute(passenger, driver);

    if (polylineResult !== null) {
      // ── Polyline-based scoring (actual road path available) ──

      // Bearing alignment (0–25 pts)
      const bearingScore = Math.round(25 * (1 - polylineResult.bearingDiff / this.BEARING_MAX_DIFF_DEG));
      score += bearingScore;

      // Pickup proximity (0–35 pts) — tighter thresholds since polyline is more accurate
      if (polylineResult.pickupDist < 0.3) score += 35;
      else if (polylineResult.pickupDist < 0.8) score += 30;
      else if (polylineResult.pickupDist < 1.2) score += 22;
      else score += 14;

      // Dropoff proximity (0–25 pts)
      if (polylineResult.dropoffDist < 0.3) score += 25;
      else if (polylineResult.dropoffDist < 0.8) score += 22;
      else if (polylineResult.dropoffDist < 1.5) score += 15;
      else score += 8;

      // Time bonus
      score += 15;

      return Math.min(100, score);
    }

    // ── Fallback: straight-line corridor matching ──
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
      // ── Both polyline and corridor checks failed ──
      // If both sides have full GPS coordinates, this means the routes genuinely
      // don't overlap — hard reject. Do NOT fall through to loose point matching.
      const hasFullCoordsDriver =
        driver.startLat != null && driver.startLng != null &&
        driver.endLat != null && driver.endLng != null;
      const hasFullCoordsPassenger =
        passenger.startLat != null && passenger.startLng != null &&
        passenger.endLat != null && passenger.endLng != null;

      if (hasFullCoordsDriver && hasFullCoordsPassenger) {
        // Both have GPS but corridor/polyline failed → NOT a match
        return 0;
      }

      // ── True fallback: one or both sides lack GPS — use loose point matching ──
      // (legacy behaviour for old rides that have no coords)
      const startDist = this.calculateDistance(
        passenger.startLat ?? 0, passenger.startLng ?? 0,
        driver.startLat ?? 0, driver.startLng ?? 0,
      );
      const endDist = this.calculateDistance(
        passenger.endLat ?? 0, passenger.endLng ?? 0,
        driver.endLat ?? 0, driver.endLng ?? 0,
      );

      const hasAnyCoords = (driver.startLat != null && passenger.startLat != null);
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
        // Check polyline first, then corridor as fallback
        routeMatched: this.isOnDriverRoute(userRequest, ride) !== null,
        corridorPassed: this.isOnDriverCorridor(userRequest, ride) !== null,
      }))
      // Must pass time window (hard gate), route/corridor check (if coords available), AND score > 30
      .filter(({ ride, score, routeMatched, corridorPassed }) => {
        // Hard time gate: reject if departure times differ by more than 15 minutes
        if (!this._isWithinTimeWindow(userRequest.departureTime, ride.departureTime)) return false;
        // If polyline matching was possible and passed, accept
        if (routeMatched) return score > 30;
        // Otherwise check corridor
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
        // First rider: pays subtotal + 5% app tax
        const appTax = Math.floor(basePrice * this.APP_TAX_RATE);
        const passengerCost = basePrice + appTax;
        return {
          ...ride,
          matchScore: score,
          matchPercentage: score,
          originalPrice: basePrice,
          isFirstRider: true,
          discountedPrice: passengerCost,
          fareShare: basePrice,
          driverBonusPerPassenger: 0,
          appCommissionPerPassenger: appTax,
          driverEarnings: basePrice,
          appCommissionTotal: appTax,
          savings: 0,
          savingsPercentage: 0,
          totalPassengers: 1,
          passengerDistanceKm: Math.round(passengerKm * 10) / 10,
          passengerWeightPercent: 100,
        };
      }

      // Fair proportional pricing — each passenger pays for own distance + 5% tax
      const breakdowns = this.calculateFairPriceBreakdown(basePrice, allDistances);
      const myBreakdown = breakdowns[breakdowns.length - 1]; // Last entry = the new passenger

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
  // Formula: passenger pays subtotal + 5% app tax
  calculatePriceBreakdown(basePrice, passengerCount) {
    const fareShare = Math.floor(basePrice / passengerCount);
    const appCommissionPerPassenger = Math.floor(fareShare * this.APP_TAX_RATE);
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

        groups.push({
          passengers: group,
          count: group.length,
          totalPrice: routePrice,
          driverEarnings: routePrice,
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
  // Returns passenger cost with 5% app tax
  estimatePrice(distanceKm, passengerCount) {
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

  // Alias kept for backwards compatibility
  toRad(degrees) { return this._toRad(degrees); }
}

export const routeMatcher = new RouteMatcher();
