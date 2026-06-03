// map.js — Interactive Leaflet Map Module for SmartRide
// Provides: markers, click-to-select, geocoding, route lines, multi-ride display

export class RideMap {
  constructor(elementId, options = {}) {
    this.elementId = elementId;
    this.map = null;
    this.startMarker = null;
    this.endMarker = null;
    this.startLocation = null;
    this.endLocation = null;
    this.routeLine = null;
    this.routeDecorator = null;
    this.selectMode = null; // 'start' | 'end' | null
    this.activeInput = null;
    this.hintElement = null;
    this.hintTextElement = null;
    this.rideRoutes = []; // For multi-ride display on dashboard
    this.rideMarkers = []; // For multi-ride markers
    this.onLocationSelected = options.onLocationSelected || null;
    this.init();
  }

  init() {
    if (typeof L === 'undefined') {
      console.warn('Leaflet not loaded');
      return;
    }
    // Yangon center coordinates
    const yangon = [16.8661, 96.1951];
    this.map = L.map(this.elementId, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView(yangon, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    // Map click handler
    this.map.on('click', (e) => this._onMapClick(e));
  }

  // ─── Create styled marker icons ───
  _createStartIcon() {
    return L.divIcon({
      className: 'smartride-marker smartride-marker--start',
      html: `
        <div class="marker-pin marker-pin--start">
          <div class="marker-pulse marker-pulse--start"></div>
          <div class="marker-icon-inner">🟢</div>
        </div>
        <div class="marker-label">Start</div>
      `,
      iconSize: [40, 52],
      iconAnchor: [20, 52],
      popupAnchor: [0, -52],
    });
  }

  _createEndIcon() {
    return L.divIcon({
      className: 'smartride-marker smartride-marker--end',
      html: `
        <div class="marker-pin marker-pin--end">
          <div class="marker-pulse marker-pulse--end"></div>
          <div class="marker-icon-inner">🔴</div>
        </div>
        <div class="marker-label">End</div>
      `,
      iconSize: [40, 52],
      iconAnchor: [20, 52],
      popupAnchor: [0, -52],
    });
  }

  _createRideStartIcon(color = '#1d9e75') {
    return L.divIcon({
      className: 'smartride-marker smartride-marker--ride-start',
      html: `
        <div class="marker-pin" style="background: ${color}; box-shadow: 0 3px 12px ${color}55;">
          <div class="marker-icon-inner" style="font-size: 14px;">▶</div>
        </div>
      `,
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -42],
    });
  }

  _createRideEndIcon(color = '#e74c3c') {
    return L.divIcon({
      className: 'smartride-marker smartride-marker--ride-end',
      html: `
        <div class="marker-pin" style="background: ${color}; box-shadow: 0 3px 12px ${color}55;">
          <div class="marker-icon-inner" style="font-size: 14px;">⬛</div>
        </div>
      `,
      iconSize: [32, 42],
      iconAnchor: [16, 42],
      popupAnchor: [0, -42],
    });
  }

  // ─── Set start location with styled marker ───
  setStartLocation(lat, lng, address) {
    if (this.startMarker) {
      this.map.removeLayer(this.startMarker);
    }
    this.startMarker = L.marker([lat, lng], {
      icon: this._createStartIcon(),
      zIndexOffset: 1000,
    }).addTo(this.map);

    this.startMarker.bindPopup(`
      <div style="font-family: var(--font-body); padding: 4px 0;">
        <div style="font-weight: 700; color: #1d9e75; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">📍 Start Point</div>
        <div style="font-size: 0.85rem; color: #333;">${address}</div>
      </div>
    `);

    this.startLocation = { lat, lng, address };
    this._updateView();
    this._drawRoute();
  }

  // ─── Set end location with styled marker ───
  setEndLocation(lat, lng, address) {
    if (this.endMarker) {
      this.map.removeLayer(this.endMarker);
    }
    this.endMarker = L.marker([lat, lng], {
      icon: this._createEndIcon(),
      zIndexOffset: 1000,
    }).addTo(this.map);

    this.endMarker.bindPopup(`
      <div style="font-family: var(--font-body); padding: 4px 0;">
        <div style="font-weight: 700; color: #e74c3c; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">🏁 End Point</div>
        <div style="font-size: 0.85rem; color: #333;">${address}</div>
      </div>
    `);

    this.endLocation = { lat, lng, address };
    this._updateView();
    this._drawRoute();
  }

  // ─── Draw animated route line between start and end ───
  _drawRoute() {
    if (!this.startLocation || !this.endLocation) return;

    if (this.routeLine) {
      this.map.removeLayer(this.routeLine);
    }

    const start = [this.startLocation.lat, this.startLocation.lng];
    const end = [this.endLocation.lat, this.endLocation.lng];

    // Create a curved path with intermediate points
    const points = this._generateCurvePath(start, end);

    this.routeLine = L.polyline(points, {
      color: '#1d9e75',
      weight: 4,
      opacity: 0.85,
      smoothFactor: 1.5,
      dashArray: '12, 8',
      dashOffset: '0',
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(this.map);

    // Add a subtle shadow line beneath
    const shadowLine = L.polyline(points, {
      color: '#1d9e75',
      weight: 8,
      opacity: 0.15,
      smoothFactor: 1.5,
      lineCap: 'round',
    }).addTo(this.map);

    // Store shadow for cleanup
    this._shadowLine = shadowLine;

    // Animate dash offset
    this._animateRoute();
  }

  _generateCurvePath(start, end) {
    // Create a slight arc between two points
    const midLat = (start[0] + end[0]) / 2;
    const midLng = (start[1] + end[1]) / 2;

    // Offset the midpoint perpendicular to the line to create a curve
    const dx = end[1] - start[1];
    const dy = end[0] - start[0];
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offset = dist * 0.08; // curve intensity

    const curvedMid = [midLat + offset * (dx / dist || 0), midLng - offset * (dy / dist || 0)];

    // Generate smooth points along the curve
    const points = [];
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lat =
        (1 - t) * (1 - t) * start[0] +
        2 * (1 - t) * t * curvedMid[0] +
        t * t * end[0];
      const lng =
        (1 - t) * (1 - t) * start[1] +
        2 * (1 - t) * t * curvedMid[1] +
        t * t * end[1];
      points.push([lat, lng]);
    }
    return points;
  }

  _animateRoute() {
    if (!this.routeLine) return;
    let offset = 0;
    const element = this.routeLine.getElement?.();
    if (element) {
      const animate = () => {
        offset = (offset + 0.5) % 20;
        element.style.strokeDashoffset = -offset;
        this._animFrame = requestAnimationFrame(animate);
      };
      animate();
    }
  }

  // ─── Update map view to fit markers ───
  _updateView() {
    if (this.startLocation && this.endLocation) {
      const bounds = L.latLngBounds(
        [this.startLocation.lat, this.startLocation.lng],
        [this.endLocation.lat, this.endLocation.lng]
      );
      this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    } else if (this.startLocation) {
      this.map.setView([this.startLocation.lat, this.startLocation.lng], 14);
    } else if (this.endLocation) {
      this.map.setView([this.endLocation.lat, this.endLocation.lng], 14);
    }
  }

  // ─── Click-to-select mode ───
  enableClickToSelect(mode, inputElement, hintEl, hintTextEl) {
    this.selectMode = mode; // 'start' or 'end'
    this.activeInput = inputElement;
    this.hintElement = hintEl;
    this.hintTextElement = hintTextEl;

    // Show hint
    if (this.hintElement) {
      this.hintElement.style.opacity = '1';
      this.hintElement.style.transform = 'translateY(0)';
    }
    if (this.hintTextElement) {
      this.hintTextElement.textContent =
        mode === 'start'
          ? '🟢 မြေပုံပေါ်တွင် ထွက်ခွာမည့်နေရာကို နှိပ်ပါ'
          : '🔴 မြေပုံပေါ်တွင် ဦးတည်ရာနေရာကို နှိပ်ပါ';
    }

    // Change cursor
    const container = this.map.getContainer();
    container.style.cursor = 'crosshair';
  }

  disableClickToSelect() {
    this.selectMode = null;
    this.activeInput = null;

    if (this.hintElement) {
      this.hintElement.style.opacity = '0';
      this.hintElement.style.transform = 'translateY(-4px)';
    }

    const container = this.map.getContainer();
    container.style.cursor = '';
  }

  async _onMapClick(e) {
    if (!this.selectMode || !this.activeInput) return;

    const { lat, lng } = e.latlng;

    // Reverse geocode
    const address = await this._reverseGeocode(lat, lng);
    const displayAddr = address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    // Set marker and fill input
    if (this.selectMode === 'start') {
      this.setStartLocation(lat, lng, displayAddr);
      this.activeInput.value = displayAddr;
    } else if (this.selectMode === 'end') {
      this.setEndLocation(lat, lng, displayAddr);
      this.activeInput.value = displayAddr;
    }

    // Trigger callback
    if (this.onLocationSelected) {
      this.onLocationSelected(this.selectMode, { lat, lng, address: displayAddr });
    }

    // Disable select mode after placing
    this.disableClickToSelect();
  }

  // ─── Geocoding: address → coordinates ───
  async geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Yangon, Myanmar')}&limit=1`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          displayName: data[0].display_name,
        };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  }

