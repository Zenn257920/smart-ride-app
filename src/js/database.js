//LocalStorage & Geminii
import { RouteMatcher } from "./matching.js";

class DatabaseManager {
  constructor() {
    this.initDatabase();
    //GeminiKey
    this.apiKey = "AIzaSyAQ-Ab8RN6ICmmw0YVmfI0xeyC78lLvzCO";
    //Price constants — aligned with RouteMatcher
    this.DRIVER_BONUS_RATE = 0;     // No separate driver bonus
    this.APP_TAX_RATE = 0.05;       // 5% app tax on subtotal
    this.APP_COMMISSION_RATE = 0.05; // Legacy alias
    // Shared matcher for distance-based pricing
    this._matcher = new RouteMatcher();
  }

  // ─── Calculate ride price from GPS coordinates ───
  _calcPriceFromCoords(startLat, startLng, endLat, endLng) {
    const result = this._matcher.calculatePriceFromCoords(startLat, startLng, endLat, endLng);
    return result ? result.price : this._matcher.DEFAULT_PRICE;
  }

  // Bump this version string whenever sample data schema changes.
  // Forces re-seed in any browser that has an older version cached.
  static get DATA_VERSION() { return 'v8-future-times'; }

  initDatabase() {
    const storedVersion = localStorage.getItem('smartride_data_version');
    if (!localStorage.getItem('smartride_users') || storedVersion !== DatabaseManager.DATA_VERSION) {
      // Clear stale data so new GPS-enabled rides seed correctly
      localStorage.removeItem('smartride_users');
      localStorage.removeItem('smartride_rides');
      localStorage.removeItem('smartride_bookings');
      localStorage.removeItem('smartride_transactions');
      localStorage.removeItem('smartride_ride_requests');
      localStorage.removeItem('smartride_notifications');
      localStorage.setItem('smartride_data_version', DatabaseManager.DATA_VERSION);
      //Sample Users JSON Data / Passengers & Drivers
      const sampleUsers = [
        {
          id: "u-1",
          name: "Demo Passenger",
          email: "passenger@demo.com",
          password: "123456",
          phone: "09123456789",
          balance: 50000,
          userType: "passenger",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-2",
          name: "ဦးလှမောင်",
          email: "driver@demo.com",
          password: "123456",
          phone: "09987654321",
          balance: 150000,
          userType: "driver",
          carModel: "Toyota Probox",
          carPlate: "YGN 3Q/1122",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-3",
          name: "ကိုကျော်စွာ",
          email: "kyawswa@smartride.mm",
          password: "123456",
          phone: "09456789123",
          balance: 80000,
          userType: "driver",
          carModel: "Honda Shuttle",
          carPlate: "YGN 2P/5566",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-4",
          name: "ဒေါ်အေးအေး",
          email: "ayeaye@smartride.mm",
          password: "123456",
          phone: "09321654987",
          balance: 120000,
          userType: "driver",
          carModel: "Suzuki Ertiga",
          carPlate: "YGN 5R/9988",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-5",
          name: "မောင်ဇော်ဇော်",
          email: "zawzaw@smartride.com",
          password: "123456",
          phone: "09789456123",
          balance: 35000,
          userType: "passenger",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-6",
          name: "မမေဇင်",
          email: "maysin@smartride.mm",
          password: "123456",
          phone: "09654321789",
          balance: 42000,
          userType: "passenger",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-7",
          name: "ကိုသန့်ဇင်",
          email: "thantzin@smartride.mm",
          password: "123456",
          phone: "09112233445",
          balance: 60000,
          userType: "passenger",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-8",
          name: "ကိုမင်းမင်း",
          email: "minmin@smartride.mm",
          password: "123456",
          phone: "09556677889",
          balance: 95000,
          userType: "driver",
          carModel: "Toyota Aqua",
          carPlate: "YGN 7T/3344",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-9",
          name: "မခင်ခင်",
          email: "khinkhin@smartride.mm",
          password: "123456",
          phone: "09887766554",
          balance: 28000,
          userType: "passenger",
          createdAt: new Date().toISOString(),
        },
        {
          id: "u-10",
          name: "ဦးထွန်းထွန်း",
          email: "htunhtun@smartride.mm",
          password: "123456",
          phone: "09334455667",
          balance: 110000,
          userType: "driver",
          carModel: "Honda Fit",
          carPlate: "YGN 1M/7788",
          createdAt: new Date().toISOString(),
        },
      ];

      // Helper to create timestamps — always relative to NOW so rides are always in the future.
      // Each call returns a time within the next 1-23 hours from now, spread across the day.
      const now = new Date();
      const setTime = (hours, minutes) => {
        // Try to set the time on today first; if already past, move to tomorrow
        const d = new Date(now);
        d.setHours(hours, minutes, 0, 0);
        if (d <= now) {
          // Time already passed today — push to tomorrow
          d.setDate(d.getDate() + 1);
        }
        return d.toISOString();
      };

      //  Sample Rides — Covering major Yangon routes
      //  All rides include real GPS coordinates for corridor matching
      const sampleRides = [
        {
          id: "ride-101",
          driverId: "u-2",
          driverName: "ဦးလှမောင်",
          startLocation: "Thanlyin (သန်လျင်)",
          endLocation: "Bahan (ဗဟန်း)",
          // Thanlyin → Bahan (south-east to center)
          startLat: 16.7784, startLng: 96.2504,
          endLat: 16.8275, endLng: 96.1623,
          departureTime: setTime(8, 30),
          availableSeats: 4,
          bookedSeats: 1,
          price: null, // auto-calculated below
          carModel: "Toyota Probox",
          carPlate: "YGN 3Q/1122",
          passengers: [
            { id: "u-5", name: "မောင်ဇော်ဇော်", pickup: "Thanlyin Bridge" },
          ],
        },
        {
          id: "ride-102",
          driverId: "u-3",
          driverName: "ကိုကျော်စွာ",
          startLocation: "Hledan (လှည်းတန်း)",
          endLocation: "Sule (ဆူးလေ)",
          // Hledan → Sule (west to downtown)
          startLat: 16.8737, startLng: 96.1317,
          endLat: 16.7747, endLng: 96.1561,
          departureTime: setTime(9, 0),
          availableSeats: 4,
          bookedSeats: 2,
          price: null, // auto-calculated below
          carModel: "Honda Shuttle",
          carPlate: "YGN 2P/5566",
          passengers: [
            { id: "u-6", name: "မမေဇင်", pickup: "Hledan Center" },
            { id: "u-7", name: "ကိုသန့်ဇင်", pickup: "Hledan Junction" },
          ],
        },
        {
          id: "ride-103",
          driverId: "u-4",
          driverName: "ဒေါ်အေးအေး",
          startLocation: "Thanlyin Star City",
          endLocation: "Hledan Centre",
          // Star City → Hledan (south → north-west)
          startLat: 16.7634, startLng: 96.2812,
          endLat: 16.8737, endLng: 96.1317,
          departureTime: setTime(7, 45),
          availableSeats: 4,
          bookedSeats: 2,
          price: null, // auto-calculated below
          carModel: "Suzuki Ertiga",
          carPlate: "YGN 5R/9988",
          passengers: [
            { id: "u-6", name: "မမေဇင်", pickup: "Star City Gate" },
            { id: "u-9", name: "မခင်ခင်", pickup: "Thanlyin Bridge" },
          ],
        },
        {
          id: "ride-104",
          driverId: "u-8",
          driverName: "ကိုမင်းမင်း",
          startLocation: "North Dagon (မြောက်ဒဂုံ)",
          endLocation: "Botahtaung (ဗိုလ်တထောင်)",
          // North Dagon → Botahtaung (north-east to downtown)
          startLat: 16.9208, startLng: 96.2011,
          endLat: 16.7793, endLng: 96.1681,
          departureTime: setTime(8, 0),
          availableSeats: 3,
          bookedSeats: 1,
          price: null, // auto-calculated below
          carModel: "Toyota Aqua",
          carPlate: "YGN 7T/3344",
          passengers: [{ id: "u-9", name: "မခင်ခင်", pickup: "Dagon Center" }],
        },
        {
          id: "ride-105",
          driverId: "u-10",
          driverName: "ဦးထွန်းထွန်း",
          startLocation: "Insein (အင်းစိန်)",
          endLocation: "Kamayut (ကမာရွတ်)",
          // Insein → Kamayut (north to center)
          startLat: 16.9726, startLng: 96.1042,
          endLat: 16.8532, endLng: 96.1170,
          departureTime: setTime(8, 15),
          availableSeats: 4,
          bookedSeats: 2,
          price: null, // auto-calculated below
          carModel: "Honda Fit",
          carPlate: "YGN 1M/7788",
          passengers: [
            { id: "u-5", name: "မောင်ဇော်ဇော်", pickup: "Insein Road" },
            { id: "u-6", name: "မမေဇင်", pickup: "Insein Station" },
          ],
        },
        {
          id: "ride-106",
          driverId: "u-2",
          driverName: "ဦးလှမောင်",
          startLocation: "South Okkalapa (တောင်ဥက္ကလာပ)",
          endLocation: "Sanchaung (စမ်းချောင်း)",
          // South Okkalapa → Sanchaung (east to west)
          startLat: 16.8493, startLng: 96.2176,
          endLat: 16.8392, endLng: 96.1226,
          departureTime: setTime(9, 30),
          availableSeats: 4,
          bookedSeats: 1,
          price: null, // auto-calculated below
          carModel: "Toyota Probox",
          carPlate: "YGN 3Q/1122",
          passengers: [
            { id: "u-7", name: "ကိုသန့်ဇင်", pickup: "South Okkalapa Market" },
          ],
        },
        {
          id: "ride-107",
          driverId: "u-3",
          driverName: "ကိုကျော်စွာ",
          startLocation: "Mingalardon (မင်္ဂလာဒုံ)",
          endLocation: "Downtown (ဗဟန်း/လမ်းမတော်)",
          // Mingalardon → Downtown (far north to center)
          startLat: 17.0473, startLng: 96.1201,
          endLat: 16.7951, endLng: 96.1484,
          departureTime: setTime(7, 30),
          availableSeats: 3,
          bookedSeats: 0,
          price: null, // auto-calculated below
          carModel: "Honda Shuttle",
          carPlate: "YGN 2P/5566",
          passengers: [],
        },
        {
          id: "ride-108",
          driverId: "u-4",
          driverName: "U Kyaw Zaw",
          startLocation: "Thaketa (သာကေတ)",
          endLocation: "Tamwe (တာမွေ)",
          // Thaketa → Tamwe (east to center)
          startLat: 16.8198, startLng: 96.2268,
          endLat: 16.8333, endLng: 96.1649,
          departureTime: setTime(8, 45),
          availableSeats: 4,
          bookedSeats: 1,
          price: null, // auto-calculated below
          carModel: "Suzuki Ertiga",
          carPlate: "YGN 5R/9988",
          passengers: [
            { id: "u-9", name: "မခင်ခင်", pickup: "Thaketa Station" },
          ],
        },
        {
          id: "ride-109",
          driverId: "u-8",
          driverName: "ကိုမင်းမင်း",
          startLocation: "Dagon Myothit (ဒဂုံမြို့သစ်)",
          endLocation: "Yankin (ရန်ကင်း)",
          // Dagon Myothit → Yankin (east to center)
          startLat: 16.8705, startLng: 96.2433,
          endLat: 16.8438, endLng: 96.1783,
          departureTime: setTime(8, 30),
          availableSeats: 3,
          bookedSeats: 2,
          price: null, // auto-calculated below
          carModel: "Toyota Aqua",
          carPlate: "YGN 7T/3344",
          passengers: [
            { id: "u-5", name: "မောင်ဇော်ဇော်", pickup: "Dagon Seikkan" },
            { id: "u-6", name: "မမေဇင်", pickup: "Dagon Bus Stop" },
          ],
        },
        {
          id: "ride-110",
          driverId: "u-10",
          driverName: "ဦးထွန်းထွန်း",
          startLocation: "Shwepyithar (ရွှေပြည်သာ)",
          endLocation: "Sule (ဆူးလေ)",
          // Shwepyithar → Sule (far north-west to downtown)
          startLat: 17.0631, startLng: 96.0526,
          endLat: 16.7747, endLng: 96.1561,
          departureTime: setTime(7, 0),
          availableSeats: 4,
          bookedSeats: 1,
          price: null, // auto-calculated below
          carModel: "Honda Fit",
          carPlate: "YGN 1M/7788",
          passengers: [
            { id: "u-7", name: "ကိုသန့်ဇင်", pickup: "Shwepyithar Junction" },
          ],
        },
      ];

      // Auto-calculate distance-based prices for all sample rides
      const priceMatcher = new RouteMatcher();
      sampleRides.forEach(ride => {
        if (ride.startLat != null && ride.endLat != null) {
          const result = priceMatcher.calculatePriceFromCoords(
            ride.startLat, ride.startLng, ride.endLat, ride.endLng
          );
          ride.price = result.price;
          ride.distanceKm = result.distanceKm;
        } else {
          ride.price = priceMatcher.DEFAULT_PRICE;
          ride.distanceKm = 0;
        }
      });

      // ── Sample Ride Requests (passengers requesting rides) ──
      const sampleRideRequests = [
        {
          id: "req-1",
          passengerId: "u-5",
          passengerName: "မောင်ဇော်ဇော်",
          passengerPhone: "09789456123",
          startLocation: "Thanlyin (သန်လျင်)",
          endLocation: "Sule (ဆူးလေ)",
          startLat: 16.7784, startLng: 96.2504,
          endLat: 16.7747, endLng: 96.1561,
          departureTime: setTime(9, 0),
          estimatedPrice: null,
          status: "pending",
          joinedPassengers: [
            {
              id: "u-7", name: "ကိုသန့်ဇင်", phone: "09112233445", joinedAt: new Date().toISOString(),
              // Shorter trip: Thanlyin → Tamwe (joins partway)
              startLocation: "Thanlyin (သန်လျင်)", endLocation: "Tamwe (တာမွေ)",
              startLat: 16.7784, startLng: 96.2504,
              endLat: 16.8333, endLng: 96.1649,
            }
          ],
          acceptedDriverId: null,
          rejectedByDrivers: [],
          createdAt: new Date().toISOString(),
        },
        {
          id: "req-2",
          passengerId: "u-6",
          passengerName: "မမေဇင်",
          passengerPhone: "09654321789",
          startLocation: "Hledan (လှည်းတန်း)",
          endLocation: "Botahtaung (ဗိုလ်တထောင်)",
          startLat: 16.8737, startLng: 96.1317,
          endLat: 16.7793, endLng: 96.1681,
          departureTime: setTime(8, 0),
          estimatedPrice: null,
          status: "pending",
          joinedPassengers: [],
          acceptedDriverId: null,
          rejectedByDrivers: [],
          createdAt: new Date().toISOString(),
        },
        {
          id: "req-3",
          passengerId: "u-9",
          passengerName: "မခင်ခင်",
          passengerPhone: "09887766554",
          startLocation: "North Dagon (မြောက်ဒဂုံ)",
          endLocation: "Tamwe (တာမွေ)",
          startLat: 16.9208, startLng: 96.2011,
          endLat: 16.8333, endLng: 96.1649,
          departureTime: setTime(7, 30),
          estimatedPrice: null,
          status: "pending",
          joinedPassengers: [
            {
              id: "u-1", name: "Demo Passenger", phone: "09123456789", joinedAt: new Date().toISOString(),
              // Shorter trip: Dagon → Yankin (shorter route than requester)
              startLocation: "North Dagon (မြောက်ဒဂုံ)", endLocation: "Yankin (ရန်ကင်း)",
              startLat: 16.9208, startLng: 96.2011,
              endLat: 16.8438, endLng: 96.1783,
            }
          ],
          acceptedDriverId: null,
          rejectedByDrivers: [],
          createdAt: new Date().toISOString(),
        },
      ];

      // Auto-calculate estimated prices + fair price breakdown for ride requests
      sampleRideRequests.forEach(req => {
        if (req.startLat != null && req.endLat != null) {
          const result = priceMatcher.calculatePriceFromCoords(
            req.startLat, req.startLng, req.endLat, req.endLng
          );
          req.estimatedPrice = result.price;
          req.distanceKm = result.distanceKm;
        } else {
          req.estimatedPrice = priceMatcher.DEFAULT_PRICE;
          req.distanceKm = 0;
        }
        // Compute fair price breakdown for all passengers
        _computeBreakdown(req, priceMatcher);
      });

      // Helper: compute priceBreakdown for a request using fair proportional pricing
      function _computeBreakdown(req, matcher) {
        const allPassengers = [
          { passengerId: req.passengerId, name: req.passengerName,
            startLat: req.startLat, startLng: req.startLng,
            endLat: req.endLat, endLng: req.endLng },
          ...req.joinedPassengers.map(p => ({
            passengerId: p.id, name: p.name,
            startLat: p.startLat ?? req.startLat, startLng: p.startLng ?? req.startLng,
            endLat: p.endLat ?? req.endLat, endLng: p.endLng ?? req.endLng,
          }))
        ];
        const distances = allPassengers.map(p =>
          p.startLat != null && p.endLat != null
            ? matcher.calculateDistance(p.startLat, p.startLng, p.endLat, p.endLng)
            : (req.distanceKm || 10)
        );
        const maxDist = Math.max(...distances);
        const routePrice = matcher.calculateDistancePrice(maxDist);
        const breakdowns = matcher.calculateFairPriceBreakdown(routePrice, distances);
        req.priceBreakdown = allPassengers.map((p, i) => ({
          passengerId: p.passengerId,
          name: p.name,
          distanceKm: Math.round(distances[i] * 10) / 10,
          price: breakdowns[i].passengerPrice,
          fareShare: breakdowns[i].fareShare,
          driverBonus: breakdowns[i].driverBonusPerPassenger,
          appFee: breakdowns[i].appCommissionPerPassenger,
          weightPercent: breakdowns[i].weightPercent,
          paidAmount: breakdowns[i].passengerPrice, // mark as pre-paid
        }));
        req.totalRoutePrice = routePrice;
      }

      localStorage.setItem("smartride_users", JSON.stringify(sampleUsers));
      localStorage.setItem("smartride_rides", JSON.stringify(sampleRides));
      localStorage.setItem("smartride_bookings", JSON.stringify([]));
      localStorage.setItem("smartride_transactions", JSON.stringify([]));
      localStorage.setItem("smartride_ride_requests", JSON.stringify(sampleRideRequests));
      localStorage.setItem("smartride_notifications", JSON.stringify([]));
    }
  }

