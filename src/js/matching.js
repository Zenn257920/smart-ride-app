export class RouteMatcher {
  constructor() {
    this.BASE_FARE = 1500;
    this.RATE_PER_KM = 500;
    this.DEFAULT_PRICE = 7500;

    this.APP_TAX_RATE = 0.05;

    this.DRIVER_BONUS_RATE = 0;
    this.APP_COMMISSION_RATE = 0.05;

    this.PICKUP_THRESHOLD_KM = 2.0;
    this.DROPOFF_THRESHOLD_KM = 2.5;
    this.BEARING_MAX_DIFF_DEG = 65;
    this.TIME_WINDOW_MINUTES = 120;

    this.POLYLINE_PICKUP_THRESHOLD_KM = 2.0;
    this.POLYLINE_DROPOFF_THRESHOLD_KM = 2.0;
  }

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

  _toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  calculateDistancePrice(distanceKm) {
    return this.BASE_FARE + Math.floor(distanceKm * this.RATE_PER_KM);
  }

  calculatePassengerCost(distanceKm) {
    const subtotal = this.calculateDistancePrice(distanceKm);
    return Math.floor(subtotal * (1 + this.APP_TAX_RATE));
  }

  calculatePriceFromCoords(startLat, startLng, endLat, endLng) {
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
   * @param {number} totalRoutePrice - Base route price (unused in segment mode)
   * @param {number[]} passengerDistances - Each passenger's individual distance
   * @param {Object} [options] - Optional configuration
   * @param {Object} [options.segmentData] - Segment-based pricing data
   * @param {number} options.segmentData.totalRouteKm - Driver's total route distance
   * @param {Array<{id: string, startT: number, endT: number}>} options.segmentData.passengers
   *   Each passenger's normalized position (0.0–1.0) on the driver's route
   * @returns {Array<Object>} Breakdown per passenger
   */
  calculateFairPriceBreakdown(totalRoutePrice, passengerDistances, options) {
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
   *
   * @param {Object} segmentData - { totalRouteKm, passengers: [{id, startT, endT}] }
   * @param {number[]} passengerDistances - Individual distances (for fallback/display)
   * @returns {Array<Object>} Breakdown per passenger (same order as passengerDistances)
   */
  _segmentBasedBreakdown(segmentData, passengerDistances) {
    const { totalRouteKm, passengers } = segmentData;

    // Collect all unique breakpoints (T values) from passenger start/end
    const breakpointSet = new Set();
    breakpointSet.add(0);
    breakpointSet.add(1);
    for (const p of passengers) {
      breakpointSet.add(Math.max(0, Math.min(1, p.startT)));
      breakpointSet.add(Math.max(0, Math.min(1, p.endT)));
    }
    const breakpoints = Array.from(breakpointSet).sort((a, b) => a - b);

    // Build segments between consecutive breakpoints
    const segments = [];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const segStart = breakpoints[i];
      const segEnd = breakpoints[i + 1];
      const segKm = (segEnd - segStart) * totalRouteKm;

      // Find which passengers are riding on this segment
      const ridersOnSegment = [];
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
    const equivKm = new Array(passengers.length).fill(0);
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

  /**
   * Build segmentData for calculateFairPriceBreakdown from passenger/driver objects.
   *
   * Resolves each passenger's pickupT/dropoffT on the driver's route using
   * isOnDriverRoute() or isOnDriverCorridor(). Falls back to proportional
   * estimation from straight-line distances when no route match is found.
   *
   * @param {Array<Object>} passengers - [{id, startLat, startLng, endLat, endLng}]
   * @param {Object} driver - Driver ride object with route data
   * @param {number} totalRouteKm - Driver's total route distance
   * @returns {Object|null} segmentData or null if insufficient data
   */
  buildSegmentData(passengers, driver, totalRouteKm) {
    if (!passengers || passengers.length === 0 || totalRouteKm <= 0) {
      return null;
    }

    const segPassengers = [];
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
          driver.startLat, driver.startLng,
          p.startLat, p.startLng,
        );
        const endDist = this.calculateDistance(
          driver.startLat, driver.startLng,
          p.endLat, p.endLng,
        );
        const driverDist = this.calculateDistance(
          driver.startLat, driver.startLng,
          driver.endLat, driver.endLng,
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

  _bearing(lat1, lon1, lat2, lon2) {
    const dLon = this._toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(this._toRad(lat2));
    const x =
      Math.cos(this._toRad(lat1)) * Math.sin(this._toRad(lat2)) -
      Math.sin(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  _bearingDiff(a, b) {
    return Math.abs(((a - b + 180) % 360) - 180);
  }

  _pointToSegment(px, py, ax, ay, bx, by) {
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

  isOnDriverCorridor(passenger, driver) {
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

    const driverBearing = this._bearing(
      driver.startLat,
      driver.startLng,
      driver.endLat,
      driver.endLng,
    );
    const passengerBearing = this._bearing(
      passenger.startLat,
      passenger.startLng,
      passenger.endLat,
      passenger.endLng,
    );
    const bearingDiff = this._bearingDiff(driverBearing, passengerBearing);
    if (bearingDiff > this.BEARING_MAX_DIFF_DEG) return null;

    const pickup = this._pointToSegment(
      passenger.startLng,
      passenger.startLat,
      driver.startLng,
      driver.startLat,
      driver.endLng,
      driver.endLat,
    );
    if (pickup.distance > this.PICKUP_THRESHOLD_KM) return null;

    const dropoff = this._pointToSegment(
      passenger.endLng,
      passenger.endLat,
      driver.startLng,
      driver.startLat,
      driver.endLng,
      driver.endLat,
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

      if (bestDist < 0.1) break;
    }

    if (bestDist > thresholdKm) return null;

    const globalT = (bestSegment + bestT) / (routeCoords.length - 1);

    return { distance: bestDist, segmentIndex: bestSegment, t: bestT, globalT };
  }

  isOnDriverRoute(passenger, driver) {
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
    const passengerBearing = this._bearing(
      passenger.startLat,
      passenger.startLng,
      passenger.endLat,
      passenger.endLng,
    );
    const bearingDiff = this._bearingDiff(driverBearing, passengerBearing);
    if (bearingDiff > this.BEARING_MAX_DIFF_DEG) return null;

    const pickup = this._pointToPolyline(
      passenger.startLng,
      passenger.startLat,
      driver.routeCoordinates,
      this.POLYLINE_PICKUP_THRESHOLD_KM,
    );
    if (!pickup) return null;

    const dropoff = this._pointToPolyline(
      passenger.endLng,
      passenger.endLat,
      driver.routeCoordinates,
      this.POLYLINE_DROPOFF_THRESHOLD_KM,
    );
    if (!dropoff) return null;

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

  buildDetourWaypoints(passenger, driver) {
    if (!driver.routeCoordinates || driver.routeCoordinates.length < 2) {
      return [
        { lat: passenger.startLat, lng: passenger.startLng },
        { lat: passenger.endLat, lng: passenger.endLng },
      ];
    }

    const pickup = this._pointToPolyline(
      passenger.startLng,
      passenger.startLat,
      driver.routeCoordinates,
      this.POLYLINE_PICKUP_THRESHOLD_KM * 2,
    );
    const dropoff = this._pointToPolyline(
      passenger.endLng,
      passenger.endLat,
      driver.routeCoordinates,
      this.POLYLINE_DROPOFF_THRESHOLD_KM * 2,
    );

    const waypoints = [];
    waypoints.push({ lat: passenger.startLat, lng: passenger.startLng });
    waypoints.push({ lat: passenger.endLat, lng: passenger.endLng });

    return waypoints;
  }

  getPassengerDistance(passenger, driver) {
    if (passenger.startLat != null && passenger.endLat != null) {
      return this.calculateDistance(
        passenger.startLat,
        passenger.startLng,
        passenger.endLat,
        passenger.endLng,
      );
    }

    if (driver.startLat != null && driver.endLat != null) {
      return this.calculateDistance(
        driver.startLat,
        driver.startLng,
        driver.endLat,
        driver.endLng,
      );
    }
    return 0;
  }

  calculateMatchScore(passenger, driver) {
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

  _isWithinTimeWindow(userTime, rideTime) {
    if (!userTime || !rideTime) return true;
    const diffMin = Math.abs(new Date(userTime) - new Date(rideTime)) / 60000;
    return diffMin <= this.TIME_WINDOW_MINUTES;
  }

  findOptimalMatches(userRequest, availableRides) {
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

      const passengerKm = this.getPassengerDistance(userRequest, ride);

      const existingPassengerDistances = (ride.passengers || []).map((p) => {
        if (p.startLat != null && p.endLat != null) {
          return this.calculateDistance(
            p.startLat,
            p.startLng,
            p.endLat,
            p.endLng,
          );
        }

        if (ride.startLat != null && ride.endLat != null) {
          return this.calculateDistance(
            ride.startLat,
            ride.startLng,
            ride.endLat,
            ride.endLng,
          );
        }
        return passengerKm || 10;
      });

      const allDistances = [...existingPassengerDistances, passengerKm || 10];
      const totalPassengers = allDistances.length;
      const isFirstRider = totalPassengers === 1;

      if (isFirstRider) {
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

      const breakdowns = (() => {
        // Build segment data for fair pricing
        const allPassengerObjs = [
          ...(ride.passengers || []).map((p) => ({
            id: p.id || p.passengerId,
            startLat: p.startLat ?? ride.startLat,
            startLng: p.startLng ?? ride.startLng,
            endLat: p.endLat ?? ride.endLat,
            endLng: p.endLng ?? ride.endLng,
          })),
          {
            id: userRequest.id || userRequest.passengerId || 'new',
            startLat: userRequest.startLat,
            startLng: userRequest.startLng,
            endLat: userRequest.endLat,
            endLng: userRequest.endLng,
          },
        ];

        const driverRouteKm = ride.distanceKm || this.getPassengerDistance(
          { startLat: ride.startLat, startLng: ride.startLng, endLat: ride.endLat, endLng: ride.endLng },
          ride,
        ) || allDistances.reduce((a, b) => Math.max(a, b), 0);

        const segmentData = this.buildSegmentData(allPassengerObjs, ride, driverRouteKm);

        if (segmentData) {
          return this.calculateFairPriceBreakdown(0, allDistances, { segmentData });
        }
        return this.calculateFairPriceBreakdown(0, allDistances);
      })();
      const myBreakdown = breakdowns[breakdowns.length - 1];

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
        totalPassengers,
        passengerDistanceKm: myBreakdown.distanceKm,
        passengerWeightPercent: myBreakdown.weightPercent,
      };
    });
  }

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
      savingsPercentage: Math.round(
        ((basePrice - passengerPrice) / basePrice) * 100,
      ),
    };
  }

  suggestCarpoolGroups(requests) {
    const groups = [];
    const used = new Set();

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
              req.startLng,
              req.endLat,
              req.endLng,
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

  calculateOptimalRoute(startCoords, endCoords, waypoints = []) {
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

  toRad(degrees) {
    return this._toRad(degrees);
  }
}

export const routeMatcher = new RouteMatcher();
