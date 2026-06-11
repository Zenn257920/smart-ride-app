//LocalStorage & Gemini

class DatabaseManager {
  constructor() {
    this.initDatabase();
    //GeminiKey
    this.apiKey = "AIzaSyAQ-Ab8RN6ICmmw0YVmfI0xeyC78lLvzCO";
    //Price constants
    this.DRIVER_BONUS_RATE = 0.1;
    this.APP_COMMISSION_RATE = 0.05;
  }

  initDatabase() {
    if (!localStorage.getItem("smartride_users")) {
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

      // Helper to create timestamps
      const tomorrow = new Date(Date.now() + 86400000);
      const setTime = (hours, minutes) => {
        const d = new Date(tomorrow);
        d.setHours(hours, minutes, 0, 0);
        return d.toISOString();
      };

      //  Sample Rides — Covering major Yangon routes
      const sampleRides = [
        {
          id: "ride-101",
          driverId: "u-2",
          driverName: "ဦးလှမောင်",
          startLocation: "Thanlyin (သန်လျင်)",
          endLocation: "Bahan (ဗဟန်း)",
          departureTime: setTime(8, 30),
          availableSeats: 4,
          bookedSeats: 1,
          price: 7500,
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
          departureTime: setTime(9, 0),
          availableSeats: 4,
          bookedSeats: 2,
          price: 6000,
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
          departureTime: setTime(7, 45),
          availableSeats: 4,
          bookedSeats: 2,
          price: 8000,
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
          departureTime: setTime(8, 0),
          availableSeats: 3,
          bookedSeats: 1,
          price: 7000,
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
          departureTime: setTime(8, 15),
          availableSeats: 4,
          bookedSeats: 2,
          price: 5500,
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
          departureTime: setTime(9, 30),
          availableSeats: 4,
          bookedSeats: 1,
          price: 6500,
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
          departureTime: setTime(7, 30),
          availableSeats: 3,
          bookedSeats: 0,
          price: 9000,
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
          departureTime: setTime(8, 45),
          availableSeats: 4,
          bookedSeats: 1,
          price: 5000,
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
          departureTime: setTime(8, 30),
          availableSeats: 3,
          bookedSeats: 2,
          price: 6000,
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
          departureTime: setTime(7, 0),
          availableSeats: 4,
          bookedSeats: 1,
          price: 10000,
          carModel: "Honda Fit",
          carPlate: "YGN 1M/7788",
          passengers: [
            { id: "u-7", name: "ကိုသန့်ဇင်", pickup: "Shwepyithar Junction" },
          ],
        },
      ];

      localStorage.setItem("smartride_users", JSON.stringify(sampleUsers));
      localStorage.setItem("smartride_rides", JSON.stringify(sampleRides));
      localStorage.setItem("smartride_bookings", JSON.stringify([]));
      localStorage.setItem("smartride_transactions", JSON.stringify([]));
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
      (u) =>
        (u.email === id || u.phone === id) && u.password === password,
    );
    if (!user)
      throw new Error("အီးမေးလ် / ဖုန်းနံပါတ် သို့မဟုတ် စကားဝှက် မမှန်ကန်ပါ။");
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
    const newRide = {
      id: "ride-" + Math.random().toString(36).substr(2, 9),
      ...rideData,
      bookedSeats: 0,
      passengers: [],
    };
    rides.push(newRide);
    localStorage.setItem("smartride_rides", JSON.stringify(rides));
    return newRide;
  }

