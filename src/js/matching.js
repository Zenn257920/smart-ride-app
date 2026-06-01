// Advanced Route Matching Algorithm
export class RouteMatcher {
  constructor() {
    this.baseTaxiPrice = 7500; // Base price in MMK
    this.weights = {
      startLocation: 0.4,
      endLocation: 0.4,
      timeMatch: 0.2
    };
  }
  // Calculate distance between two points using Haversine formula
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  toRad(degrees) {
    return degrees * Math.PI / 180;
  }
  // Calculate match score for a ride
  calculateMatchScore(userRequest, ride) {
    let score = 0;
    // Start location match (40%)
    const startDistance = this.calculateDistance(
      userRequest.startLat, userRequest.startLng,
      ride.startLat, ride.startLng
    );
    if (startDistance < 1) score += 40;
    else if (startDistance < 3) score += 30;
    else if (startDistance < 5) score += 15;
    // End location match (40%)
    const endDistance = this.calculateDistance(
      userRequest.endLat, userRequest.endLng,
      ride.endLat, ride.endLng
    );
    if (endDistance < 1) score += 40;
    else if (endDistance < 3) score += 30;
    else if (endDistance < 5) score += 15;
    // Time match (20%)
    const userTime = new Date(userRequest.departureTime).getTime();
    const rideTime = new Date(ride.departureTime).getTime();
    const timeDiffMinutes = Math.abs(userTime - rideTime) / (1000 * 60);
    if (timeDiffMinutes <= 15) score += 20;
    else if (timeDiffMinutes <= 30) score += 15;
    else if (timeDiffMinutes <= 60) score += 10;
    else if (timeDiffMinutes <= 120) score += 5;
    return score;
  }
  // Find optimal matching rides
  findOptimalMatches(userRequest, availableRides) {
    const scoredRides = availableRides.map(ride => ({
      ride: ride,
      score: this.calculateMatchScore(userRequest, ride)
    }));
    // Sort by score (highest first)
    scoredRides.sort((a, b) => b.score - a.score);
    // Return top 5 matches with scores > 30
    return scoredRides
      .filter(match => match.score > 30)
      .slice(0, 5)
      .map(match => {
        const currentPassengers = match.ride.bookedSeats || 0;
        const totalPassengers = currentPassengers + 1;
        const discountedPrice = Math.floor(this.baseTaxiPrice / (totalPassengers + 1));
        const savings = this.baseTaxiPrice - discountedPrice;
        return {
          ...match.ride,
          matchScore: match.score,
          matchPercentage: Math.round(match.score),
          originalPrice: this.baseTaxiPrice,
          discountedPrice: discountedPrice,
          savings: savings,
          savingsPercentage: Math.round((savings / this.baseTaxiPrice) * 100),
          totalPassengers: totalPassengers
        };
      });
  }
  // Suggest carpool groups from multiple requests
  suggestCarpoolGroups(requests) {
    const groups = [];
    const used = new Set();
    for (let i = 0; i < requests.length; i++) {
      if (used.has(i)) continue;
      const group = [requests[i]];
      used.add(i);
      for (let j = i + 1; j < requests.length; j++) {
        if (used.has(j)) continue;
        const startDistance = this.calculateDistance(
          requests[i].startLat, requests[i].startLng,
          requests[j].startLat, requests[j].startLng
        );
        const endDistance = this.calculateDistance(
          requests[i].endLat, requests[i].endLng,
          requests[j].endLat, requests[j].endLng
        );
        if (startDistance < 2 && endDistance < 2 && group.length < 4) {
          group.push(requests[j]);
          used.add(j);
        }
      }
      if (group.length > 1) {
        const pricePerPerson = Math.floor(this.baseTaxiPrice / group.length);
        groups.push({
          passengers: group,
          count: group.length,
          pricePerPerson: pricePerPerson,
          totalPrice: this.baseTaxiPrice,
          savingsPerPerson: this.baseTaxiPrice - pricePerPerson,
          totalSavings: (this.baseTaxiPrice - pricePerPerson) * group.length
        });
      }
    }
    return groups;
  }
  // Calculate optimal route (simplified)
  calculateOptimalRoute(startCoords, endCoords, waypoints = []) {
    // In a real app, you'd use a routing API like OSRM
    // This is a simplified version
    const allPoints = [startCoords, ...waypoints, endCoords];
    let totalDistance = 0;
    for (let i = 0; i < allPoints.length - 1; i++) {
      totalDistance += this.calculateDistance(
        allPoints[i].lat, allPoints[i].lng,
        allPoints[i + 1].lat, allPoints[i + 1].lng
      );
    }
    return {
      distance: totalDistance,
      estimatedTime: totalDistance * 3, // Rough estimate: 3 minutes per km
      waypoints: waypoints
    };
  }
  // Estimate price based on distance and passenger count
  estimatePrice(distanceKm, passengerCount) {
    const baseRate = 500; // 500 MMK per km
    const basePrice = distanceKm * baseRate;
    const discountedPrice = Math.floor(basePrice / (passengerCount + 1));
    return {
      basePrice: Math.floor(basePrice),
      discountedPrice: discountedPrice,
      savings: Math.floor(basePrice - discountedPrice),
      savingsPercentage: Math.round(((basePrice - discountedPrice) / basePrice) * 100)
    };
  }
}
export const routeMatcher = new RouteMatcher();