// Free Map with Leaflet + OpenStreetMap
class RideMap {
  constructor(elementId) {
    this.map = null;
    this.startMarker = null;
    this.endMarker = null;
    this.startLocation = null;
    this.endLocation = null;
    this.elementId = elementId;
    this.init();
  }
  init() {
    // Yangon coordinates
    const yangon = [16.8661, 96.1951];
    this.map = L.map(this.elementId).setView(yangon, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(this.map);
  }
  setStartLocation(lat, lng, address) {
    if (this.startMarker) {
      this.map.removeLayer(this.startMarker);
    }
    this.startMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'custom-marker start-marker',
        html: '🚗',
        iconSize: [30, 30]
      })
    }).addTo(this.map);
    this.startMarker.bindPopup(`Start: ${address}`).openPopup();
    this.startLocation = { lat, lng, address };
    this.fitBounds();
  }
  setEndLocation(lat, lng, address) {
    if (this.endMarker) {
      this.map.removeLayer(this.endMarker);
    }
    this.endMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'custom-marker end-marker',
        html: '🏁',
        iconSize: [30, 30]
      })
    }).addTo(this.map);
    this.endMarker.bindPopup(`End: ${address}`).openPopup();
    this.endLocation = { lat, lng, address };
    this.fitBounds();
    this.drawRoute();
  }
  drawRoute() {
    if (this.startLocation && this.endLocation) {
      // Draw line between start and end
      const points = [
        [this.startLocation.lat, this.startLocation.lng],
        [this.endLocation.lat, this.endLocation.lng]
      ];
      if (this.routeLine) {
        this.map.removeLayer(this.routeLine);
      }
      this.routeLine = L.polyline(points, {
        color: '#1d9e75',
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10'
      }).addTo(this.map);
    }
  }
  fitBounds() {
    if (this.startLocation && this.endLocation) {
      const bounds = L.latLngBounds(
        [this.startLocation.lat, this.startLocation.lng],
        [this.endLocation.lat, this.endLocation.lng]
      );
      this.map.fitBounds(bounds, { padding: [50, 50] });
    } else if (this.startLocation) {
      this.map.setView([this.startLocation.lat, this.startLocation.lng], 15);
    } else if (this.endLocation) {
      this.map.setView([this.endLocation.lat, this.endLocation.lng], 15);
    }
  }
  // Geocoding (convert address to coordinates)
  async geocodeAddress(address) {
    // Using Nominatim (free, no API key needed)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Yangon, Myanmar')}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name
        };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  }
  // Get user's current location
  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          },
          (error) => {
            reject(error);
          }
        );
      } else {
        reject(new Error('Geolocation not supported'));
      }
    });
  }
}