  getUsers() {
    return JSON.parse(localStorage.getItem("smartride_users")) || [];
  }
  getRides() {
    return JSON.parse(localStorage.getItem("smartride_rides")) || [];
  }
  getBookings() {
    return JSON.parse(localStorage.getItem("smartride_bookings")) || [];
  }
  getTransactions() {
    return JSON.parse(localStorage.getItem("smartride_transactions")) || [];
  }

  getCurrentUser() {
    return JSON.parse(localStorage.getItem("smartride_currentUser"));
  }

  loginUser(identifier, password) {
    const users = this.getUsers();
    const id = (identifier || "").trim();
    const user = users.find(
      (u) => (u.email === id || u.phone === id) && u.password === password,
    );
    if (!user)
      throw new Error("email / Ph number သို့မဟုတ် Password မမှန်ကန်ပါ။");
    localStorage.setItem("smartride_currentUser", JSON.stringify(user));
    return user;
  }

  logoutUser() {
    localStorage.removeItem("smartride_currentUser");
  }

  registerUser({ name, email, phone, password, balance }) {
    if (!name || !email || !phone || !password) {
      throw new Error("Please fill in all required fields.");
    }

    const users = this.getUsers();

    // Check for duplicate email
    const existingUser = users.find((u) => u.email === email);
    if (existingUser) {
      throw new Error("A user with this email already exists.");
    }

    const newUser = {
      id: "u-" + Math.random().toString(36).substr(2, 9),
      name,
      email,
      phone,
      password,
      balance: balance || 0,
      userType: "passenger",
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    localStorage.setItem("smartride_users", JSON.stringify(users));

    return newUser;
  }

  offerRide(rideData) {
    const rides = this.getRides();

    // Auto-calculate distance-based price from GPS if available
    const startLat = rideData.startLat ?? null;
    const startLng = rideData.startLng ?? null;
    const endLat = rideData.endLat ?? null;
    const endLng = rideData.endLng ?? null;
    const routeCoordinates = rideData.routeCoordinates ?? null; // Actual road polyline
    let price = rideData.price;
    let distanceKm = rideData.distanceKm || 0;

    if (startLat != null && endLat != null) {
      const result = this._matcher.calculatePriceFromCoords(startLat, startLng, endLat, endLng);
      if (result) {
        price = result.price;
        distanceKm = result.distanceKm;
      }
    }
    // Fallback if no GPS
    if (!price) price = this._matcher.DEFAULT_PRICE;

    const newRide = {
      id: "ride-" + Math.random().toString(36).substr(2, 9),
      ...rideData,
      startLat,
      startLng,
      endLat,
      endLng,
      routeCoordinates, // Store actual road polyline for polyline-based matching
      price,
      distanceKm,
      bookedSeats: 0,
      passengers: [],
    };
    rides.push(newRide);
    localStorage.setItem("smartride_rides", JSON.stringify(rides));
    return newRide;
  }

  // ─── Route Search: Local matcher always runs; Gemini supplements & re-ranks ───
  // passengerCoords = { startLat, startLng, endLat, endLng } — optional, from map picker
  async searchRidesWithGemini(startLocation, endLocation, departureTime, passengerCoords) {
    const availableRides = this.getRides();

    // ── ALWAYS run the local matcher first (guaranteed, deterministic) ──
    const localResults = this._fallbackMatch(
      startLocation, endLocation, departureTime, availableRides, passengerCoords
    );

    const userInputJSON = {
      passengerRequest: {
        startLocation,
        endLocation,
        departureTime,
        // Include GPS coords when available so Gemini can use them
        ...(passengerCoords ? passengerCoords : {}),
      },
    };

    const databaseJSON = {
      availableDriverRides: availableRides,
    };

    const prompt = `
You are the core AI Route Matching Engine for Innovix SmartRide carpooling app in Yangon, Myanmar.

TASK:
Compare the passenger request with the available driver rides database.
Prioritise rides where:
1. The passenger's start point is near the DRIVER'S ROUTE CORRIDOR (within ~2 km of the straight line between driver start→end).
2. The passenger's destination falls along or near the driver's route (within ~2.5 km).
3. Both are travelling in roughly the same compass direction (within 65°).
4. Departure times are within 2 hours of each other.
If GPS coordinates are present, use them for corridor proximity. Also match by location name:
"သန်လျင်"=Thanlyin/Star City; "ဗဟန်း"=Bahan; "ဆူးလေ"=Sule/Downtown; "ဒဂုံ"=Dagon; "လှည်းတန်း"=Hledan.

PRICING MODEL:
- Each ride has a distance-based "price" field (subtotal before tax): BASE_FARE(1500 MMK) + distance_km × 500 MMK/km
- Passenger cost = price × 1.05 (5% application tax)
- Example: 10km → 1500 + 5000 = 6500 subtotal → 6500 × 1.05 = 6825 kyats passenger cost
- FIRST RIDER RULE: If bookedSeats is 0, set discountedPrice = Math.floor(price * 1.05), fareShare = price, driverBonusPerPassenger = 0, appCommissionPerPassenger = Math.floor(price * 0.05), savings = 0.
- SHARED RIDE (bookedSeats >= 1): Each passenger pays their own distance-based fare + 5% tax. For simplicity use equal split: fareShare = Math.floor(price / passengerCount), appCommissionPerPassenger = Math.floor(fareShare * 0.05), discountedPrice = fareShare + appCommissionPerPassenger
- "driverEarnings" = price (subtotal goes to driver)
- "savings" = price - discountedPrice
- passengerCount = bookedSeats + 1

INPUT DATA (JSON):
1. Passenger Request: ${JSON.stringify(userInputJSON)}
2. Available Driver Rides DB: ${JSON.stringify(databaseJSON)}

OUTPUT FORMAT:
Return ONLY a JSON array of matching rides. Each ride object MUST have these exact fields:
- "id", "driverId", "driverName", "startLocation", "endLocation"
- "startLat", "startLng", "endLat", "endLng": copy GPS coords from the database ride (null if missing)
- "departureTime", "availableSeats", "bookedSeats", "price", "carModel", "carPlate"
- "passengers": array [{id, name, pickup}]
- "matchScore": integer 0-100
- "discountedPrice", "fareShare", "driverBonusPerPassenger", "appCommissionPerPassenger"
- "driverEarnings", "appCommissionTotal", "savings"

Sort by matchScore descending. Return empty array [] if no matches found.
Do NOT include any text outside the JSON array.
    `;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `API Error ${response.status}: ${errorData?.error?.message || response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error(
          "Gemini API က အဖြေပြန်မပေးပါသဖြင့် Fallback ကို သုံးပါမည်။",
        );
      }

      let rawText = data.candidates[0].content.parts[0].text.trim();

      // Extract JSON array from response
      const jsonStart = rawText.indexOf("[");
      const jsonEnd = rawText.lastIndexOf("]") + 1;
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        rawText = rawText.substring(jsonStart, jsonEnd);
      }

      console.log("✅ Gemini AI Response:", rawText);
      const results = JSON.parse(rawText);

      // Normalize each Gemini result to ensure required fields with defaults
      const geminiRides = results.map((ride) => {
        const basePrice = ride.price || this._matcher.DEFAULT_PRICE;
        const isFirstRider = (ride.bookedSeats || 0) === 0;

        // First rider: pays subtotal + 5% app tax
        if (isFirstRider) {
          const appTax = Math.floor(basePrice * this.APP_TAX_RATE);
          const passengerCost = basePrice + appTax;
          return {
            id: ride.id || "ride-unknown",
            driverId: ride.driverId || "",
            driverName: ride.driverName || "Unknown Driver",
            startLocation: ride.startLocation || "",
            endLocation: ride.endLocation || "",
            startLat: ride.startLat ?? null,
            startLng: ride.startLng ?? null,
            endLat: ride.endLat ?? null,
            endLng: ride.endLng ?? null,
            departureTime: ride.departureTime || new Date().toISOString(),
            availableSeats: ride.availableSeats || 4,
            bookedSeats: 0,
            price: basePrice,
            carModel: ride.carModel || "Unknown",
            carPlate: ride.carPlate || "N/A",
            passengers: ride.passengers || [],
            matchScore: ride.matchScore || 70,
            isFirstRider: true,
            discountedPrice: passengerCost,
            fareShare: basePrice,
            driverBonusPerPassenger: 0,
            appCommissionPerPassenger: appTax,
            driverEarnings: basePrice,
            appCommissionTotal: appTax,
            savings: 0,
          };
        }

        // Shared ride pricing — each pays fare share + 5% tax
        const totalPassengers = (ride.bookedSeats || 0) + 1;
        const fareShare =
          ride.fareShare || Math.floor(basePrice / totalPassengers);
        const appCommissionPerPassenger =
          ride.appCommissionPerPassenger ||
          Math.floor(fareShare * this.APP_TAX_RATE);
        const passengerPrice = fareShare + appCommissionPerPassenger;

        return {
          id: ride.id || "ride-unknown",
          driverId: ride.driverId || "",
          driverName: ride.driverName || "Unknown Driver",
          startLocation: ride.startLocation || "",
          endLocation: ride.endLocation || "",
          startLat: ride.startLat ?? null,
          startLng: ride.startLng ?? null,
          endLat: ride.endLat ?? null,
          endLng: ride.endLng ?? null,
          departureTime: ride.departureTime || new Date().toISOString(),
          availableSeats: ride.availableSeats || 4,
          bookedSeats: ride.bookedSeats || 0,
          price: basePrice,
          carModel: ride.carModel || "Unknown",
          carPlate: ride.carPlate || "N/A",
          passengers: ride.passengers || [],
          matchScore: ride.matchScore || 70,
          isFirstRider: false,
          discountedPrice: ride.discountedPrice || passengerPrice,
          fareShare: fareShare,
          driverBonusPerPassenger: 0,
          appCommissionPerPassenger: appCommissionPerPassenger,
          driverEarnings: ride.driverEarnings || basePrice,
          appCommissionTotal:
            ride.appCommissionTotal ||
            appCommissionPerPassenger * totalPassengers,
          savings: ride.savings || basePrice - passengerPrice,
        };
      });

      // Merge Gemini results with the guaranteed local results.
      // This means even if Gemini misses an obvious match (e.g. ride-101),
      // the local matcher catches it and it still appears in results.
      console.log(`✅ Gemini returned ${geminiRides.length} | Local returned ${localResults.length} → merging`);
      return this._mergeResults(geminiRides, localResults);

    } catch (error) {
      console.warn('⚠️ Gemini failed — returning local corridor results:', error);
      return localResults;
    }
  }

  // ─── Merge Gemini results with local results ───
  // Gemini results take priority (higher matchScore preserved).
  // Local results fill any gaps Gemini missed.
  _mergeResults(geminiResults, localResults) {
    const merged = new Map();

    // Add local first (baseline)
    for (const ride of localResults) {
      merged.set(ride.id, ride);
    }

    // Gemini results overwrite local where they exist (Gemini score takes priority)
    for (const ride of geminiResults) {
      const existing = merged.get(ride.id);
      if (!existing || ride.matchScore >= existing.matchScore) {
        merged.set(ride.id, ride);
      }
    }

    // Sort by matchScore descending, return top 5
    return Array.from(merged.values())
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  }

  // ─── Fallback local matching when Gemini API is unavailable ───
  // Uses corridor-based P2S algorithm when GPS coords are available,
  // and gracefully degrades to text/alias matching when they are not.
  _fallbackMatch(startLocation, endLocation, departureTime, availableRides, passengerCoords) {
    const matcher = new RouteMatcher();

    const normalize = (str) => str.toLowerCase().replace(/[()]/g, "").trim();
    const startNorm = normalize(startLocation);
    const endNorm = normalize(endLocation);

    // Yangon area aliases for text-based fallback
    const areaAliases = {
      thanlyin: ["သန်လျင်", "thanlyin", "star city", "thanlyin star city"],
      bahan: ["ဗဟန်း", "bahan"],
      sule: ["ဆူးလေ", "sule", "downtown"],
      hledan: ["လှည်းတန်း", "hledan", "hledan centre", "hledan center"],
      insein: ["အင်းစိန်", "insein"],
      dagon: ["ဒဂုံ", "dagon", "north dagon", "မြောက်ဒဂုံ", "dagon myothit", "ဒဂုံမြို့သစ်"],
      kamayut: ["ကမာရွတ်", "kamayut"],
      sanchaung: ["စမ်းချောင်း", "sanchaung"],
      tamwe: ["တာမွေ", "tamwe"],
      yankin: ["ရန်ကင်း", "yankin"],
      botahtaung: ["ဗိုလ်တထောင်", "botahtaung"],
      thaketa: ["သာကေတ", "thaketa"],
      mingalardon: ["မင်္ဂလာဒုံ", "mingalardon"],
      shwepyithar: ["ရွှေပြည်သာ", "shwepyithar"],
      okkalapa: ["ဥက္ကလာပ", "okkalapa", "south okkalapa", "တောင်ဥက္ကလာပ"],
      latha: ["လမ်းမတော်", "latha", "lanmadaw"],
    };

    const findAreaKey = (text) => {
      const t = normalize(text);
      for (const [key, aliases] of Object.entries(areaAliases)) {
        if (aliases.some((alias) => t.includes(alias) || alias.includes(t))) return key;
      }
      return null;
    };

    const startArea = findAreaKey(startLocation);
    const endArea = findAreaKey(endLocation);

    const scored = availableRides
      .filter((ride) => {
        // Time gate: corridor GPS match = 3 hr tolerance; text fallback = 4 hr
        if (departureTime && ride.departureTime) {
          const diffMin = Math.abs(new Date(departureTime) - new Date(ride.departureTime)) / 60000;
          const hasPassengerGPS = passengerCoords && passengerCoords.startLat != null;
          const timeLimit = hasPassengerGPS ? 180 : 240; // minutes (3h GPS / 4h text)
          if (diffMin > timeLimit) return false;
        }
        return true;
      })
      .map((ride) => {
      // ── Text/alias scoring — always computed as a baseline ──
      let textScore = 0;
      const rideStartArea = findAreaKey(ride.startLocation);
      const rideEndArea = findAreaKey(ride.endLocation);

      if (startArea && rideStartArea && startArea === rideStartArea) textScore += 45;
      else if (normalize(ride.startLocation).includes(startNorm) || startNorm.includes(normalize(ride.startLocation))) textScore += 35;

      if (endArea && rideEndArea && endArea === rideEndArea) textScore += 45;
      else if (normalize(ride.endLocation).includes(endNorm) || endNorm.includes(normalize(ride.endLocation))) textScore += 35;

      // Time already gated above — add full bonus if time data exists
      if (departureTime && ride.departureTime) textScore += 10;

      // ── Attempt corridor matching if GPS coords exist ──
      if (
        passengerCoords &&
        passengerCoords.startLat != null &&
        ride.startLat != null
      ) {
        const passengerRequest = {
          startLat: passengerCoords.startLat,
          startLng: passengerCoords.startLng,
          endLat: passengerCoords.endLat,
          endLng: passengerCoords.endLng,
          departureTime,
        };
        // Pass the ride with routeCoordinates so polyline matching is used when available
        const corridorScore = matcher.calculateMatchScore(passengerRequest, ride);
        if (corridorScore > 0) {
          const usedPolyline = ride.routeCoordinates && ride.routeCoordinates.length >= 2;
          return { ...ride, matchScore: Math.min(corridorScore, 98), _usedCorridor: true, _usedPolyline: usedPolyline };
        }
        // Corridor failed — fall through to use textScore as fallback
        // (geocoded coords might be inaccurate, but text names still match)
      }

      // ── Use text/alias score (either no GPS, or GPS corridor failed) ──
      return { ...ride, matchScore: Math.min(textScore, 98), _usedCorridor: false, _usedPolyline: false };
    })
      .filter((r) => r.matchScore > 40)
      .sort((a, b) => b.matchScore - a.matchScore);

    return scored.map((r) => {
      const basePrice = r.price || this._matcher.DEFAULT_PRICE;
      const isFirstRider = (r.bookedSeats || 0) === 0;

      if (isFirstRider) {
        const appTax = Math.floor(basePrice * this.APP_TAX_RATE);
        const passengerCost = basePrice + appTax;
        return {
          ...r,
          isFirstRider: true,
          discountedPrice: passengerCost,
          fareShare: basePrice,
          driverBonusPerPassenger: 0,
          appCommissionPerPassenger: appTax,
          driverEarnings: basePrice,
          appCommissionTotal: appTax,
          savings: 0,
        };
      }

      const totalPassengers = (r.bookedSeats || 0) + 1;
      const fareShare = Math.floor(basePrice / totalPassengers);
      const appCommissionPerPassenger = Math.floor(fareShare * this.APP_TAX_RATE);
      const passengerPrice = fareShare + appCommissionPerPassenger;
      return {
        ...r,
        isFirstRider: false,
        discountedPrice: passengerPrice,
        fareShare,
        driverBonusPerPassenger: 0,
        appCommissionPerPassenger,
        driverEarnings: basePrice,
        appCommissionTotal: appCommissionPerPassenger * totalPassengers,
        savings: basePrice - passengerPrice,
      };
    });
  }

  bookRide(rideId, passengerId, totalPrice, paymentMethod = "ewallet") {
    const isCash = paymentMethod === "cash";
    const rides = this.getRides();
    const rideIndex = rides.findIndex((r) => r.id === rideId);
    if (rideIndex === -1) return false;

    // Check if ride is full
    const seatsLeft =
      (rides[rideIndex].availableSeats || 4) -
      (rides[rideIndex].bookedSeats || 0);
    if (seatsLeft <= 0) {
      throw new Error(
        "ဤခရီးစဉ်တွင် နေရာလွတ် မရှိတော့ပါ။ အခြားခရီးစဉ်ကို ရွေးပေးပါ။",
      );
    }

    const users = this.getUsers();
    const passengerIndex = users.findIndex((u) => u.id === passengerId);
    if (passengerIndex === -1) return false;

    // For e-wallet: check sufficient balance
    if (!isCash && users[passengerIndex].balance < totalPrice) {
      throw new Error(
        "လက်ကျန်ငွေ မလုံလောက်ပါသဖြင့် ကျေးဇူးပြု၍ Innovix-Wallet တွင် ငွေ အရင်ဖြည့်ပေးပါ။",
      );
    }

    rides[rideIndex].bookedSeats = (rides[rideIndex].bookedSeats || 0) + 1;

    // Add passenger to ride's passenger list
    if (!rides[rideIndex].passengers) rides[rideIndex].passengers = [];
    rides[rideIndex].passengers.push({
      id: users[passengerIndex].id,
      name: users[passengerIndex].name,
      pickup: "Requested via app",
    });

    // Calculate pricing breakdown
    const basePrice = rides[rideIndex].price || this._matcher.DEFAULT_PRICE;
    const totalPassengers = rides[rideIndex].bookedSeats;
    const isFirstRider = totalPassengers === 1;

    let fareShare,
      driverBonusPerPassenger,
      appCommissionPerPassenger,
      driverPayment;

    if (isFirstRider) {
      // First rider: subtotal + 5% app tax
      fareShare = basePrice;
      driverBonusPerPassenger = 0;
      appCommissionPerPassenger = Math.floor(basePrice * this.APP_TAX_RATE);
      driverPayment = basePrice; // Driver gets full subtotal
    } else {
      // Shared ride: split fare + 5% tax each
      fareShare = Math.floor(basePrice / totalPassengers);
      driverBonusPerPassenger = 0;
      appCommissionPerPassenger = Math.floor(fareShare * this.APP_TAX_RATE);
      driverPayment = fareShare; // Driver gets fare share
    }

    // Deduct total price from passenger (e-wallet only)
    if (!isCash) {
      users[passengerIndex].balance -= totalPrice;
    }

    // Credit driver (e-wallet only; cash handled in person)
    const driverId = rides[rideIndex].driverId;
    const driverIndex = users.findIndex((u) => u.id === driverId);
    if (!isCash && driverIndex !== -1) {
      users[driverIndex].balance =
        (users[driverIndex].balance || 0) + driverPayment;
    }

    const bookings = this.getBookings();
    const newBooking = {
      id: "book-" + Math.random().toString(36).substr(2, 9),
      rideId,
      passengerId,
      totalPrice,
      originalPrice: basePrice,
      passengerDistanceKm: rides[rideIndex].distanceKm || 0,
      fareShare,
      driverBonusPerPassenger,
      appCommission: appCommissionPerPassenger,
      driverPayment,
      paymentMethod: paymentMethod,
      status: "confirmed",
      bookingTime: new Date().toISOString(),
    };
    bookings.push(newBooking);

    const transactions = this.getTransactions();

    // Passenger payment transaction
    transactions.push({
      id: "tx-" + Math.random().toString(36).substr(2, 9),
      userId: passengerId,
      amount: isCash ? 0 : -totalPrice,
      type: isCash ? "cash" : "debit",
      description: isCash
        ? `ငွေသား ${totalPrice.toLocaleString()} ကျပ် — ယာဉ်မောင်းနှင့် တွေ့မှ ပေးချေမည်`
        : `ခရီးစဉ်ခ ${fareShare.toLocaleString()} + App အခွန် ${appCommissionPerPassenger.toLocaleString()} ကျပ် (5%)`,
      createdAt: new Date().toISOString(),
    });

    // Driver earnings transaction
    if (!isCash && driverIndex !== -1) {
      transactions.push({
        id: "tx-" + Math.random().toString(36).substr(2, 9),
        userId: driverId,
        amount: driverPayment,
        type: "credit",
        description: `ခရီးသည်ခ ${fareShare.toLocaleString()} ကျပ် ရရှိ (App အခွန် ${appCommissionPerPassenger.toLocaleString()} ကျပ် နုတ်)`,
        createdAt: new Date().toISOString(),
      });
    } else if (isCash && driverIndex !== -1) {
      transactions.push({
        id: "tx-" + Math.random().toString(36).substr(2, 9),
        userId: driverId,
        amount: 0,
        type: "cash-pending",
        description: `ငွေသား ${totalPrice.toLocaleString()} ကျပ် — ခရီးသည်ထံမှ ပေးချေရမည် (pending)`,
        createdAt: new Date().toISOString(),
      });
    }

    // App commission transaction (recorded for tracking)
    transactions.push({
      id: "tx-" + Math.random().toString(36).substr(2, 9),
      userId: "app-owner",
      amount: appCommissionPerPassenger,
      type: "credit",
      description: `SmartRide ဝန်ဆောင်ခ - ခရီးစဉ် #${rideId}`,
      createdAt: new Date().toISOString(),
    });

