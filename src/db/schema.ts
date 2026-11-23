import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth tables (standard better-auth + drizzle-adapter shape).
// Table names must stay exactly `user`, `session`, `account`, `verification`.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // Smart Ride extensions
  phone: text("phone").unique(),
  user_type: text("user_type").notNull().default("passenger"),
  // D2: admin flag. Server routes must check this row (see requireAdmin
  // in src/lib/api-helpers) — never trust a client-sent value.
  // NOTE: the property name MUST be `is_admin` (snake_case, like the
  // sibling `user_type` key), not camelCase `isAdmin`: Better Auth's
  // additionalFields key is `is_admin` (see src/lib/auth.ts) and its
  // drizzle-adapter schema check looks the field up by that name in
  // this table object. With `isAdmin` here the check failed with
  // "Missing columns: user.is_admin" and EVERY authed route 500'd in
  // local dev (found 2026-11-23 while smoke-testing Batch 5c — the
  // failure predates this batch; the DB column was always `is_admin`).
  is_admin: boolean("is_admin").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ---------------------------------------------------------------------------
// Smart Ride tables. All use uuid PKs. No mutable balance column anywhere —
// a user's balance is always sum(wallet_transactions.amount where
// status = 'completed').
// ---------------------------------------------------------------------------

export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  licenseNumber: text("license_number"),
  nrcNumber: text("nrc_number"),
  carModel: text("car_model"),
  carPlate: text("car_plate"),
  carColor: text("car_color"),
  carYear: integer("car_year"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rides = pgTable("rides", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: text("driver_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  startLabel: text("start_label").notNull(),
  startLat: doublePrecision("start_lat").notNull(),
  startLng: doublePrecision("start_lng").notNull(),
  endLabel: text("end_label").notNull(),
  endLat: doublePrecision("end_lat").notNull(),
  endLng: doublePrecision("end_lng").notNull(),
  departureTime: timestamp("departure_time").notNull(),
  seatsTotal: integer("seats_total").notNull(),
  seatsAvailable: integer("seats_available").notNull(),
  carModel: text("car_model"),
  carPlate: text("car_plate"),
  status: text("status").notNull().default("open"),
  // D4 — live trip tracking. tripStatus is the in-trip state
  // (scheduled -> started -> arrived); status above still says
  // whether the ride exists (open/full/completed/cancelled).
  // driverLat/driverLng/driverLocationAt hold the driver's LATEST
  // position while a trip is started (posted ~every 10s) — no
  // history table: the live view only ever needs the latest point.
  tripStatus: text("trip_status").notNull().default("scheduled"),
  driverLat: doublePrecision("driver_lat"),
  driverLng: doublePrecision("driver_lng"),
  driverLocationAt: timestamp("driver_location_at"),
  routeCoordinates: jsonb("route_coordinates").$type<Array<[number, number]>>(),
  price: integer("price").notNull(),
  distanceKm: doublePrecision("distance_km"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // C5: search filters by driver + status; the find-ride list filters by
  // status + seats + departure time.
  index("rides_driver_id_idx").on(t.driverId),
  index("rides_status_idx").on(t.status),
]);

export const rideRequests = pgTable("ride_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  passengerId: text("passenger_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Creator name/phone snapshot (kept even if the user later edits profile).
  passengerName: text("passenger_name"),
  passengerPhone: text("passenger_phone"),
  startLabel: text("start_label").notNull(),
  startLat: doublePrecision("start_lat").notNull(),
  startLng: doublePrecision("start_lng").notNull(),
  endLabel: text("end_label").notNull(),
  endLat: doublePrecision("end_lat").notNull(),
  endLng: doublePrecision("end_lng").notNull(),
  departureTime: timestamp("departure_time").notNull(),
  status: text("status").notNull().default("open"),
  estimatedPrice: integer("estimated_price"),
  prepaidAmount: integer("prepaid_amount").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // C5: request lists filter by creator + status.
  index("ride_requests_passenger_id_idx").on(t.passengerId),
  index("ride_requests_status_idx").on(t.status),
]);

export const requestPassengers = pgTable("request_passengers", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => rideRequests.id, { onDelete: "cascade" }),
  passengerId: text("passenger_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  startLabel: text("start_label").notNull(),
  startLat: doublePrecision("start_lat").notNull(),
  startLng: doublePrecision("start_lng").notNull(),
  endLabel: text("end_label").notNull(),
  endLat: doublePrecision("end_lat").notNull(),
  endLng: doublePrecision("end_lng").notNull(),
  fareShare: integer("fare_share").notNull(),
  appFee: integer("app_fee").notNull(),
  totalPrice: integer("total_price").notNull(),
  paidAmount: integer("paid_amount").notNull().default(0),
  status: text("status").notNull().default("joined"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (t) => [
  // C5: member lookups are always by request, and "my requests" by user.
  index("request_passengers_request_id_idx").on(t.requestId),
  index("request_passengers_passenger_id_idx").on(t.passengerId),
]);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  rideId: uuid("ride_id")
    .notNull()
    .references(() => rides.id, { onDelete: "cascade" }),
  passengerId: text("passenger_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  seats: integer("seats").notNull().default(1),
  fareShare: integer("fare_share").notNull(),
  appFee: integer("app_fee").notNull(),
  totalPrice: integer("total_price").notNull(),
  driverPayment: integer("driver_payment").notNull(),
  paymentMethod: text("payment_method").notNull().default("ewallet"),
  status: text("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // C5: bookings are looked up by ride (pricing, passenger lists) and
  // by passenger (my-rides), and filtered by status throughout.
  index("bookings_ride_id_idx").on(t.rideId),
  index("bookings_passenger_id_idx").on(t.passengerId),
  index("bookings_status_idx").on(t.status),
  // A3: one passenger can hold at most ONE confirmed booking per ride.
  // Partial index, not a plain unique: a passenger who cancelled may
  // book the same ride again (cancelled rows don't count), and a
  // completed/no-show booking doesn't block a re-book either. The DB
  // enforces this even if two requests race past the route's pre-check.
  uniqueIndex("bookings_ride_passenger_confirmed_unique")
    .on(t.rideId, t.passengerId)
    .where(sql`status = 'confirmed'`),
]);

export const walletTransactions = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  // Signed: top-ups / earnings positive, payments / withdrawals negative.
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  referenceId: text("reference_id"),
  status: text("status").notNull().default("completed"),
  // Manual top-up proof (Feature A, 2026-11-23): the transaction ID
  // the user got from their KBZPay/WavePay app (required on submit)
  // and an optional screenshot of the transfer receipt (base64 data
  // URL, capped at ~1MB — see MAX_PROOF_IMAGE_BASE64_CHARS in
  // src/lib/payment-settings.ts). Admins see both when confirming.
  transactionId: text("transaction_id"),
  proofImageBase64: text("proof_image_base64"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // C5: balance is SUM(amount) per user; history lists filter by user
  // (+ status for pending top-ups).
  index("wallet_transactions_user_id_idx").on(t.userId),
  index("wallet_transactions_status_idx").on(t.status),
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  type: text("type").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // C5: bell + unread count filter by user (+ read flag).
  index("notifications_user_id_idx").on(t.userId),
  index("notifications_read_idx").on(t.read),
]);

export const ratings = pgTable("ratings", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .unique()
    .references(() => bookings.id, { onDelete: "cascade" }),
  rideId: uuid("ride_id")
    .notNull()
    .references(() => rides.id, { onDelete: "cascade" }),
  raterId: text("rater_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  driverId: text("driver_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  stars: integer("stars").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Feature A — manual top-up receiving accounts (2026-11-23).
//
// The app has no payment gateway: a user sends money from their own
// KBZPay/WavePay app to one of the app's receiving accounts, then
// submits the transaction ID (+ optional screenshot) for an admin to
// confirm. One row per provider (unique provider); an admin configures
// the account number + name in /admin — NOTHING is hardcoded or
// seeded, so until an admin saves a row the provider shows as
// unavailable in the top-up flow. `enabled` lets an admin temporarily
// take a provider offline without deleting its details.
// ---------------------------------------------------------------------------

export const paymentSettings = pgTable("payment_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().unique(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Driver rejections of ride requests (added by the API-routes agent).
// A row here means "this driver skipped this request": the request stays
// open for other drivers but is hidden from this driver (driver dashboard
// + GET /api/ride-requests?pending=1). There is no rejected_by column on
// ride_requests.
// ---------------------------------------------------------------------------

export const requestRejections = pgTable("request_rejections", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => rideRequests.id, { onDelete: "cascade" }),
  driverId: text("driver_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// A3 — idempotency keys for book / withdraw.
//
// A retried request (double-tap, flaky network, impatient refresh) sends
// the same key; the server then returns the stored response instead of
// charging / booking a second time. One row per (user, key):
//   - a row with response_status NULL means the first attempt is still
//     in flight — a concurrent duplicate gets 409, not a second charge.
//   - a row with a stored response means "done": the stored
//     { status, body } is replayed verbatim.
//   - non-2xx outcomes are NOT stored: the key row is deleted so the
//     client can retry cleanly (nothing moved, so a retry is safe).
// Keys are client-generated UUIDs, scoped to the user (never shared
// across users), and the endpoint is recorded for audit. Old rows are
// harmless leftovers — the key space is per-user UUIDs, so there is no
// cleanup job in v1.
// ---------------------------------------------------------------------------

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  endpoint: text("endpoint").notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("idempotency_keys_user_key_unique").on(t.userId, t.key),
]);