  // ─── Reverse geocoding: coordinates → address ───
  async _reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data && data.display_name) {
        // Shorten the display name
        const parts = data.display_name.split(',');
        return parts.slice(0, 3).join(',').trim();
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
    }
    return null;
  }

  // ─── Show route by geocoding location names ───
  async showRouteByNames(startName, endName) {
    const startResult = await this.geocodeAddress(startName);
    const endResult = await this.geocodeAddress(endName);

    if (startResult) {
      this.setStartLocation(startResult.lat, startResult.lng, startName);
    }
    if (endResult) {
      this.setEndLocation(endResult.lat, endResult.lng, endName);
    }
  }

  // ─── Multi-ride display (for driver dashboard) ───
  addRideRoute(ride, color = '#1d9e75', index = 0) {
    const colors = ['#1d9e75', '#3498db', '#e67e22', '#9b59b6', '#e74c3c', '#1abc9c'];
    const routeColor = colors[index % colors.length];

    return new Promise(async (resolve) => {
      const startResult = await this.geocodeAddress(ride.startLocation);
      const endResult = await this.geocodeAddress(ride.endLocation);

      if (!startResult || !endResult) {
        resolve(null);
        return;
      }

      // Start marker
      const startM = L.marker([startResult.lat, startResult.lng], {
        icon: this._createRideStartIcon(routeColor),
      }).addTo(this.map);
      startM.bindPopup(`
        <div style="font-family: var(--font-body); padding: 4px 0;">
          <div style="font-weight: 700; color: ${routeColor}; font-size: 0.72rem; text-transform: uppercase; margin-bottom: 4px;">📍 Start</div>
          <div style="font-size: 0.82rem; font-weight: 600;">${ride.startLocation}</div>
          <div style="font-size: 0.72rem; color: #666; margin-top: 2px;">🕐 ${new Date(ride.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      `);

      // End marker
      const endM = L.marker([endResult.lat, endResult.lng], {
        icon: this._createRideEndIcon(routeColor),
      }).addTo(this.map);
      endM.bindPopup(`
        <div style="font-family: var(--font-body); padding: 4px 0;">
          <div style="font-weight: 700; color: ${routeColor}; font-size: 0.72rem; text-transform: uppercase; margin-bottom: 4px;">🏁 End</div>
          <div style="font-size: 0.82rem; font-weight: 600;">${ride.endLocation}</div>
          <div style="font-size: 0.72rem; color: #666; margin-top: 2px;">👥 ${ride.bookedSeats || 0}/${ride.availableSeats || 4} ခရီးသည်</div>
        </div>
      `);

      // Route line
      const points = this._generateCurvePath(
        [startResult.lat, startResult.lng],
        [endResult.lat, endResult.lng]
      );

      const routeL = L.polyline(points, {
        color: routeColor,
        weight: 3.5,
        opacity: 0.75,
        dashArray: '10, 6',
        smoothFactor: 1.5,
        lineCap: 'round',
      }).addTo(this.map);

      this.rideMarkers.push(startM, endM);
      this.rideRoutes.push(routeL);

      resolve({ startResult, endResult, routeLine: routeL });
    });
  }

  // Fit map to show all ride routes
  fitAllRoutes() {
    if (this.rideMarkers.length === 0) return;
    const group = L.featureGroup(this.rideMarkers);
    this.map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 14 });
  }

  // Highlight a specific ride route
  highlightRide(index) {
    // Dim all routes
    this.rideRoutes.forEach((route, i) => {
      route.setStyle({ opacity: i === index ? 0.9 : 0.2, weight: i === index ? 5 : 2 });
    });

    // Zoom to highlighted route markers
    if (this.rideMarkers[index * 2] && this.rideMarkers[index * 2 + 1]) {
      const group = L.featureGroup([this.rideMarkers[index * 2], this.rideMarkers[index * 2 + 1]]);
      this.map.fitBounds(group.getBounds(), { padding: [60, 60], maxZoom: 15 });
    }
  }

  // Reset all ride highlights
  resetHighlights() {
    this.rideRoutes.forEach((route) => {
      route.setStyle({ opacity: 0.75, weight: 3.5 });
    });
    this.fitAllRoutes();
  }

  // ─── Get user's current location ───
  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
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

  // ─── Clear everything ───
  clearAll() {
    if (this.startMarker) this.map.removeLayer(this.startMarker);
    if (this.endMarker) this.map.removeLayer(this.endMarker);
    if (this.routeLine) this.map.removeLayer(this.routeLine);
    if (this._shadowLine) this.map.removeLayer(this._shadowLine);
    if (this._animFrame) cancelAnimationFrame(this._animFrame);

    this.rideMarkers.forEach((m) => this.map.removeLayer(m));
    this.rideRoutes.forEach((r) => this.map.removeLayer(r));

    this.startMarker = null;
    this.endMarker = null;
    this.startLocation = null;
    this.endLocation = null;
    this.routeLine = null;
    this._shadowLine = null;
    this.rideMarkers = [];
    this.rideRoutes = [];

    this.disableClickToSelect();
  }

  // Invalidate map size (useful after container becomes visible)
  invalidateSize() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 100);
    }
  }
}