    // ─── Retroactive Fare Adjustment ───
    // When a new passenger joins, existing passengers may have overpaid.
    // Recalculate fair shares for everyone and refund the excess.
    if (!isFirstRider) {
      const existingBookingsForRide = bookings.filter(
        (b) => b.rideId === rideId && b.status === "confirmed" && b.id !== newBooking.id
      );

      // Gather all passengers' distances for fair proportional pricing
      const allPassengers = rides[rideIndex].passengers || [];
      const allDistances = allPassengers.map((p) => {
        // Try to find this passenger's booking to get their distance
        const pBooking = bookings.find(
          (b) => b.rideId === rideId && b.passengerId === p.id && b.status === "confirmed"
        );
        if (pBooking && pBooking.passengerDistanceKm) {
          return pBooking.passengerDistanceKm;
        }
        // Fallback: use ride distance or estimate
        return rides[rideIndex].distanceKm || 10;
      });

      // Calculate new fair breakdown for all passengers
      const fairBreakdowns = this._matcher.calculateFairPriceBreakdown(basePrice, allDistances);

      // Refund existing passengers who overpaid
      existingBookingsForRide.forEach((oldBooking) => {
        const pIndex = allPassengers.findIndex((p) => p.id === oldBooking.passengerId);
        if (pIndex === -1) return;

        const newFairPrice = fairBreakdowns[pIndex].passengerPrice;
        const oldPaid = oldBooking.totalPrice;
        const refundAmount = oldPaid - newFairPrice;

        if (refundAmount > 0) {
          // Update the old booking with new fair price
          const bookingIdx = bookings.findIndex((b) => b.id === oldBooking.id);
          if (bookingIdx !== -1) {
            bookings[bookingIdx].totalPrice = newFairPrice;
            bookings[bookingIdx].fareShare = fairBreakdowns[pIndex].fareShare;
            bookings[bookingIdx].driverBonusPerPassenger = fairBreakdowns[pIndex].driverBonusPerPassenger;
            bookings[bookingIdx].appCommission = fairBreakdowns[pIndex].appCommissionPerPassenger;
            bookings[bookingIdx].refundedAmount = (bookings[bookingIdx].refundedAmount || 0) + refundAmount;
          }

          // Refund to passenger's wallet (e-wallet bookings only)
          if (oldBooking.paymentMethod !== "cash") {
            const refundUserIdx = users.findIndex((u) => u.id === oldBooking.passengerId);
            if (refundUserIdx !== -1) {
              users[refundUserIdx].balance += refundAmount;

              // Deduct excess from driver (they received too much from first rider)
              if (driverIndex !== -1) {
                users[driverIndex].balance -= refundAmount;
              }

              // Create refund transaction for passenger
              transactions.push({
                id: "tx-" + Math.random().toString(36).substr(2, 9),
                userId: oldBooking.passengerId,
                amount: refundAmount,
                type: "refund",
                description: `↩ ခရီးသည်အသစ် ပါဝင်လာ၍ ပြန်အမ်းငွေ ${refundAmount.toLocaleString()} ကျပ် (${oldPaid.toLocaleString()} → ${newFairPrice.toLocaleString()})`,
                createdAt: new Date().toISOString(),
              });

              // Record driver adjustment transaction
              if (driverIndex !== -1) {
                transactions.push({
                  id: "tx-" + Math.random().toString(36).substr(2, 9),
                  userId: driverId,
                  amount: -refundAmount,
                  type: "adjustment",
                  description: `↩ ခရီးသည်အသစ်ပါဝင်၍ ${users[refundUserIdx].name} အား ${refundAmount.toLocaleString()} ကျပ် ပြန်အမ်း`,
                  createdAt: new Date().toISOString(),
                });
              }
            }
          }
        }
      });
    }

