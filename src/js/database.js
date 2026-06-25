import { RouteMatcher } from "./matching.js";

class DatabaseManager {
  constructor() {
    this.initDatabase();

    this.apiKey = "AIzaSyAQ-Ab8RN6ICmmw0YVmfI0xeyC78lLvzCO";

    this.DRIVER_BONUS_RATE = 0;
    this.APP_TAX_RATE = 0.05;
    this.APP_COMMISSION_RATE = 0.05;

    this._matcher = new RouteMatcher();
  }

  _calcPriceFromCoords(startLat, startLng, endLat, endLng) {
    const result = this._matcher.calculatePriceFromCoords(
      startLat,
      startLng,
      endLat,
      endLng,
    );
    return result ? result.price : this._matcher.DEFAULT_PRICE;
  }

  static get DATA_VERSION() {
    return "v9-fair-fare";
  }

  initDatabase() {
    const storedVersion = localStorage.getItem("smartride_data_version");
    if (
      !localStorage.getItem("smartride_users") ||
      storedVersion !== DatabaseManager.DATA_VERSION
    ) {
      localStorage.removeItem("smartride_users");
      localStorage.removeItem("smartride_rides");
      localStorage.removeItem("smartride_bookings");
      localStorage.removeItem("smartride_transactions");
      localStorage.removeItem("smartride_ride_requests");
      localStorage.removeItem("smartride_notifications");
      localStorage.setItem(
        "smartride_data_version",
        DatabaseManager.DATA_VERSION,
      );

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

      const now = new Date();
      const setTime = (hours, minutes) => {
        const d = new Date(now);
        d.setHours(hours, minutes, 0, 0);
        if (d <= now) {
          d.setDate(d.getDate() + 1);
        }
        return d.toISOString();
      };

      const sampleRides = [
        {
          id: "ride-101",
          driverId: "u-2",
          driverName: "ဦးလှမောင်",
          startLocation: "Thanlyin (သန်လျင်)",
          endLocation: "Bahan (ဗဟန်း)",

          startLat: 16.7784,
          startLng: 96.2504,
          endLat: 16.8275,
          endLng: 96.1623,
          departureTime: setTime(8, 30),
          availableSeats: 4,
          bookedSeats: 1,
          price: null,
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

          startLat: 16.8737,
          startLng: 96.1317,
          endLat: 16.7747,
          endLng: 96.1561,
          departureTime: setTime(9, 0),
          availableSeats: 4,
          bookedSeats: 2,
          price: null,
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

          startLat: 16.7634,
          startLng: 96.2812,
          endLat: 16.8737,
          endLng: 96.1317,
          departureTime: setTime(7, 45),
          availableSeats: 4,
          bookedSeats: 2,
          price: null,
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

          startLat: 16.9208,
          startLng: 96.2011,
          endLat: 16.7793,
          endLng: 96.1681,
          departureTime: setTime(8, 0),
          availableSeats: 3,
          bookedSeats: 1,
          price: null,
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

          startLat: 16.9726,
          startLng: 96.1042,
          endLat: 16.8532,
          endLng: 96.117,
          departureTime: setTime(8, 15),
          availableSeats: 4,
          bookedSeats: 2,
          price: null,
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

          startLat: 16.8493,
          startLng: 96.2176,
          endLat: 16.8392,
          endLng: 96.1226,
          departureTime: setTime(9, 30),
          availableSeats: 4,
          bookedSeats: 1,
          price: null,
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

          startLat: 17.0473,
          startLng: 96.1201,
          endLat: 16.7951,
          endLng: 96.1484,
          departureTime: setTime(7, 30),
          availableSeats: 3,
          bookedSeats: 0,
          price: null,
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

          startLat: 16.8198,
          startLng: 96.2268,
          endLat: 16.8333,
          endLng: 96.1649,
          departureTime: setTime(8, 45),
          availableSeats: 4,
          bookedSeats: 1,
          price: null,
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

          startLat: 16.8705,
          startLng: 96.2433,
          endLat: 16.8438,
          endLng: 96.1783,
          departureTime: setTime(8, 30),
          availableSeats: 3,
          bookedSeats: 2,
          price: null,
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

          startLat: 17.0631,
          startLng: 96.0526,
          endLat: 16.7747,
          endLng: 96.1561,
          departureTime: setTime(7, 0),
          availableSeats: 4,
          bookedSeats: 1,
          price: null,
          carModel: "Honda Fit",
          carPlate: "YGN 1M/7788",
          passengers: [
            { id: "u-7", name: "ကိုသန့်ဇင်", pickup: "Shwepyithar Junction" },
          ],
        },
      ];

      const priceMatcher = new RouteMatcher();
      sampleRides.forEach((ride) => {
        if (ride.startLat != null && ride.endLat != null) {
          const result = priceMatcher.calculatePriceFromCoords(
            ride.startLat,
            ride.startLng,
            ride.endLat,
            ride.endLng,
          );
          ride.price = result.price;
          ride.distanceKm = result.distanceKm;
        } else {
          ride.price = priceMatcher.DEFAULT_PRICE;
          ride.distanceKm = 0;
        }
      });

      const sampleRideRequests = [
        {
          id: "req-1",
          passengerId: "u-5",
          passengerName: "မောင်ဇော်ဇော်",
          passengerPhone: "09789456123",
          startLocation: "Thanlyin (သန်လျင်)",
          endLocation: "Sule (ဆူးလေ)",
          startLat: 16.7784,
          startLng: 96.2504,
          endLat: 16.7747,
          endLng: 96.1561,
          departureTime: setTime(9, 0),
          estimatedPrice: null,
          status: "pending",
          joinedPassengers: [
            {
              id: "u-7",
              name: "ကိုသန့်ဇင်",
              phone: "09112233445",
              joinedAt: new Date().toISOString(),

              startLocation: "Thanlyin (သန်လျင်)",
              endLocation: "Tamwe (တာမွေ)",
              startLat: 16.7784,
              startLng: 96.2504,
              endLat: 16.8333,
              endLng: 96.1649,
            },
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
          startLat: 16.8737,
          startLng: 96.1317,
          endLat: 16.7793,
          endLng: 96.1681,
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
          startLat: 16.9208,
          startLng: 96.2011,
          endLat: 16.8333,
          endLng: 96.1649,
          departureTime: setTime(7, 30),
          estimatedPrice: null,
          status: "pending",
          joinedPassengers: [
            {
              id: "u-1",
              name: "Demo Passenger",
              phone: "09123456789",
              joinedAt: new Date().toISOString(),

              startLocation: "North Dagon (မြောက်ဒဂုံ)",
              endLocation: "Yankin (ရန်ကင်း)",
              startLat: 16.9208,
              startLng: 96.2011,
              endLat: 16.8438,
              endLng: 96.1783,
            },
          ],
          acceptedDriverId: null,
          rejectedByDrivers: [],
          createdAt: new Date().toISOString(),
        },
      ];

      sampleRideRequests.forEach((req) => {
        if (req.startLat != null && req.endLat != null) {
          const result = priceMatcher.calculatePriceFromCoords(
            req.startLat,
            req.startLng,
            req.endLat,
            req.endLng,
          );
          req.estimatedPrice = result.price;
          req.distanceKm = result.distanceKm;
        } else {
          req.estimatedPrice = priceMatcher.DEFAULT_PRICE;
          req.distanceKm = 0;
        }

        _computeBreakdown(req, priceMatcher);
      });

      function _computeBreakdown(req, matcher) {
        const allPassengers = [
          {
            passengerId: req.passengerId,
            name: req.passengerName,
            startLat: req.startLat,
            startLng: req.startLng,
            endLat: req.endLat,
            endLng: req.endLng,
          },
          ...req.joinedPassengers.map((p) => ({
            passengerId: p.id,
            name: p.name,
            startLat: p.startLat ?? req.startLat,
            startLng: p.startLng ?? req.startLng,
            endLat: p.endLat ?? req.endLat,
            endLng: p.endLng ?? req.endLng,
          })),
        ];
        const distances = allPassengers.map((p) =>
          p.startLat != null && p.endLat != null
            ? matcher.calculateDistance(
                p.startLat,
                p.startLng,
                p.endLat,
                p.endLng,
              )
            : req.distanceKm || 10,
        );
        const driverObj = {
          startLat: req.startLat, startLng: req.startLng,
          endLat: req.endLat, endLng: req.endLng,
          routeCoordinates: req.routeCoordinates,
        };
        const totalRouteKm = req.distanceKm || distances.reduce((a, b) => Math.max(a, b), 0);
        const segmentData = matcher.buildSegmentData(allPassengers, driverObj, totalRouteKm);
        const breakdowns = segmentData
          ? matcher.calculateFairPriceBreakdown(0, distances, { segmentData })
          : matcher.calculateFairPriceBreakdown(0, distances);
        req.priceBreakdown = allPassengers.map((p, i) => ({
          passengerId: p.passengerId,
          name: p.name,
          distanceKm: Math.round(distances[i] * 10) / 10,
          price: breakdowns[i].passengerPrice,
          fareShare: breakdowns[i].fareShare,
          driverBonus: breakdowns[i].driverBonusPerPassenger,
          appFee: breakdowns[i].appCommissionPerPassenger,
          weightPercent: breakdowns[i].weightPercent,
          paidAmount: breakdowns[i].passengerPrice,
        }));
        req.totalRoutePrice = breakdowns.reduce((s, b) => s + b.fareShare, 0);
      }

      localStorage.setItem("smartride_users", JSON.stringify(sampleUsers));
      localStorage.setItem("smartride_rides", JSON.stringify(sampleRides));
      localStorage.setItem("smartride_bookings", JSON.stringify([]));
      localStorage.setItem("smartride_transactions", JSON.stringify([]));
      localStorage.setItem(
        "smartride_ride_requests",
        JSON.stringify(sampleRideRequests),
      );
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

    const startLat = rideData.startLat ?? null;
    const startLng = rideData.startLng ?? null;
    const endLat = rideData.endLat ?? null;
    const endLng = rideData.endLng ?? null;
    const routeCoordinates = rideData.routeCoordinates ?? null;
    let price = rideData.price;
    let distanceKm = rideData.distanceKm || 0;

    if (startLat != null && endLat != null) {
      const result = this._matcher.calculatePriceFromCoords(
        startLat,
        startLng,
        endLat,
        endLng,
      );
      if (result) {
        price = result.price;
        distanceKm = result.distanceKm;
      }
    }

    if (!price) price = this._matcher.DEFAULT_PRICE;

    const newRide = {
      id: "ride-" + Math.random().toString(36).substr(2, 9),
      ...rideData,
      startLat,
      startLng,
      endLat,
      endLng,
      routeCoordinates,
      price,
      distanceKm,
      bookedSeats: 0,
      passengers: [],
    };
    rides.push(newRide);
    localStorage.setItem("smartride_rides", JSON.stringify(rides));
    return newRide;
  }

  async searchRidesWithGemini(
    startLocation,
    endLocation,
    departureTime,
    passengerCoords,
  ) {
    const availableRides = this.getRides();

    const localResults = this._fallbackMatch(
      startLocation,
      endLocation,
      departureTime,
      availableRides,
      passengerCoords,
    );

    const userInputJSON = {
      passengerRequest: {
        startLocation,
        endLocation,
        departureTime,

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

      const jsonStart = rawText.indexOf("[");
      const jsonEnd = rawText.lastIndexOf("]") + 1;
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        rawText = rawText.substring(jsonStart, jsonEnd);
      }

      console.log("✅ Gemini AI Response:", rawText);
      const results = JSON.parse(rawText);

      const geminiRides = results.map((ride) => {
        const basePrice = ride.price || this._matcher.DEFAULT_PRICE;
        const isFirstRider = (ride.bookedSeats || 0) === 0;

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

      console.log(
        `✅ Gemini returned ${geminiRides.length} | Local returned ${localResults.length} → merging`,
      );
      return this._mergeResults(geminiRides, localResults);
    } catch (error) {
      console.warn(
        "⚠️ Gemini failed — returning local corridor results:",
        error,
      );
      return localResults;
    }
  }

  _mergeResults(geminiResults, localResults) {
    const merged = new Map();

    for (const ride of localResults) {
      merged.set(ride.id, ride);
    }

    for (const ride of geminiResults) {
      const existing = merged.get(ride.id);
      if (!existing || ride.matchScore >= existing.matchScore) {
        merged.set(ride.id, ride);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);
  }

  _fallbackMatch(
    startLocation,
    endLocation,
    departureTime,
    availableRides,
    passengerCoords,
  ) {
    const matcher = new RouteMatcher();

    const normalize = (str) => str.toLowerCase().replace(/[()]/g, "").trim();
    const startNorm = normalize(startLocation);
    const endNorm = normalize(endLocation);

    const areaAliases = {
      thanlyin: ["သန်လျင်", "thanlyin", "star city", "thanlyin star city"],
      bahan: ["ဗဟန်း", "bahan"],
      sule: ["ဆူးလေ", "sule", "downtown"],
      hledan: ["လှည်းတန်း", "hledan", "hledan centre", "hledan center"],
      insein: ["အင်းစိန်", "insein"],
      dagon: [
        "ဒဂုံ",
        "dagon",
        "north dagon",
        "မြောက်ဒဂုံ",
        "dagon myothit",
        "ဒဂုံမြို့သစ်",
      ],
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
        if (aliases.some((alias) => t.includes(alias) || alias.includes(t)))
          return key;
      }
      return null;
    };

    const startArea = findAreaKey(startLocation);
    const endArea = findAreaKey(endLocation);

    const scored = availableRides
      .filter((ride) => {
        if (departureTime && ride.departureTime) {
          const diffMin =
            Math.abs(new Date(departureTime) - new Date(ride.departureTime)) /
            60000;
          const hasPassengerGPS =
            passengerCoords && passengerCoords.startLat != null;
          const timeLimit = hasPassengerGPS ? 180 : 240;
          if (diffMin > timeLimit) return false;
        }
        return true;
      })
      .map((ride) => {
        let textScore = 0;
        const rideStartArea = findAreaKey(ride.startLocation);
        const rideEndArea = findAreaKey(ride.endLocation);

        if (startArea && rideStartArea && startArea === rideStartArea)
          textScore += 45;
        else if (
          normalize(ride.startLocation).includes(startNorm) ||
          startNorm.includes(normalize(ride.startLocation))
        )
          textScore += 35;

        if (endArea && rideEndArea && endArea === rideEndArea) textScore += 45;
        else if (
          normalize(ride.endLocation).includes(endNorm) ||
          endNorm.includes(normalize(ride.endLocation))
        )
          textScore += 35;

        if (departureTime && ride.departureTime) textScore += 10;

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

          const corridorScore = matcher.calculateMatchScore(
            passengerRequest,
            ride,
          );
          if (corridorScore > 0) {
            const usedPolyline =
              ride.routeCoordinates && ride.routeCoordinates.length >= 2;
            return {
              ...ride,
              matchScore: Math.min(corridorScore, 98),
              _usedCorridor: true,
              _usedPolyline: usedPolyline,
            };
          }
        }

        return {
          ...ride,
          matchScore: Math.min(textScore, 98),
          _usedCorridor: false,
          _usedPolyline: false,
        };
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
      const appCommissionPerPassenger = Math.floor(
        fareShare * this.APP_TAX_RATE,
      );
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

    if (!isCash && users[passengerIndex].balance < totalPrice) {
      throw new Error("Insufficient Balance");
    }

    rides[rideIndex].bookedSeats = (rides[rideIndex].bookedSeats || 0) + 1;

    if (!rides[rideIndex].passengers) rides[rideIndex].passengers = [];
    rides[rideIndex].passengers.push({
      id: users[passengerIndex].id,
      name: users[passengerIndex].name,
      pickup: "Requested via app",
    });

    const basePrice = rides[rideIndex].price || this._matcher.DEFAULT_PRICE;
    const totalPassengers = rides[rideIndex].bookedSeats;
    const isFirstRider = totalPassengers === 1;

    let fareShare,
      driverBonusPerPassenger,
      appCommissionPerPassenger,
      driverPayment;

    if (isFirstRider) {
      fareShare = basePrice;
      driverBonusPerPassenger = 0;
      appCommissionPerPassenger = Math.floor(basePrice * this.APP_TAX_RATE);
      driverPayment = basePrice;
    } else {
      fareShare = Math.floor(basePrice / totalPassengers);
      driverBonusPerPassenger = 0;
      appCommissionPerPassenger = Math.floor(fareShare * this.APP_TAX_RATE);
      driverPayment = fareShare; // Driver gets fare share
    }

    if (!isCash) {
      users[passengerIndex].balance -= totalPrice;
    }

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

    transactions.push({
      id: "tx-" + Math.random().toString(36).substr(2, 9),
      userId: "app-owner",
      amount: appCommissionPerPassenger,
      type: "credit",
      description: `SmartRide ဝန်ဆောင်ခ - ခရီးစဉ် #${rideId}`,
      createdAt: new Date().toISOString(),
    });

    if (!isFirstRider) {
      const existingBookingsForRide = bookings.filter(
        (b) =>
          b.rideId === rideId &&
          b.status === "confirmed" &&
          b.id !== newBooking.id,
      );

      const allPassengers = rides[rideIndex].passengers || [];
      const allDistances = allPassengers.map((p) => {
        const pBooking = bookings.find(
          (b) =>
            b.rideId === rideId &&
            b.passengerId === p.id &&
            b.status === "confirmed",
        );
        if (pBooking && pBooking.passengerDistanceKm) {
          return pBooking.passengerDistanceKm;
        }

        return rides[rideIndex].distanceKm || 10;
      });

      const ride = rides[rideIndex];
      const driverObj = {
        startLat: ride.startLat, startLng: ride.startLng,
        endLat: ride.endLat, endLng: ride.endLng,
        routeCoordinates: ride.routeCoordinates,
      };
      const totalRouteKm = ride.distanceKm || allDistances.reduce((a, b) => Math.max(a, b), 0);
      const segmentData = this._matcher.buildSegmentData(
        allPassengers.map((p) => ({
          id: p.id,
          startLat: p.startLat ?? ride.startLat,
          startLng: p.startLng ?? ride.startLng,
          endLat: p.endLat ?? ride.endLat,
          endLng: p.endLng ?? ride.endLng,
        })),
        driverObj,
        totalRouteKm,
      );

      const fairBreakdowns = segmentData
        ? this._matcher.calculateFairPriceBreakdown(0, allDistances, { segmentData })
        : this._matcher.calculateFairPriceBreakdown(0, allDistances);

      existingBookingsForRide.forEach((oldBooking) => {
        const pIndex = allPassengers.findIndex(
          (p) => p.id === oldBooking.passengerId,
        );
        if (pIndex === -1) return;

        const newFairPrice = fairBreakdowns[pIndex].passengerPrice;
        const oldPaid = oldBooking.totalPrice;
        const refundAmount = oldPaid - newFairPrice;

        if (refundAmount > 0) {
          const bookingIdx = bookings.findIndex((b) => b.id === oldBooking.id);
          if (bookingIdx !== -1) {
            bookings[bookingIdx].totalPrice = newFairPrice;
            bookings[bookingIdx].fareShare = fairBreakdowns[pIndex].fareShare;
            bookings[bookingIdx].driverBonusPerPassenger =
              fairBreakdowns[pIndex].driverBonusPerPassenger;
            bookings[bookingIdx].appCommission =
              fairBreakdowns[pIndex].appCommissionPerPassenger;
            bookings[bookingIdx].refundedAmount =
              (bookings[bookingIdx].refundedAmount || 0) + refundAmount;
          }

          if (oldBooking.paymentMethod !== "cash") {
            const refundUserIdx = users.findIndex(
              (u) => u.id === oldBooking.passengerId,
            );
            if (refundUserIdx !== -1) {
              users[refundUserIdx].balance += refundAmount;

              if (driverIndex !== -1) {
                users[driverIndex].balance -= refundAmount;
              }

              transactions.push({
                id: "tx-" + Math.random().toString(36).substr(2, 9),
                userId: oldBooking.passengerId,
                amount: refundAmount,
                type: "refund",
                description: `↩ ခရီးသည်အသစ် ပါဝင်လာ၍ ပြန်အမ်းငွေ ${refundAmount.toLocaleString()} ကျပ် (${oldPaid.toLocaleString()} → ${newFairPrice.toLocaleString()})`,
                createdAt: new Date().toISOString(),
              });

              if (driverIndex !== -1) {
                transactions.push({
                  id: "tx-" + Math.random().toString(36).substr(2, 9),
                  userId: driverId,
                  amount: -refundAmount,
                  type: "adjustment",
                  description: `↩ Since new Passenger Joined ${users[refundUserIdx].name}  ${refundAmount.toLocaleString()} Kyats Refund`,
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

    const currentSession = this.getCurrentUser();
    if (currentSession && currentSession.id === passengerId) {
      localStorage.setItem(
        "smartride_currentUser",
        JSON.stringify(users[passengerIndex]),
      );
    }
    return true;
  }

  updateBalance(userId, amount, description, transactionType = null) {
    const users = this.getUsers();
    const index = users.findIndex((u) => u.id === userId);
    if (index === -1) return 0;

    users[index].balance = (users[index].balance || 0) + amount;

    const transactions = this.getTransactions();
    transactions.push({
      id: "tx-" + Math.random().toString(36).substr(2, 9),
      userId,
      amount,
      type: transactionType || (amount > 0 ? "credit" : "debit"),
      description,
      createdAt: new Date().toISOString(),
    });

    localStorage.setItem("smartride_users", JSON.stringify(users));
    localStorage.setItem(
      "smartride_transactions",
      JSON.stringify(transactions),
    );

    const currentSession = this.getCurrentUser();
    if (currentSession && currentSession.id === userId) {
      localStorage.setItem(
        "smartride_currentUser",
        JSON.stringify(users[index]),
      );
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
      throw new Error("Can't Find This Booking");
    }

    const booking = bookings[bookingIndex];
    if (booking.status === "cancelled") {
      throw new Error("Already Cancel this Ride");
    }

    bookings[bookingIndex].status = "cancelled";
    bookings[bookingIndex].cancelledAt = new Date().toISOString();

    const users = this.getUsers();
    const passengerIndex = users.findIndex((u) => u.id === passengerId);
    if (passengerIndex !== -1) {
      users[passengerIndex].balance =
        (users[passengerIndex].balance || 0) + booking.totalPrice;
    }

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

      rides[rideIndex].bookedSeats = Math.max(
        0,
        (rides[rideIndex].bookedSeats || 1) - 1,
      );

      if (rides[rideIndex].passengers) {
        rides[rideIndex].passengers = rides[rideIndex].passengers.filter(
          (p) => p.id !== passengerId,
        );
      }
    }

    const transactions = this.getTransactions();
    transactions.push({
      id: "tx-" + Math.random().toString(36).substr(2, 9),
      userId: passengerId,
      amount: booking.totalPrice,
      type: "credit",
      description: `Ride Cancle Refund ${booking.totalPrice.toLocaleString()} Kyats`,
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
        description: `Cancled Passenger refund ${driverRefund.toLocaleString()} ကျပ်`,
        createdAt: new Date().toISOString(),
      });
    }

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

  getRideRequests() {
    return JSON.parse(localStorage.getItem("smartride_ride_requests")) || [];
  }

  getNotifications(userId) {
    const all =
      JSON.parse(localStorage.getItem("smartride_notifications")) || [];
    return all
      .filter((n) => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getUnreadNotificationCount(userId) {
    return this.getNotifications(userId).filter((n) => !n.read).length;
  }

  addNotification(userId, message, type = "info") {
    const notifications =
      JSON.parse(localStorage.getItem("smartride_notifications")) || [];
    const notif = {
      id: "notif-" + Math.random().toString(36).substr(2, 9),
      userId,
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
    };
    notifications.push(notif);
    localStorage.setItem(
      "smartride_notifications",
      JSON.stringify(notifications),
    );
    return notif;
  }

  markNotificationRead(notificationId) {
    const notifications =
      JSON.parse(localStorage.getItem("smartride_notifications")) || [];
    const idx = notifications.findIndex((n) => n.id === notificationId);
    if (idx !== -1) {
      notifications[idx].read = true;
      localStorage.setItem(
        "smartride_notifications",
        JSON.stringify(notifications),
      );
    }
  }

  markAllNotificationsRead(userId) {
    const notifications =
      JSON.parse(localStorage.getItem("smartride_notifications")) || [];
    notifications.forEach((n) => {
      if (n.userId === userId) n.read = true;
    });
    localStorage.setItem(
      "smartride_notifications",
      JSON.stringify(notifications),
    );
  }

  createRideRequest(data) {
    const requests = this.getRideRequests();
    const user = this.getCurrentUser();
    if (!user) throw new Error("Login First");

    let estimatedPrice = 0;
    let distanceKm = 0;
    let baseFare = 0;
    let appTax = 0;
    if (data.startLat != null && data.endLat != null) {
      const result = this._matcher.calculatePriceFromCoords(
        data.startLat,
        data.startLng,
        data.endLat,
        data.endLng,
      );
      baseFare = result ? result.price : 0;
      appTax = result ? result.appTax : 0;
      estimatedPrice = result ? result.passengerCost : 0;
      distanceKm = result ? result.distanceKm : 0;
    } else {
      baseFare = this._matcher.DEFAULT_PRICE;
      appTax = Math.floor(baseFare * this._matcher.APP_TAX_RATE);
      estimatedPrice = baseFare + appTax;
    }

    const users = this.getUsers();
    const userIdx = users.findIndex((u) => u.id === user.id);
    if (userIdx === -1) throw new Error("Cannot Find User");
    const currentBalance = users[userIdx].balance || 0;
    if (currentBalance < estimatedPrice) {
      throw new Error(
        ` Wallet Balance Insufficient! Need: ${estimatedPrice.toLocaleString()} Kyats | Remain Balance: ${currentBalance.toLocaleString()} Kyats`,
      );
    }

    const newRequest = {
      id: "req-" + Math.random().toString(36).substr(2, 9),
      passengerId: user.id,
      passengerName: user.name || "Passenger",
      passengerPhone: user.phone || "",
      startLocation: data.startLocation,
      endLocation: data.endLocation,
      startLat: data.startLat ?? null,
      startLng: data.startLng ?? null,
      endLat: data.endLat ?? null,
      endLng: data.endLng ?? null,
      departureTime: data.departureTime,
      estimatedPrice,
      distanceKm,
      status: "pending",
      joinedPassengers: [],
      acceptedDriverId: null,
      rejectedByDrivers: [],
      createdAt: new Date().toISOString(),

      priceBreakdown: [
        {
          passengerId: user.id,
          name: user.name || "Passenger",
          distanceKm,
          price: estimatedPrice,
          fareShare: baseFare,
          driverBonus: 0,
          appFee: appTax,
          weightPercent: 100,
          paidAmount: estimatedPrice,
        },
      ],
      totalRoutePrice: baseFare,
    };

    this.updateBalance(
      user.id,
      -estimatedPrice,
      ` Ride Request: ${data.startLocation} → ${data.endLocation} (Pre-cash)`,
    );

    requests.push(newRequest);
    localStorage.setItem("smartride_ride_requests", JSON.stringify(requests));
    return newRequest;
  }

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
      ...req.joinedPassengers.map((p) => ({
        passengerId: p.id,
        name: p.name,
        startLat: p.startLat ?? req.startLat,
        startLng: p.startLng ?? req.startLng,
        endLat: p.endLat ?? req.endLat,
        endLng: p.endLng ?? req.endLng,
      })),
    ];

    const distances = allPassengers.map((p) =>
      p.startLat != null && p.endLat != null
        ? this._matcher.calculateDistance(
            p.startLat,
            p.startLng,
            p.endLat,
            p.endLng,
          )
        : req.distanceKm || 10,
    );

    const driverObj = {
      startLat: req.startLat, startLng: req.startLng,
      endLat: req.endLat, endLng: req.endLng,
      routeCoordinates: req.routeCoordinates,
    };
    const totalRouteKm = req.distanceKm || distances.reduce((a, b) => Math.max(a, b), 0);
    const segmentData = this._matcher.buildSegmentData(allPassengers, driverObj, totalRouteKm);
    const breakdowns = segmentData
      ? this._matcher.calculateFairPriceBreakdown(0, distances, { segmentData })
      : this._matcher.calculateFairPriceBreakdown(0, distances);

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
    req.totalRoutePrice = breakdowns.reduce((s, b) => s + b.fareShare, 0);

    req.estimatedPrice = req.priceBreakdown[0]?.price ?? req.estimatedPrice;
  }

  _applyJoinRefunds(req, oldBreakdown, newBreakdown, joinerName, joinerId) {
    for (const newBD of newBreakdown) {
      if (newBD.passengerId === joinerId) continue;

      const oldBD = oldBreakdown.find(
        (b) => b.passengerId === newBD.passengerId,
      );
      if (!oldBD) continue;

      const previousPaid = oldBD.paidAmount || oldBD.price || 0;
      const newPrice = newBD.price || 0;
      const refundDiff = previousPaid - newPrice;

      if (refundDiff > 0) {
        this.updateBalance(
          newBD.passengerId,
          refundDiff,
          ` New Passenger Joined and Refund: ${req.startLocation} → ${req.endLocation} (-${refundDiff.toLocaleString()} Kyats)`,
          "refund",
        );
        this.addNotification(
          newBD.passengerId,
          ` ${joinerName} was Joined! Your Cost ${previousPaid.toLocaleString()} → ${newPrice.toLocaleString()} Kyats need to cash၊ ${refundDiff.toLocaleString()} Kyats Refund`,
          "refund",
        );
      }

      newBD.paidAmount = newPrice;
    }
  }

  joinRideRequest(requestId, passengerId, locationData = {}) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx === -1) throw new Error("Cannot Find Ride Request ");

    const req = requests[idx];
    if (req.status !== "pending")
      throw new Error("Already Accepted/Canceled this request");
    if (req.passengerId === passengerId)
      throw new Error("ကိုယ့် Request ကိုယ် ပါဝင်၍ မရပါ။");
    if (req.joinedPassengers.some((p) => p.id === passengerId))
      throw new Error("Already in this Request");

    const users = this.getUsers();
    const passenger = users.find((u) => u.id === passengerId);
    if (!passenger) throw new Error("Cannot Find User");

    const joinerHasGPS =
      locationData.startLat != null && locationData.endLat != null;
    const requestHasGPS = req.startLat != null && req.endLat != null;

    if (joinerHasGPS && requestHasGPS) {
      const JOIN_PICKUP_KM = 5.0;
      const JOIN_DROPOFF_KM = 5.0;

      const jBearing = this._matcher._bearing(
        locationData.startLat,
        locationData.startLng,
        locationData.endLat,
        locationData.endLng,
      );
      const rBearing = this._matcher._bearing(
        req.startLat,
        req.startLng,
        req.endLat,
        req.endLng,
      );
      const bearingDiff = this._matcher._bearingDiff(jBearing, rBearing);

      if (bearingDiff > this._matcher.BEARING_MAX_DIFF_DEG) {
        throw new Error(
          `❌ Diff Direction (${Math.round(bearingDiff)}° Diff) ` +
            "Find same direction request",
        );
      }

      const pu = this._matcher._pointToSegment(
        locationData.startLng,
        locationData.startLat,
        req.startLng,
        req.startLat,
        req.endLng,
        req.endLat,
      );
      const dr = this._matcher._pointToSegment(
        locationData.endLng,
        locationData.endLat,
        req.startLng,
        req.startLat,
        req.endLng,
        req.endLat,
      );

      const dirOk = pu.t < dr.t;

      if (
        pu.distance > JOIN_PICKUP_KM ||
        dr.distance > JOIN_DROPOFF_KM ||
        !dirOk
      ) {
        const pKm = Math.round(pu.distance * 10) / 10;
        const dKm = Math.round(dr.distance * 10) / 10;
        throw new Error(
          `❌ distance route — Pickup ${pKm} km · Dropoff ${dKm} km ` +
            `(${JOIN_PICKUP_KM} km Different)။ ` +
            "Find same route request",
        );
      }
    }

    const oldBreakdown = (req.priceBreakdown || []).map((b) => ({ ...b }));

    req.joinedPassengers.push({
      id: passengerId,
      name: passenger.name,
      phone: passenger.phone || "",
      joinedAt: new Date().toISOString(),

      startLocation: locationData.startLocation || req.startLocation,
      endLocation: locationData.endLocation || req.endLocation,
      startLat: locationData.startLat ?? req.startLat,
      startLng: locationData.startLng ?? req.startLng,
      endLat: locationData.endLat ?? req.endLat,
      endLng: locationData.endLng ?? req.endLng,
    });

    this._recalculatePriceBreakdown(req);

    const newBreakdown = req.priceBreakdown || [];

    const joinerBD = newBreakdown.find((b) => b.passengerId === passengerId);
    const joinerPrice = joinerBD ? joinerBD.price : 0;

    if (joinerPrice > 0) {
      const joinerBalance = passenger.balance || 0;
      if (joinerBalance < joinerPrice) {
        req.joinedPassengers = req.joinedPassengers.filter(
          (p) => p.id !== passengerId,
        );
        this._recalculatePriceBreakdown(req);
        throw new Error(
          ` Insufficient Balance in Wallet! Require Balance: ${joinerPrice.toLocaleString()} Kyats | Remain Balance: ${joinerBalance.toLocaleString()} Kyats`,
        );
      }

      this.updateBalance(
        passengerId,
        -joinerPrice,
        ` Ride Join: ${req.startLocation} → ${req.endLocation} (Pre Cash)`,
      );
      if (joinerBD) joinerBD.paidAmount = joinerPrice;
    }

    this._applyJoinRefunds(
      req,
      oldBreakdown,
      newBreakdown,
      passenger.name,
      passengerId,
    );

    localStorage.setItem("smartride_ride_requests", JSON.stringify(requests));

    this.addNotification(
      req.passengerId,
      `${passenger.name} was Joined Your "${req.startLocation} → ${req.endLocation}" Ride Request`,
      "joined",
    );

    return req;
  }

  leaveRideRequest(requestId, passengerId) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx === -1) throw new Error("Ride Request cannot find");

    const req = requests[idx];
    if (req.status !== "pending") throw new Error("Cannot Repair this request");

    const leaverBD = (req.priceBreakdown || []).find(
      (b) => b.passengerId === passengerId,
    );
    const refundAmount = leaverBD
      ? leaverBD.paidAmount || leaverBD.price || 0
      : 0;
    if (refundAmount > 0) {
      this.updateBalance(
        passengerId,
        refundAmount,
        ` Request leave refund: ${req.startLocation} → ${req.endLocation}`,
        "refund",
      );
      this.addNotification(
        passengerId,
        ` Since leave from Request ${refundAmount.toLocaleString()} Kyats Refund`,
        "refund",
      );
    }

    req.joinedPassengers = req.joinedPassengers.filter(
      (p) => p.id !== passengerId,
    );

    this._recalculatePriceBreakdown(req);
    localStorage.setItem("smartride_ride_requests", JSON.stringify(requests));
    return req;
  }

  acceptRideRequest(requestId, driverId) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx === -1) throw new Error("Cannot find Ride Request");

    const req = requests[idx];
    if (req.status !== "pending")
      throw new Error("Already Accepted/Canceled this request");

    const users = this.getUsers();
    const driver = users.find((u) => u.id === driverId);
    if (!driver) throw new Error("Driver cannot find");

    req.status = "accepted";
    req.acceptedDriverId = driverId;
    req.acceptedAt = new Date().toISOString();
    localStorage.setItem("smartride_ride_requests", JSON.stringify(requests));

    const allPassengers = [
      {
        id: req.passengerId,
        name: req.passengerName,
        pickup: req.startLocation,
      },
      ...req.joinedPassengers.map((p) => ({
        id: p.id,
        name: p.name,
        pickup: req.startLocation,
      })),
    ];

    const rideData = {
      driverId,
      driverName: driver.name || "Driver",
      startLocation: req.startLocation,
      endLocation: req.endLocation,
      startLat: req.startLat,
      startLng: req.startLng,
      endLat: req.endLat,
      endLng: req.endLng,
      departureTime: req.departureTime,
      availableSeats: 4,
      carModel: driver.carModel || "Unknown",
      carPlate: driver.carPlate || "N/A",
    };

    const newRide = this.offerRide(rideData);

    const rides = this.getRides();
    const rideIdx = rides.findIndex((r) => r.id === newRide.id);
    if (rideIdx !== -1) {
      rides[rideIdx].passengers = allPassengers;
      rides[rideIdx].bookedSeats = allPassengers.length;
      rides[rideIdx].fromRequest = requestId;
      localStorage.setItem("smartride_rides", JSON.stringify(rides));
    }

    this.addNotification(
      req.passengerId,
      ` ${driver.name} (${driver.carModel || ""} - ${driver.carPlate || ""}) was accept your "${req.startLocation} → ${req.endLocation}" ride request`,
      "accepted",
    );

    req.joinedPassengers.forEach((p) => {
      this.addNotification(
        p.id,
        ` ${driver.name} (${driver.carModel || ""} - ${driver.carPlate || ""}) was accepted "${req.startLocation} → ${req.endLocation}" your ride request`,
        "accepted",
      );
    });

    return { request: req, ride: newRide };
  }

  rejectRideRequest(requestId, driverId) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx === -1) throw new Error("Cannot find Ride Request");

    if (!requests[idx].rejectedByDrivers) requests[idx].rejectedByDrivers = [];
    if (!requests[idx].rejectedByDrivers.includes(driverId)) {
      requests[idx].rejectedByDrivers.push(driverId);
    }
    localStorage.setItem("smartride_ride_requests", JSON.stringify(requests));
    return requests[idx];
  }

  cancelRideRequest(requestId, passengerId) {
    const requests = this.getRideRequests();
    const idx = requests.findIndex((r) => r.id === requestId);
    if (idx === -1) throw new Error(" Cannot find Ride Request");

    const req = requests[idx];
    if (req.passengerId !== passengerId)
      throw new Error("Cannot cancel this request");
    if (req.status !== "pending") throw new Error("Cannot cancel this request");
    if (req.status === "accepted")
      throw new Error("Since driver accepted , cannot cancel this request");

    const departureDate = new Date(req.departureTime);
    const now = new Date();
    const hoursUntilDeparture = (departureDate - now) / (1000 * 60 * 60);
    if (hoursUntilDeparture < 3) {
      throw new Error(
        ` Departure Time ${Math.round(hoursUntilDeparture * 10) / 10} Cannot cancel because departure time is too close! (U can cancle before 3 hours left)`,
      );
    }

    const allToRefund = req.priceBreakdown || [];
    let totalRefunded = 0;
    allToRefund.forEach((bd) => {
      const refund = bd.paidAmount || bd.price || 0;
      if (refund > 0) {
        this.updateBalance(
          bd.passengerId,
          refund,
          ` Request cancel refund: ${req.startLocation} → ${req.endLocation}`,
        );
        totalRefunded += refund;
      }
    });

    req.status = "cancelled";
    req.cancelledAt = new Date().toISOString();
    req.totalRefunded = totalRefunded;
    localStorage.setItem("smartride_ride_requests", JSON.stringify(requests));

    req.joinedPassengers.forEach((p) => {
      const pBD = allToRefund.find((b) => b.passengerId === p.id);
      const pRefund = pBD ? pBD.paidAmount || pBD.price || 0 : 0;
      this.addNotification(
        p.id,
        `"${req.startLocation} → ${req.endLocation}" Request cancelled ${pRefund > 0 ? pRefund.toLocaleString() + " Kyats Refund" : ""}`,
        "refund",
      );
    });

    return req;
  }

  getPendingRequestsForDriver(driverId) {
    const requests = this.getRideRequests();
    const now = new Date();
    return requests
      .filter((r) => {
        if (r.status !== "pending") return false;

        if (new Date(r.departureTime) < now) return false;

        if (r.rejectedByDrivers && r.rejectedByDrivers.includes(driverId))
          return false;
        return true;
      })
      .sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));
  }

  getRideRequestsByPassenger(passengerId) {
    return this.getRideRequests().filter(
      (r) =>
        r.passengerId === passengerId ||
        r.joinedPassengers.some((p) => p.id === passengerId),
    );
  }

  getActivePendingRequests() {
    const now = new Date();
    return this.getRideRequests()
      .filter((r) => {
        if (r.status !== "pending") return false;
        if (new Date(r.departureTime) < now) return false;
        return true;
      })
      .sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));
  }
}

export const db = new DatabaseManager();
