/**
 * Demo seed — port of the old app's localStorage seed
 * (~/workspace/smart-ride-inspect/src/js/database.js).
 *
 * Users are created THROUGH Better Auth (auth.api.signUpEmail) so passwords
 * are properly hashed — never hand-rolled, never plaintext. Opening balances
 * are COMPLETED wallet_transactions of type 'topup', so the ledger sum
 * equals the old balance. No mutable balance column exists anywhere.
 *
 * Idempotent-ish: existing demo emails are skipped, opening top-ups are
 * only inserted once per user, driver rows only once, and rides are only
 * seeded when the rides table is empty.
 *
 * C1: the demo password is NOT hardcoded anymore. Set DEMO_PASSWORD in the
 * environment before running (e.g. `DEMO_PASSWORD=<secret> npm run db:seed`).
 * When it is unset the whole demo seed is skipped — demo users AND the
 * sample rides that depend on them — so a run against production can never
 * recreate accounts with a publicly known password.
 *
 * Run: npm run db:seed
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

// NOTE: src modules are imported dynamically inside main() — static imports
// are hoisted and would evaluate src/db + src/lib/auth BEFORE the .env.local
// loading below runs (tsx does not load .env files itself).
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const OPENING_BALANCE_DESCRIPTION = "Opening balance (demo seed)";

// --- Demo users (old database.js lines 47-170) ------------------------------
type DemoUser = {
  oldId: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  userType: "passenger" | "driver";
  carModel?: string;
  carPlate?: string;
};

const DEMO_USERS: DemoUser[] = [
  {
    oldId: "u-1",
    name: "Demo Passenger",
    email: "passenger@demo.com",
    phone: "09123456789",
    balance: 50000,
    userType: "passenger",
  },
  {
    oldId: "u-2",
    name: "ဦးလှမောင်",
    email: "driver@demo.com",
    phone: "09987654321",
    balance: 150000,
    userType: "driver",
    carModel: "Toyota Probox",
    carPlate: "YGN 3Q/1122",
  },
  {
    oldId: "u-3",
    name: "ကိုကျော်စွာ",
    email: "kyawswa@smartride.mm",
    phone: "09456789123",
    balance: 80000,
    userType: "driver",
    carModel: "Honda Shuttle",
    carPlate: "YGN 2P/5566",
  },
  {
    oldId: "u-4",
    name: "ဒေါ်အေးအေး",
    email: "ayeaye@smartride.mm",
    phone: "09321654987",
    balance: 120000,
    userType: "driver",
    carModel: "Suzuki Ertiga",
    carPlate: "YGN 5R/9988",
  },
  {
    oldId: "u-5",
    name: "မောင်ဇော်ဇော်",
    email: "zawzaw@smartride.com",
    phone: "09789456123",
    balance: 35000,
    userType: "passenger",
  },
  {
    oldId: "u-6",
    name: "မမေဇင်",
    email: "maysin@smartride.mm",
    phone: "09654321789",
    balance: 42000,
    userType: "passenger",
  },
  {
    oldId: "u-7",
    name: "ကိုသန့်ဇင်",
    email: "thantzin@smartride.mm",
    phone: "09112233445",
    balance: 60000,
    userType: "passenger",
  },
  {
    oldId: "u-8",
    name: "ကိုမင်းမင်း",
    email: "minmin@smartride.mm",
    phone: "09556677889",
    balance: 95000,
    userType: "driver",
    carModel: "Toyota Aqua",
    carPlate: "YGN 7T/3344",
  },
  {
    oldId: "u-9",
    name: "မခင်ခင်",
    email: "khinkhin@smartride.mm",
    phone: "09887766554",
    balance: 28000,
    userType: "passenger",
  },
  {
    oldId: "u-10",
    name: "ဦးထွန်းထွန်း",
    email: "htunhtun@smartride.mm",
    phone: "09334455667",
    balance: 110000,
    userType: "driver",
    carModel: "Honda Fit",
    carPlate: "YGN 1M/7788",
  },
];

// --- Sample rides (old database.js lines 170-560) ---------------------------
// departureTime is stored as [hours, minutes] and resolved to today at that
// time (tomorrow if the time already passed), exactly like the old setTime().
type SeedRide = {
  driverOldId: string;
  startLocation: string;
  endLocation: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  departure: [number, number];
  carModel: string;
  carPlate: string;
  passengerOldIds: string[];
};

const SEED_RIDES: SeedRide[] = [
  {
    driverOldId: "u-2",
    startLocation: "Thanlyin (သန်လျင်)",
    endLocation: "Bahan (ဗဟန်း)",
    startLat: 16.7784,
    startLng: 96.2504,
    endLat: 16.8275,
    endLng: 96.1623,
    departure: [8, 30],
    carModel: "Toyota Probox",
    carPlate: "YGN 3Q/1122",
    passengerOldIds: ["u-5"],
  },
  {
    driverOldId: "u-3",
    startLocation: "Hledan (လှည်းတန်း)",
    endLocation: "Sule (ဆူးလေ)",
    startLat: 16.8737,
    startLng: 96.1317,
    endLat: 16.7747,
    endLng: 96.1561,
    departure: [9, 0],
    carModel: "Honda Shuttle",
    carPlate: "YGN 2P/5566",
    passengerOldIds: ["u-6", "u-7"],
  },
  {
    driverOldId: "u-4",
    startLocation: "Thanlyin Star City",
    endLocation: "Hledan Centre",
    startLat: 16.7634,
    startLng: 96.2812,
    endLat: 16.8737,
    endLng: 96.1317,
    departure: [7, 45],
    carModel: "Suzuki Ertiga",
    carPlate: "YGN 5R/9988",
    passengerOldIds: ["u-6", "u-9"],
  },
  {
    driverOldId: "u-8",
    startLocation: "North Dagon (မြောက်ဒဂုံ)",
    endLocation: "Botahtaung (ဗိုလ်တထောင်)",
    startLat: 16.9208,
    startLng: 96.2011,
    endLat: 16.7793,
    endLng: 96.1681,
    departure: [8, 0],
    carModel: "Toyota Aqua",
    carPlate: "YGN 7T/3344",
    passengerOldIds: ["u-9"],
  },
  {
    driverOldId: "u-10",
    startLocation: "Insein (အင်းစိန်)",
    endLocation: "Kamayut (ကမာရွတ်)",
    startLat: 16.9726,
    startLng: 96.1042,
    endLat: 16.8532,
    endLng: 96.117,
    departure: [8, 15],
    carModel: "Honda Fit",
    carPlate: "YGN 1M/7788",
    passengerOldIds: ["u-5", "u-6"],
  },
  {
    driverOldId: "u-2",
    startLocation: "South Okkalapa (တောင်ဥက္ကလာပ)",
    endLocation: "Sanchaung (စမ်းချောင်း)",
    startLat: 16.8493,
    startLng: 96.2176,
    endLat: 16.8392,
    endLng: 96.1226,
    departure: [9, 30],
    carModel: "Toyota Probox",
    carPlate: "YGN 3Q/1122",
    passengerOldIds: ["u-7"],
  },
  {
    driverOldId: "u-3",
    startLocation: "Mingalardon (မင်္ဂလာဒုံ)",
    endLocation: "Downtown (ဗဟန်း/လမ်းမတော်)",
    startLat: 17.0473,
    startLng: 96.1201,
    endLat: 16.7951,
    endLng: 96.1484,
    departure: [7, 30],
    carModel: "Honda Shuttle",
    carPlate: "YGN 2P/5566",
    passengerOldIds: [],
  },
  {
    driverOldId: "u-4",
    startLocation: "Thaketa (သာကေတ)",
    endLocation: "Tamwe (တာမွေ)",
    startLat: 16.8198,
    startLng: 96.2268,
    endLat: 16.8333,
    endLng: 96.1649,
    departure: [8, 45],
    carModel: "Suzuki Ertiga",
    carPlate: "YGN 5R/9988",
    passengerOldIds: ["u-9"],
  },
  {
    driverOldId: "u-8",
    startLocation: "Dagon Myothit (ဒဂုံမြို့သစ်)",
    endLocation: "Yankin (ရန်ကင်း)",
    startLat: 16.8705,
    startLng: 96.2433,
    endLat: 16.8438,
    endLng: 96.1783,
    departure: [8, 30],
    carModel: "Toyota Aqua",
    carPlate: "YGN 7T/3344",
    passengerOldIds: ["u-5", "u-6"],
  },
  {
    driverOldId: "u-10",
    startLocation: "Shwepyithar (ရွှေပြည်သာ)",
    endLocation: "Sule (ဆူးလေ)",
    startLat: 17.0631,
    startLng: 96.0526,
    endLat: 16.7747,
    endLng: 96.1561,
    departure: [7, 0],
    carModel: "Honda Fit",
    carPlate: "YGN 1M/7788",
    passengerOldIds: ["u-7"],
  },
];

/** Today at HH:MM; tomorrow if that time already passed (old setTime). */
function setTime(hours: number, minutes: number): Date {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

async function main() {
  // C1: never seed demo accounts without an explicit password. The sample
  // rides depend on the demo users (drivers + passengers), so they are
  // skipped too when the demo users are skipped.
  if (!DEMO_PASSWORD) {
    console.log(
      "DEMO_PASSWORD is not set — skipping demo-user + sample-ride seed " +
        "(set DEMO_PASSWORD in the environment to seed demo accounts)",
    );
    return;
  }

  // Dynamic imports AFTER .env.local is loaded (see note at top of file).
  const { db } = await import("../src/db");
  const { bookings, drivers, rides, user, walletTransactions } =
    await import("../src/db/schema");
  const { auth } = await import("../src/lib/auth");
  const { APP_TAX_RATE, DEFAULT_PRICE, routeMatcher } =
    await import("../src/lib/matching");

  async function findUserByEmail(email: string) {
    const rows = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  // (1) Demo users through Better Auth + opening-balance ledger rows.
  const userIdByOldId = new Map<string, string>();
  let usersCreated = 0;
  let topupsCreated = 0;

  for (const demo of DEMO_USERS) {
    let row = await findUserByEmail(demo.email);
    if (!row) {
      await auth.api.signUpEmail({
        body: { email: demo.email, password: DEMO_PASSWORD, name: demo.name },
        headers: new Headers(),
      });
      row = await findUserByEmail(demo.email);
      if (!row) throw new Error(`signUpEmail did not create ${demo.email}`);
      usersCreated++;
    }
    userIdByOldId.set(demo.oldId, row.id);

    // Phone + user_type (Better Auth sign-up does not set these).
    await db
      .update(user)
      .set({ phone: demo.phone, user_type: demo.userType })
      .where(eq(user.id, row.id));

    // Opening balance as a completed top-up (idempotent per user).
    const existingTopups = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, row.id));
    const hasOpening = existingTopups.some(
      (t) =>
        t.type === "topup" && t.description === OPENING_BALANCE_DESCRIPTION,
    );
    if (!hasOpening) {
      await db.insert(walletTransactions).values({
        userId: row.id,
        type: "topup",
        amount: demo.balance,
        description: OPENING_BALANCE_DESCRIPTION,
        status: "completed",
      });
      topupsCreated++;
    }
  }
  console.log(`users: ${usersCreated} created, ${DEMO_USERS.length - usersCreated} already existed`);
  console.log(`opening top-ups: ${topupsCreated} inserted`);

  // (2) Driver rows for the driver users.
  let driversCreated = 0;
  for (const demo of DEMO_USERS.filter((u) => u.userType === "driver")) {
    const userId = userIdByOldId.get(demo.oldId)!;
    const existing = await db
      .select()
      .from(drivers)
      .where(eq(drivers.userId, userId))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(drivers).values({
        userId,
        carModel: demo.carModel,
        carPlate: demo.carPlate,
        verified: false,
      });
      driversCreated++;
    }
  }
  console.log(`drivers: ${driversCreated} created`);

  // (3) Sample rides + bookings + matching ledger rows.
  const existingRides = await db.select({ id: rides.id }).from(rides).limit(1);
  if (existingRides.length > 0) {
    console.log("rides: table non-empty, skipping ride seed");
    return;
  }

  let ridesCreated = 0;
  let bookingsCreated = 0;
  let ledgerCreated = 0;

  for (const seed of SEED_RIDES) {
    const driverId = userIdByOldId.get(seed.driverOldId);
    if (!driverId) {
      console.log(`skip ride ${seed.startLocation} → ${seed.endLocation}: driver not seeded`);
      continue;
    }
    const priced = routeMatcher.calculatePriceFromCoords(
      seed.startLat,
      seed.startLng,
      seed.endLat,
      seed.endLng,
    );
    const price = priced ? priced.price : DEFAULT_PRICE;
    const distanceKm = priced ? priced.distanceKm : 0;

    const [ride] = await db
      .insert(rides)
      .values({
        driverId,
        startLabel: seed.startLocation,
        startLat: seed.startLat,
        startLng: seed.startLng,
        endLabel: seed.endLocation,
        endLat: seed.endLat,
        endLng: seed.endLng,
        departureTime: setTime(seed.departure[0], seed.departure[1]),
        seatsTotal: 4,
        seatsAvailable: 4 - seed.passengerOldIds.length,
        carModel: seed.carModel,
        carPlate: seed.carPlate,
        status: "open",
        routeCoordinates: null,
        price,
        distanceKm,
      })
      .returning();
    ridesCreated++;

    // First-rider rule: each listed passenger pays the full ride price
    // plus the 5% app fee; the driver earns the fare share.
    for (const passengerOldId of seed.passengerOldIds) {
      const passengerId = userIdByOldId.get(passengerOldId);
      if (!passengerId) {
        console.log(`skip booking: passenger ${passengerOldId} not seeded`);
        continue;
      }
      const fareShare = price;
      const appFee = Math.floor(fareShare * APP_TAX_RATE);
      const totalPrice = fareShare + appFee;

      const [booking] = await db
        .insert(bookings)
        .values({
          rideId: ride.id,
          passengerId,
          seats: 1,
          fareShare,
          appFee,
          totalPrice,
          driverPayment: fareShare,
          paymentMethod: "ewallet",
          status: "confirmed",
        })
        .returning();
      bookingsCreated++;

      await db.insert(walletTransactions).values([
        {
          userId: passengerId,
          type: "ride_payment",
          amount: -totalPrice,
          description: `Ride payment — ${seed.startLocation} to ${seed.endLocation}`,
          referenceId: booking.id,
          status: "completed",
        },
        {
          userId: driverId,
          type: "ride_earning",
          amount: fareShare,
          description: `Ride earning — ${seed.startLocation} to ${seed.endLocation}`,
          referenceId: booking.id,
          status: "completed",
        },
      ]);
      ledgerCreated += 2;
    }
  }
  console.log(`rides: ${ridesCreated} created`);
  console.log(`bookings: ${bookingsCreated} created`);
  console.log(`booking ledger rows: ${ledgerCreated} inserted`);
}

main().catch((err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