    localStorage.setItem("smartride_rides", JSON.stringify(rides));
    localStorage.setItem("smartride_users", JSON.stringify(users));
    localStorage.setItem("smartride_bookings", JSON.stringify(bookings));
    localStorage.setItem(
      "smartride_transactions",
      JSON.stringify(transactions),
    );
    // Only refresh the session if the booking passenger IS the currently logged-in user.
    // Avoid overwriting the session with another user's data (account switching bug).
    const currentSession = this.getCurrentUser();
    if (currentSession && currentSession.id === passengerId) {
      localStorage.setItem("smartride_currentUser", JSON.stringify(users[passengerIndex]));
    }
    return true;
  }

  updateBalance(userId, amount, description) {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return 0;

    users[index].balance = (users[index].balance || 0) + amount;

    const transactions = this.getTransactions();
    transactions.push({
      id: "tx-" + Math.random().toString(36).substr(2, 9),
      userId,
      amount,
      type: amount > 0 ? "credit" : "debit",
      description,
      createdAt: new Date().toISOString(),
    });

    localStorage.setItem("smartride_users", JSON.stringify(users));
    localStorage.setItem(
      "smartride_transactions",
      JSON.stringify(transactions),
    );
    // Only update the current session if it belongs to the same user.
    // Do NOT overwrite the session with another user's data (causes account switching bug).
    const currentSession = this.getCurrentUser();
    if (currentSession && currentSession.id === userId) {
      localStorage.setItem("smartride_currentUser", JSON.stringify(users[index]));
    }
    return users[index].balance;
  }

  getBookingsByPassenger(passengerId) {
    return this.getBookings().filter((b) => b.passengerId === passengerId);
  }
  getTransactionsByUser(userId) {
    return this.getTransactions().filter((t) => t.userId === userId);
  }
  getRidesByDriver(driverId) {
    return this.getRides().filter((r) => r.driverId === driverId);
  }

  cancelBooking(bookingId, passengerId) {
    const bookings = this.getBookings();
    const bookingIndex = bookings.findIndex(
      (b) => b.id === bookingId && b.passengerId === passengerId,
    );
    if (bookingIndex === -1) {
      throw new Error("ဤBookingကို ရှာမတွေ့ပါ။");
    }

    const booking = bookings[bookingIndex];
    if (booking.status === "cancelled") {
      throw new Error("ဤခရီးစဉ်ကို ဖျက်သိမ်းပြီးသားဖြစ်ပါသည်။");
    }

    // Mark booking as cancelled
    bookings[bookingIndex].status = "cancelled";
    bookings[bookingIndex].cancelledAt = new Date().toISOString();

    // Refund passenger
    const users = this.getUsers();
    const passengerIndex = users.findIndex((u) => u.id === passengerId);
    if (passengerIndex !== -1) {
      users[passengerIndex].balance =
        (users[passengerIndex].balance || 0) + booking.totalPrice;
    }

    // Reverse driver payment
    const rides = this.getRides();
    const rideIndex = rides.findIndex((r) => r.id === booking.rideId);
    if (rideIndex !== -1) {
      const driverId = rides[rideIndex].driverId;
      const driverIndex = users.findIndex((u) => u.id === driverId);
      const driverRefund = booking.driverPayment || booking.totalPrice;
      if (driverIndex !== -1) {
        users[driverIndex].balance =
          (users[driverIndex].balance || 0) - driverRefund;
      }

      // Decrement booked seats
      rides[rideIndex].bookedSeats = Math.max(
        0,
        (rides[rideIndex].bookedSeats || 1) - 1,
      );

      // Remove passenger from ride's passengers array
      if (rides[rideIndex].passengers) {
        rides[rideIndex].passengers = rides[rideIndex].passengers.filter(
          (p) => p.id !== passengerId,
        );
      }
    }

    // Record refund transactions
    const transactions = this.getTransactions();
    transactions.push({
      id: "tx-" + Math.random().toString(36).substr(2, 9),
      userId: passengerId,
      amount: booking.totalPrice,
      type: "credit",
      description: `ခရီးစဉ်ဖျက်သိမ်း ပြန်အမ်းငွေ ${booking.totalPrice.toLocaleString()} ကျပ်`,
      createdAt: new Date().toISOString(),
    });

    if (rideIndex !== -1) {
      const driverId = rides[rideIndex].driverId;
      const driverRefund = booking.driverPayment || booking.totalPrice;
      transactions.push({
        id: "tx-" + Math.random().toString(36).substr(2, 9),
        userId: driverId,
        amount: -driverRefund,
        type: "debit",
        description: `ခရီးသည်ဖျက်သိမ်း ပြန်အမ်းငွေ ${driverRefund.toLocaleString()} ကျပ်`,
        createdAt: new Date().toISOString(),
      });
    }

    // Save all changes
    localStorage.setItem("smartride_bookings", JSON.stringify(bookings));
    localStorage.setItem("smartride_users", JSON.stringify(users));
    localStorage.setItem("smartride_rides", JSON.stringify(rides));
    localStorage.setItem(
      "smartride_transactions",
      JSON.stringify(transactions),
    );
    if (passengerIndex !== -1) {
      localStorage.setItem(
        "smartride_currentUser",
        JSON.stringify(users[passengerIndex]),
      );
    }

    return booking.totalPrice;
  }
  // ═══════════════════════════════════════════════════════
  // ──── RIDE REQUEST SYSTEM ────
  // ═══════════════════════════════════════════════════════

  getRideRequests() {
    return JSON.parse(localStorage.getItem('smartride_ride_requests')) || [];
  }

  getNotifications(userId) {
    const all = JSON.parse(localStorage.getItem('smartride_notifications')) || [];
    return all.filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getUnreadNotificationCount(userId) {
    return this.getNotifications(userId).filter(n => !n.read).length;
  }

  addNotification(userId, message, type = 'info') {
    const notifications = JSON.parse(localStorage.getItem('smartride_notifications')) || [];
    const notif = {
      id: 'notif-' + Math.random().toString(36).substr(2, 9),
      userId,
      message,
      type, // 'accepted', 'joined', 'info'
      read: false,
      createdAt: new Date().toISOString(),
    };
    notifications.push(notif);
    localStorage.setItem('smartride_notifications', JSON.stringify(notifications));
    return notif;
  }

  markNotificationRead(notificationId) {
    const notifications = JSON.parse(localStorage.getItem('smartride_notifications')) || [];
    const idx = notifications.findIndex(n => n.id === notificationId);
    if (idx !== -1) {
      notifications[idx].read = true;
      localStorage.setItem('smartride_notifications', JSON.stringify(notifications));
    }
  }

  markAllNotificationsRead(userId) {
    const notifications = JSON.parse(localStorage.getItem('smartride_notifications')) || [];
    notifications.forEach(n => {
      if (n.userId === userId) n.read = true;
    });
    localStorage.setItem('smartride_notifications', JSON.stringify(notifications));
  }

  // ── Passenger creates a new ride request ──
  createRideRequest(data) {
    const requests = this.getRideRequests();
    const user = this.getCurrentUser();
    if (!user) throw new Error('Login လိုအပ်ပါသည်။');

    // Auto-calculate price from GPS
    let estimatedPrice = 0;
    let distanceKm = 0;
    if (data.startLat != null && data.endLat != null) {
      const result = this._matcher.calculatePriceFromCoords(
        data.startLat, data.startLng, data.endLat, data.endLng
      );
      estimatedPrice = result.price;
      distanceKm = result.distanceKm;
    } else {
      estimatedPrice = this._matcher.DEFAULT_PRICE;
    }

    // ── E-Wallet: Check sufficient balance & deduct upfront ──
    const users = this.getUsers();
    const userIdx = users.findIndex(u => u.id === user.id);
    if (userIdx === -1) throw new Error('User ရှာမတွေ့ပါ။');
    const currentBalance = users[userIdx].balance || 0;
    if (currentBalance < estimatedPrice) {
      throw new Error(
        `💰 Wallet လက်ကျန်ငွေ မလုံလောက်ပါ။ လိုအပ်ငွေ: ${estimatedPrice.toLocaleString()} ကျပ် | လက်ကျန်: ${currentBalance.toLocaleString()} ကျပ်`
      );
    }

    const newRequest = {
      id: 'req-' + Math.random().toString(36).substr(2, 9),
      passengerId: user.id,
      passengerName: user.name || 'Passenger',
      passengerPhone: user.phone || '',
      startLocation: data.startLocation,
      endLocation: data.endLocation,
      startLat: data.startLat ?? null,
      startLng: data.startLng ?? null,
      endLat: data.endLat ?? null,
      endLng: data.endLng ?? null,
      departureTime: data.departureTime,
      estimatedPrice,
      distanceKm,
      status: 'pending',
      joinedPassengers: [],
      acceptedDriverId: null,
      rejectedByDrivers: [],
      createdAt: new Date().toISOString(),
      // Initial solo price breakdown (1 passenger pays full fare)
      priceBreakdown: [{
        passengerId: user.id,
        name: user.name || 'Passenger',
        distanceKm,
        price: estimatedPrice,
        fareShare: estimatedPrice,
        driverBonus: 0,
        appFee: 0,
        weightPercent: 100,
        paidAmount: estimatedPrice,  // track actual amount deducted
      }],
      totalRoutePrice: estimatedPrice,
    };

    // Deduct from wallet
    this.updateBalance(
      user.id,
      -estimatedPrice,
      `🚗 Ride Request: ${data.startLocation} → ${data.endLocation} (ကြိုတင်ပေးချေ)`
    );

    requests.push(newRequest);
    localStorage.setItem('smartride_ride_requests', JSON.stringify(requests));
    return newRequest;
  }

  // ── Recalculate per-passenger price breakdown using fair proportional system ──
  // Route price = based on the longest rider. Each passenger pays their km-weight × route price.
  _recalculatePriceBreakdown(req) {
    const allPassengers = [
      {
        passengerId: req.passengerId,
        name: req.passengerName,
        startLat: req.startLat,
        startLng: req.startLng,
        endLat: req.endLat,
        endLng: req.endLng,
      },
      ...req.joinedPassengers.map(p => ({
        passengerId: p.id,
        name: p.name,
        startLat: p.startLat ?? req.startLat,
        startLng: p.startLng ?? req.startLng,
        endLat: p.endLat ?? req.endLat,
        endLng: p.endLng ?? req.endLng,
      }))
    ];

    const distances = allPassengers.map(p =>
      p.startLat != null && p.endLat != null
        ? this._matcher.calculateDistance(p.startLat, p.startLng, p.endLat, p.endLng)
        : (req.distanceKm || 10)
    );

    // Route price driven by the longest rider's distance
    const maxDist = Math.max(...distances);
    const routePrice = this._matcher.calculateDistancePrice(maxDist);
    const breakdowns = this._matcher.calculateFairPriceBreakdown(routePrice, distances);

    req.priceBreakdown = allPassengers.map((p, i) => ({
      passengerId: p.passengerId,
      name: p.name,
      distanceKm: Math.round(distances[i] * 10) / 10,
      price: breakdowns[i].passengerPrice,
      fareShare: breakdowns[i].fareShare,
      driverBonus: breakdowns[i].driverBonusPerPassenger,
      appFee: breakdowns[i].appCommissionPerPassenger,
      weightPercent: breakdowns[i].weightPercent,
    }));
    req.totalRoutePrice = routePrice;

    // Keep estimatedPrice in sync with requester's current share
    req.estimatedPrice = req.priceBreakdown[0]?.price ?? req.estimatedPrice;
  }

  // ── Another passenger joins an existing request ──
  // locationData = { startLocation, endLocation, startLat, startLng, endLat, endLng } (their own route)
  joinRideRequest(requestId, passengerId, locationData = {}) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx === -1) throw new Error('Ride Request ရှာမတွေ့ပါ။');

    const req = requests[idx];
    if (req.status !== 'pending') throw new Error('ဤ Request ကို လက်ခံပြီးသား/ပယ်ဖျက်ပြီးသား ဖြစ်ပါသည်။');
    if (req.passengerId === passengerId) throw new Error('ကိုယ့် Request ကိုယ် ပါဝင်၍ မရပါ။');
    if (req.joinedPassengers.some(p => p.id === passengerId)) throw new Error('ပါဝင်ပြီးသား ဖြစ်ပါသည်။');

    const users = this.getUsers();
    const passenger = users.find(u => u.id === passengerId);
    if (!passenger) throw new Error('User ရှာမတွေ့ပါ။');

    // ── Corridor validation: joiner's route must align with the original request route ──
    // Uses 5km tolerance because text-geocoded area names (Nominatim) can be 3-4km
    // from the precise GPS point stored in the database.
    const joinerHasGPS = locationData.startLat != null && locationData.endLat != null;
    const requestHasGPS = req.startLat != null && req.endLat != null;

    if (joinerHasGPS && requestHasGPS) {
      const JOIN_PICKUP_KM  = 5.0;  // tolerant threshold for area-level geocoding
      const JOIN_DROPOFF_KM = 5.0;

      // 1. Bearing check — must travel in roughly the same direction
      const jBearing = this._matcher._bearing(
        locationData.startLat, locationData.startLng,
        locationData.endLat,   locationData.endLng
      );
      const rBearing = this._matcher._bearing(
        req.startLat, req.startLng, req.endLat, req.endLng
      );
      const bearingDiff = this._matcher._bearingDiff(jBearing, rBearing);

      if (bearingDiff > this._matcher.BEARING_MAX_DIFF_DEG) {
        throw new Error(
          `❌ ဦးတည်ရာ မတူပါ (${Math.round(bearingDiff)}° ကွာ)။ ` +
          'ကိုယ်ခရီးနှင့် ကိုက်ညိသော Request ကို ရှာပါ။'
        );
      }

      // 2. Point-to-segment distances: joiner's start/end vs request's route line
      const pu = this._matcher._pointToSegment(
        locationData.startLng, locationData.startLat,
        req.startLng, req.startLat,
        req.endLng,   req.endLat
      );
      const dr = this._matcher._pointToSegment(
        locationData.endLng, locationData.endLat,
        req.startLng, req.startLat,
        req.endLng,   req.endLat
      );

      // 3. Direction order: pickup must come before dropoff along the route
      const dirOk = pu.t < dr.t;

      if (pu.distance > JOIN_PICKUP_KM || dr.distance > JOIN_DROPOFF_KM || !dirOk) {
        const pKm = Math.round(pu.distance * 10) / 10;
        const dKm = Math.round(dr.distance * 10) / 10;
        throw new Error(
          `❌ လမ်ကြောင်းမှ အကွာအဝေး — Pickup ${pKm} km · Dropoff ${dKm} km ` +
          `(${JOIN_PICKUP_KM} km အတွင်း မဝင်ပါ)။ ` +
          'ကိုယ်ခရီးနှင့် ကိုက်ညိသော Request ကို ရှာပါ။'
        );
      }
    }

    // ── Save old breakdown to compute refund diffs ──
    const oldBreakdown = (req.priceBreakdown || []).map(b => ({ ...b }));

    req.joinedPassengers.push({
      id: passengerId,
      name: passenger.name,
      phone: passenger.phone || '',
      joinedAt: new Date().toISOString(),
      // Store their own route coords for distance-based pricing
      startLocation: locationData.startLocation || req.startLocation,
      endLocation: locationData.endLocation || req.endLocation,
      startLat: locationData.startLat ?? req.startLat,
      startLng: locationData.startLng ?? req.startLng,
      endLat: locationData.endLat ?? req.endLat,
      endLng: locationData.endLng ?? req.endLng,
    });

    // Recalculate fair price breakdown for all passengers
    this._recalculatePriceBreakdown(req);

    // ── E-Wallet: charge joiner & refund existing passengers ──
    const newBreakdown = req.priceBreakdown || [];

    // Find joiner's new share
    const joinerBD = newBreakdown.find(b => b.passengerId === passengerId);
    const joinerPrice = joinerBD ? joinerBD.price : 0;

    // Check joiner has sufficient balance
    if (joinerPrice > 0) {
      const joinerBalance = passenger.balance || 0;
      if (joinerBalance < joinerPrice) {
        // Rollback: remove from joinedPassengers
        req.joinedPassengers = req.joinedPassengers.filter(p => p.id !== passengerId);
        this._recalculatePriceBreakdown(req);
        throw new Error(
          `💰 Wallet လက်ကျန်ငွေ မလုံလောက်ပါ။ လိုအပ်ငွေ: ${joinerPrice.toLocaleString()} ကျပ် | လက်ကျန်: ${joinerBalance.toLocaleString()} ကျပ်`
        );
      }

      // Deduct from joiner's wallet
      this.updateBalance(
        passengerId,
        -joinerPrice,
        `🤝 Ride Join: ${req.startLocation} → ${req.endLocation} (ကြိုတင်ပေးချေ)`
      );
      if (joinerBD) joinerBD.paidAmount = joinerPrice;
    }

    // Refund difference to existing passengers (their share decreased)
    for (const newBD of newBreakdown) {
      if (newBD.passengerId === passengerId) continue; // skip joiner
      const oldBD = oldBreakdown.find(b => b.passengerId === newBD.passengerId);
      if (!oldBD) continue;
      const previousPaid = oldBD.paidAmount || oldBD.price || 0;
      const newPrice = newBD.price || 0;
      const refundDiff = previousPaid - newPrice;
      if (refundDiff > 0) {
        this.updateBalance(
          newBD.passengerId,
          refundDiff,
          `💰 ခရီးသည်အသစ် ပါဝင်သဖြင့် ငွေပြန်အမ်း: ${req.startLocation} → ${req.endLocation} (-${refundDiff.toLocaleString()} ကျပ်)`
        );
        this.addNotification(
          newBD.passengerId,
          `💰 ${passenger.name} ပါဝင်လာသဖြင့် သင်၏ ကျသင့်ငွေ ${previousPaid.toLocaleString()} → ${newPrice.toLocaleString()} ကျပ် သို့ ကျဆင်း၊ ${refundDiff.toLocaleString()} ကျပ် ပြန်အမ်းပြီး`,
          'refund'
        );
      }
      newBD.paidAmount = newPrice; // update tracked paid amount
    }

    localStorage.setItem('smartride_ride_requests', JSON.stringify(requests));

    // Notify the request owner
    this.addNotification(
      req.passengerId,
      `${passenger.name} သည် သင်၏ "${req.startLocation} → ${req.endLocation}" ခရီးစဉ် Request တွင် ပါဝင်လာပါသည်။`,
      'joined'
    );

    return req;
  }

  // ── A passenger leaves a request they joined ──
  leaveRideRequest(requestId, passengerId) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx === -1) throw new Error('Ride Request ရှာမတွေ့ပါ။');

    const req = requests[idx];
    if (req.status !== 'pending') throw new Error('ဤ Request ကို ပြင်ဆင်၍ မရတော့ပါ။');

    // ── E-Wallet: refund the leaving passenger ──
    const leaverBD = (req.priceBreakdown || []).find(b => b.passengerId === passengerId);
    const refundAmount = leaverBD ? (leaverBD.paidAmount || leaverBD.price || 0) : 0;
    if (refundAmount > 0) {
      this.updateBalance(
        passengerId,
        refundAmount,
        `💰 Request ထွက်ခွာ ငွေပြန်အမ်း: ${req.startLocation} → ${req.endLocation}`
      );
      this.addNotification(
        passengerId,
        `💰 Request မှ ထွက်ခွာသဖြင့် ${refundAmount.toLocaleString()} ကျပ် ပြန်အမ်းပြီး`,
        'refund'
      );
    }

    req.joinedPassengers = req.joinedPassengers.filter(p => p.id !== passengerId);
    // Recalculate prices now that someone left (remaining passengers pay more)
    this._recalculatePriceBreakdown(req);
    localStorage.setItem('smartride_ride_requests', JSON.stringify(requests));
    return req;
  }

  // ── Driver accepts a ride request → creates a real ride ──
  acceptRideRequest(requestId, driverId) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx === -1) throw new Error('Ride Request ရှာမတွေ့ပါ။');

    const req = requests[idx];
    if (req.status !== 'pending') throw new Error('ဤ Request ကို လက်ခံပြီးသား/ပယ်ဖျက်ပြီးသား ဖြစ်ပါသည်။');

    const users = this.getUsers();
    const driver = users.find(u => u.id === driverId);
    if (!driver) throw new Error('Driver ရှာမတွေ့ပါ။');

    // Mark request as accepted
    req.status = 'accepted';
    req.acceptedDriverId = driverId;
    req.acceptedAt = new Date().toISOString();
    localStorage.setItem('smartride_ride_requests', JSON.stringify(requests));

    // Create a real ride from this request
    const allPassengers = [
      { id: req.passengerId, name: req.passengerName, pickup: req.startLocation },
      ...req.joinedPassengers.map(p => ({ id: p.id, name: p.name, pickup: req.startLocation })),
    ];

    const rideData = {
      driverId,
      driverName: driver.name || 'Driver',
      startLocation: req.startLocation,
      endLocation: req.endLocation,
      startLat: req.startLat,
      startLng: req.startLng,
      endLat: req.endLat,
      endLng: req.endLng,
      departureTime: req.departureTime,
      availableSeats: 4,
      carModel: driver.carModel || 'Unknown',
      carPlate: driver.carPlate || 'N/A',
    };

    const newRide = this.offerRide(rideData);

    // Add passengers to the ride
    const rides = this.getRides();
    const rideIdx = rides.findIndex(r => r.id === newRide.id);
    if (rideIdx !== -1) {
      rides[rideIdx].passengers = allPassengers;
      rides[rideIdx].bookedSeats = allPassengers.length;
      rides[rideIdx].fromRequest = requestId;
      localStorage.setItem('smartride_rides', JSON.stringify(rides));
    }

    // Notify the original requester
    this.addNotification(
      req.passengerId,
      `🎉 ${driver.name} (${driver.carModel || ''} - ${driver.carPlate || ''}) သည် သင်၏ "${req.startLocation} → ${req.endLocation}" ခရီးစဉ်ကို လက်ခံပါသည်!`,
      'accepted'
    );

    // Notify joined passengers
    req.joinedPassengers.forEach(p => {
      this.addNotification(
        p.id,
        `🎉 ${driver.name} (${driver.carModel || ''} - ${driver.carPlate || ''}) သည် "${req.startLocation} → ${req.endLocation}" ခရီးစဉ်ကို လက်ခံပါသည်!`,
        'accepted'
      );
    });

    return { request: req, ride: newRide };
  }

  // ── Driver rejects/skips a ride request ──
  rejectRideRequest(requestId, driverId) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx === -1) throw new Error('Ride Request ရှာမတွေ့ပါ။');

    if (!requests[idx].rejectedByDrivers) requests[idx].rejectedByDrivers = [];
    if (!requests[idx].rejectedByDrivers.includes(driverId)) {
      requests[idx].rejectedByDrivers.push(driverId);
    }
    localStorage.setItem('smartride_ride_requests', JSON.stringify(requests));
    return requests[idx];
  }

  // ── Original requester cancels their request ──
  cancelRideRequest(requestId, passengerId) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx === -1) throw new Error('Ride Request ရှာမတွေ့ပါ။');

    const req = requests[idx];
    if (req.passengerId !== passengerId) throw new Error('ဤ Request ကို ဖျက်သိမ်းခွင့် မရှိပါ။');
    if (req.status !== 'pending') throw new Error('ဤ Request ကို ဖျက်သိမ်း၍ မရတော့ပါ။');
    if (req.status === 'accepted') throw new Error('Driver လက်ခံပြီးသဖြင့် ဖျက်သိမ်း၍ မရတော့ပါ။');

    // ── 3-hour cancellation policy ──
    const departureDate = new Date(req.departureTime);
    const now = new Date();
    const hoursUntilDeparture = (departureDate - now) / (1000 * 60 * 60);
    if (hoursUntilDeparture < 3) {
      throw new Error(
        `⏰ ထွက်ခွာမည့်အချိန် ${Math.round(hoursUntilDeparture * 10) / 10} နာရီသာ ကျန်တော့သဖြင့် ဖျက်သိမ်း၍ မရတော့ပါ။ (3 နာရီ အလိုမှ ဖျက်သိမ်းနိုင်ပါသည်)`
      );
    }

    // ── E-Wallet: refund ALL passengers ──
    const allToRefund = (req.priceBreakdown || []);
    let totalRefunded = 0;
    allToRefund.forEach(bd => {
      const refund = bd.paidAmount || bd.price || 0;
      if (refund > 0) {
        this.updateBalance(
          bd.passengerId,
          refund,
          `💰 Request ပယ်ဖျက် ငွေပြန်အမ်း: ${req.startLocation} → ${req.endLocation}`
        );
        totalRefunded += refund;
      }
    });

    req.status = 'cancelled';
    req.cancelledAt = new Date().toISOString();
    req.totalRefunded = totalRefunded;
    localStorage.setItem('smartride_ride_requests', JSON.stringify(requests));

    // Notify joined passengers (with refund info)
    req.joinedPassengers.forEach(p => {
      const pBD = allToRefund.find(b => b.passengerId === p.id);
      const pRefund = pBD ? (pBD.paidAmount || pBD.price || 0) : 0;
      this.addNotification(
        p.id,
        `"${req.startLocation} → ${req.endLocation}" Request ပယ်ဖျက်ပြီး ${pRefund > 0 ? pRefund.toLocaleString() + ' ကျပ် ပြန်အမ်းပြီး' : ''}`,
        'refund'
      );
    });

    return req;
  }

  // ── Get pending requests for drivers (excluding rejected ones) ──
  getPendingRequestsForDriver(driverId) {
    const requests = this.getRideRequests();
    const now = new Date();
    return requests.filter(r => {
      if (r.status !== 'pending') return false;
      // Exclude expired requests
      if (new Date(r.departureTime) < now) return false;
      // Exclude requests this driver rejected
      if (r.rejectedByDrivers && r.rejectedByDrivers.includes(driverId)) return false;
      return true;
    }).sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));
  }

  // ── Get requests by a specific passenger ──
  getRideRequestsByPassenger(passengerId) {
    return this.getRideRequests().filter(
      r => r.passengerId === passengerId || r.joinedPassengers.some(p => p.id === passengerId)
    );
  }

  // ── Get all active (pending) requests for browsing ──
  getActivePendingRequests() {
    const now = new Date();
    return this.getRideRequests().filter(r => {
      if (r.status !== 'pending') return false;
      if (new Date(r.departureTime) < now) return false;
      return true;
    }).sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));
  }
}

export const db = new DatabaseManager();
