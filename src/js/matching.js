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

  calculateFairPriceBreakdown(totalRoutePrice, passengerDistances) {
    const totalKm = passengerDistances.reduce((a, b) => a + b, 0);
    if (passengerDistances.length === 0) {
      return [];
    }

    if (totalKm === 0) {
      return passengerDistances.map(() =>
        this._equalShareBreakdown(totalRoutePrice, passengerDistances.length),
      );
    }

    const personalPrices = passengerDistances.map((myKm) =>
      this.calculateDistancePrice(myKm),
    );
    const firstPassengerShare = Math.max(
      0,
      totalRoutePrice -
        personalPrices.slice(1).reduce((sum, price) => sum + price, 0),
    );

    return passengerDistances.map((myKm, index) => {
      const weight = myKm / totalKm;
      const fareShare =
        index === 0 ? firstPassengerShare : personalPrices[index];
      const cappedFareShare = Math.max(0, Math.min(fareShare, totalRoutePrice));
      const appFee = Math.floor(cappedFareShare * this.APP_TAX_RATE);
      const passengerPrice = cappedFareShare + appFee;

      return {
        fareShare: cappedFareShare,
        driverBonusPerPassenger: 0,
        appCommissionPerPassenger: appFee,
        passengerPrice,
        distanceKm: Math.round(myKm * 10) / 10,
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

      const breakdowns = this.calculateFairPriceBreakdown(
        basePrice,
        allDistances,
      );
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

        const maxDist = Math.max(...distances);
        const routePrice = this.calculateDistancePrice(maxDist);
        const breakdowns = this.calculateFairPriceBreakdown(
          routePrice,
          distances,
        );

        groups.push({
          passengers: group,
          count: group.length,
          totalPrice: routePrice,
          driverEarnings: routePrice,
          appCommissionTotal: breakdowns.reduce(
            (sum, b) => sum + b.appCommissionPerPassenger,
            0,
          ),
          perPassengerBreakdowns: breakdowns,

          pricePerPerson: Math.floor(
            breakdowns.reduce((sum, b) => sum + b.passengerPrice, 0) /
              group.length,
          ),
          savingsPerPerson: Math.floor(
            breakdowns.reduce(
              (sum, b) => sum + (routePrice - b.passengerPrice),
              0,
            ) / group.length,
          ),
          totalSavings: breakdowns.reduce(
            (sum, b) => sum + (routePrice - b.passengerPrice),
            0,
          ),
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