  //Compares User Inputs & Sample Data via JSON
  async searchRidesWithGemini(startLocation, endLocation, departureTime) {
    const availableRides = this.getRides();

    const userInputJSON = {
      passengerRequest: {
        startLocation: startLocation,
        endLocation: endLocation,
        departureTime: departureTime,
      },
    };

    const databaseJSON = {
      availableDriverRides: availableRides,
    };

    const prompt = `
You are the core AI Route Matching Engine for Innovix SmartRide carpooling app in Yangon, Myanmar.

TASK:
Compare the passenger request with the available driver rides database.
Find rides where the start and end locations are geographically close or on the same route.
For example: "သန်လျင်" matches "Thanlyin", "Thanlyin Star City"; "ဗဟန်း" matches "Bahan"; "ဆူးလေ" matches "Sule", "Downtown".
Consider departure time proximity (within 2 hours is acceptable).

PRICING MODEL:
- FIRST RIDER RULE: If bookedSeats is 0, the new passenger is the first rider. First rider pays ONLY the base price (no bonus, no commission). Set discountedPrice = price, fareShare = price, driverBonusPerPassenger = 0, appCommissionPerPassenger = 0, savings = 0.
- SHARED RIDE (bookedSeats >= 1): Each passenger pays: (baseFare / passengerCount) + (baseFare * 0.10 / passengerCount) + 5% app commission
- "discountedPrice" = the total price ONE passenger pays
- "driverEarnings" = baseFare + (baseFare * 0.10) — driver earns 10% bonus (only when shared)
- "appCommission" = 5% of (fareShare + driverBonusShare) per passenger × passengerCount
- "savings" = originalPrice - discountedPrice (how much passenger saves vs riding alone)
- passengerCount = bookedSeats + 1 (existing passengers + the new requesting passenger)

INPUT DATA (JSON):
1. Passenger Request: ${JSON.stringify(userInputJSON)}
2. Available Driver Rides DB: ${JSON.stringify(databaseJSON)}

OUTPUT FORMAT:
Return ONLY a JSON array of matching rides. Each ride object MUST have these exact fields:
- "id": the ride id from database
- "driverId": the driver's user id
- "driverName": driver name (Myanmar/English)
- "startLocation": pickup area
- "endLocation": destination area
- "departureTime": ISO 8601 timestamp
- "availableSeats": total seats
- "bookedSeats": currently booked seats count
- "price": original base price in MMK
- "carModel": vehicle model
- "carPlate": license plate
- "passengers": array of existing passenger objects [{id, name, pickup}]
- "matchScore": integer 0-100 representing route match quality
- "discountedPrice": total price per passenger (fare share + driver bonus share + app commission)
- "fareShare": base fare divided by passenger count
- "driverBonusPerPassenger": driver bonus portion per passenger
- "appCommissionPerPassenger": app commission per passenger
- "driverEarnings": total driver earnings (base + 10% bonus)
- "appCommissionTotal": total app commission from all passengers
- "savings": amount saved vs original price per passenger

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

      // Ensure each result has the required fields with defaults
      return results.map((ride) => {
        const basePrice = ride.price || 7500;
        const isFirstRider = (ride.bookedSeats || 0) === 0;

        // First rider pays standard fare only — no bonus/commission markup
        if (isFirstRider) {
          return {
            id: ride.id || "ride-unknown",
            driverId: ride.driverId || "",
            driverName: ride.driverName || "Unknown Driver",
            startLocation: ride.startLocation || "",
            endLocation: ride.endLocation || "",
            departureTime: ride.departureTime || new Date().toISOString(),
            availableSeats: ride.availableSeats || 4,
            bookedSeats: 0,
            price: basePrice,
            carModel: ride.carModel || "Unknown",
            carPlate: ride.carPlate || "N/A",
            passengers: ride.passengers || [],
            matchScore: ride.matchScore || 70,
            isFirstRider: true,
            discountedPrice: basePrice,
            fareShare: basePrice,
            driverBonusPerPassenger: 0,
            appCommissionPerPassenger: 0,
            driverEarnings: basePrice,
            appCommissionTotal: 0,
            savings: 0,
          };
        }

        // Shared ride pricing — split fare among all passengers
        const totalPassengers = (ride.bookedSeats || 0) + 1;
        const fareShare =
          ride.fareShare || Math.floor(basePrice / totalPassengers);
        const driverBonusTotal = Math.floor(basePrice * this.DRIVER_BONUS_RATE);
        const driverBonusPerPassenger =
          ride.driverBonusPerPassenger ||
          Math.floor(driverBonusTotal / totalPassengers);
        const subtotal = fareShare + driverBonusPerPassenger;
        const appCommissionPerPassenger =
          ride.appCommissionPerPassenger ||
          Math.floor(subtotal * this.APP_COMMISSION_RATE);
        const passengerPrice =
          fareShare + driverBonusPerPassenger + appCommissionPerPassenger;

        return {
          id: ride.id || "ride-unknown",
          driverId: ride.driverId || "",
          driverName: ride.driverName || "Unknown Driver",
          startLocation: ride.startLocation || "",
          endLocation: ride.endLocation || "",
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
          driverBonusPerPassenger: driverBonusPerPassenger,
          appCommissionPerPassenger: appCommissionPerPassenger,
          driverEarnings: ride.driverEarnings || basePrice + driverBonusTotal,
          appCommissionTotal:
            ride.appCommissionTotal ||
            appCommissionPerPassenger * totalPassengers,
          savings: ride.savings || basePrice - passengerPrice,
        };
      });
    } catch (error) {
      console.warn(
        "⚠️ Gemini Engine failed, using local backup matcher:",
        error,
      );

      //  Local Backup Matching — text-based location comparison
      return this._fallbackMatch(
        startLocation,
        endLocation,
        departureTime,
        availableRides,
      );
    }
  }

  //  Fallback local matching when Gemini API is unavailable
  _fallbackMatch(startLocation, endLocation, departureTime, availableRides) {
    const normalize = (str) =>
      str
        .toLowerCase()
        .replace(/[\(\)]/g, "")
        .trim();
    const startNorm = normalize(startLocation);
    const endNorm = normalize(endLocation);

    // Yangon area aliases for smarter local matching
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
        if (aliases.some((alias) => t.includes(alias) || alias.includes(t))) {
          return key;
        }
      }
      return null;
    };

    const startArea = findAreaKey(startLocation);
    const endArea = findAreaKey(endLocation);

    const scored = availableRides
      .map((ride) => {
        let score = 0;
        const rideStartArea = findAreaKey(ride.startLocation);
        const rideEndArea = findAreaKey(ride.endLocation);

        // Start location matching
        if (startArea && rideStartArea && startArea === rideStartArea) {
          score += 45;
        } else if (
          normalize(ride.startLocation).includes(startNorm) ||
          startNorm.includes(normalize(ride.startLocation))
        ) {
          score += 35;
        }

        // End location matching
        if (endArea && rideEndArea && endArea === rideEndArea) {
          score += 45;
        } else if (
          normalize(ride.endLocation).includes(endNorm) ||
          endNorm.includes(normalize(ride.endLocation))
        ) {
          score += 35;
        }

        // Time proximity bonus
        if (departureTime) {
          const userTime = new Date(departureTime).getTime();
          const rideTime = new Date(ride.departureTime).getTime();
          const diffMin = Math.abs(userTime - rideTime) / (1000 * 60);
          if (diffMin <= 30) score += 10;
          else if (diffMin <= 60) score += 5;
        }

        return { ...ride, matchScore: Math.min(score, 98) };
      })
      .filter((r) => r.matchScore > 20)
      .sort((a, b) => b.matchScore - a.matchScore);

    return scored.map((r) => {
      const basePrice = r.price || 7500;
      const isFirstRider = (r.bookedSeats || 0) === 0;

      // First rider pays standard fare — no markup
      if (isFirstRider) {
        return {
          ...r,
          isFirstRider: true,
          discountedPrice: basePrice,
          fareShare: basePrice,
          driverBonusPerPassenger: 0,
          appCommissionPerPassenger: 0,
          driverEarnings: basePrice,
          appCommissionTotal: 0,
          savings: 0,
        };
      }

      // Shared ride pricing
      const totalPassengers = (r.bookedSeats || 0) + 1;
      const fareShare = Math.floor(basePrice / totalPassengers);
      const driverBonusTotal = Math.floor(basePrice * this.DRIVER_BONUS_RATE);
      const driverBonusPerPassenger = Math.floor(
        driverBonusTotal / totalPassengers,
      );
      const subtotal = fareShare + driverBonusPerPassenger;
      const appCommissionPerPassenger = Math.floor(
        subtotal * this.APP_COMMISSION_RATE,
      );
      const passengerPrice = subtotal + appCommissionPerPassenger;
      return {
        ...r,
        isFirstRider: false,
        discountedPrice: passengerPrice,
        fareShare: fareShare,
        driverBonusPerPassenger: driverBonusPerPassenger,
        appCommissionPerPassenger: appCommissionPerPassenger,
        driverEarnings: basePrice + driverBonusTotal,
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
    const basePrice = rides[rideIndex].price || 7500;
    const totalPassengers = rides[rideIndex].bookedSeats;
    const isFirstRider = totalPassengers === 1;

    let fareShare,
      driverBonusPerPassenger,
      appCommissionPerPassenger,
      driverPayment;

    if (isFirstRider) {
      // First rider: standard fare, no bonus markup
      fareShare = basePrice;
      driverBonusPerPassenger = 0;
      appCommissionPerPassenger = 0;
      driverPayment = basePrice; // Driver gets full base fare
    } else {
      // Shared ride: split fare with bonus & commission
      fareShare = Math.floor(basePrice / totalPassengers);
      const driverBonusTotal = Math.floor(basePrice * this.DRIVER_BONUS_RATE);
      driverBonusPerPassenger = Math.floor(driverBonusTotal / totalPassengers);
      const subtotal = fareShare + driverBonusPerPassenger;
      appCommissionPerPassenger = Math.floor(
        subtotal * this.APP_COMMISSION_RATE,
      );
      driverPayment = fareShare + driverBonusPerPassenger;
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
        : `ခရီးစဉ်ခ ${fareShare.toLocaleString()} + Bonus ${driverBonusPerPassenger.toLocaleString()} + ဝန်ဆောင်ခ ${appCommissionPerPassenger.toLocaleString()} ကျပ်`,
      createdAt: new Date().toISOString(),
    });

    // Driver earnings transaction
    if (!isCash && driverIndex !== -1) {
      transactions.push({
        id: "tx-" + Math.random().toString(36).substr(2, 9),
        userId: driverId,
        amount: driverPayment,
        type: "credit",
        description: `ခရီးသည်ခ ${fareShare.toLocaleString()} + Bonus ${driverBonusPerPassenger.toLocaleString()} ကျပ် ရရှိ`,
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

    localStorage.setItem("smartride_rides", JSON.stringify(rides));
    localStorage.setItem("smartride_users", JSON.stringify(users));
    localStorage.setItem("smartride_bookings", JSON.stringify(bookings));
    localStorage.setItem(
      "smartride_transactions",
      JSON.stringify(transactions),
    );
    localStorage.setItem(
      "smartride_currentUser",
      JSON.stringify(users[passengerIndex]),
    );
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
    localStorage.setItem("smartride_currentUser", JSON.stringify(users[index]));
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
}

export const db = new DatabaseManager();
