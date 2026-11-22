import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
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
  routeCoordinates: jsonb("route_coordinates").$type<Array<[number, number]>>(),
  price: integer("price").notNull(),
  distanceKm: doublePrecision("distance_km"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
});

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
});

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
});

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  type: text("type").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
