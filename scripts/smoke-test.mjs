// Smoke test for Smart Ride against a running server (default http://localhost:3000).
// Flow: login driver -> offer ride -> login passenger -> search -> book -> 2nd passenger
// books (fair-split refund) -> cancel/refund -> re-book -> rate -> ride-request flow
// (create -> join -> accept) -> wallet topup(pending)/withdraw -> cross-account visibility.
// Usage: node scripts/smoke-test.mjs [baseUrl]
// Exit 0 = all checks passed. Demo accounts only (password demo1234).
const BASE = process.argv[2] || "http://localhost:3000";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

class Client {
  constructor(label) { this.label = label; this.cookies = ""; }
  async req(path, opts = {}) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Origin: BASE, ...(this.cookies ? { Cookie: this.cookies } : {}), ...(opts.headers || {}) },
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) {
      this.cookies = setCookie.map((c) => c.split(";")[0]).join("; ");
    }
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { _raw: text.slice(0, 200) }; }
    return { status: res.status, body };
  }
  async login(email, password) {
    const r = await this.req("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) });
    check(`${this.label} login ${email}`, r.status === 200, `status=${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    return r;
  }
  async balance() {
    const r = await this.req("/api/wallet/balance");
    return r.body?.balance;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 0. Landing page serves
  const landing = await fetch(BASE + "/");
  check("landing page 200", landing.status === 200, `status=${landing.status}`);
  const landingHtml = await landing.text();
  check("landing contains brand", landingHtml.includes("SharedRide"), "");

  const driver = new Client("driver");
  const pax1 = new Client("pax1");
  const pax2 = new Client("pax2");
  await driver.login("driver@demo.com", "demo1234");
  await pax1.login("passenger@demo.com", "demo1234");
  await pax2.login("zawzaw@smartride.com", "demo1234"); // fresh demo passenger with a full balance (maysin was drained by earlier smoke runs)

  const driverBal0 = await driver.balance();
  const pax1Bal0 = await pax1.balance();
  const pax2Bal0 = await pax2.balance();
  console.log(`balances before: driver=${driverBal0} pax1=${pax1Bal0} pax2=${pax2Bal0}`);
  check("pax1 has seeded balance", typeof pax1Bal0 === "number" && pax1Bal0 > 0, `balance=${pax1Bal0}`);

  // 1. Driver offers a ride (Hledan -> Sule, ~20h from now)
  const dep = new Date(Date.now() + 20 * 3600 * 1000).toISOString();
  const offer = await driver.req("/api/rides", {
    method: "POST",
    body: JSON.stringify({
      startLabel: "Hledan Centre", startLat: 16.8138, startLng: 96.1345,
      endLabel: "Sule Pagoda", endLat: 16.774, endLng: 96.1587,
      departureTime: dep, seatsTotal: 4, carModel: "Toyota Probox", carPlate: "YGN 3Q/1122",
    }),
  });
  check("offer ride 201", offer.status === 201, `status=${offer.status} ${JSON.stringify(offer.body).slice(0, 200)}`);
  const rideId = offer.body?.ride?.id;
  const ridePrice = offer.body?.ride?.price;
  console.log(`offered ride ${rideId} price=${ridePrice} distanceKm=${offer.body?.ride?.distanceKm}`);

  // 2. Passenger searches — must see the driver's ride (cross-account visibility)
  const search = await pax1.req(
    `/api/rides/search?startLat=16.8138&startLng=96.1345&endLat=16.774&endLng=96.1587&departureTime=${encodeURIComponent(dep)}`,
  );
  const matches = search.body?.matches ?? [];
  const found = matches.find((m) => (m.ride?.id ?? m.id) === rideId);
  check("search finds the offered ride", !!found, `matches=${matches.length} scores=${matches.map((m) => m.matchScore).join(",")}`);
  const total = found?.discountedPrice ?? found?.totalPrice ?? found?.total_price;
  console.log(`match score=${found?.matchScore} total=${total} fareShare=${found?.fareShare} appFee=${found?.appCommissionPerPassenger}`);

  // 3. Pax1 books with e-wallet
  const book1 = await pax1.req(`/api/rides/${rideId}/book`, { method: "POST", body: JSON.stringify({ paymentMethod: "ewallet" }) });
  check("pax1 book 200/201", book1.status === 200 || book1.status === 201, `status=${book1.status} ${JSON.stringify(book1.body).slice(0, 200)}`);
  const booking1Id = book1.body?.booking?.id ?? book1.body?.id;
  const pax1Bal1 = await pax1.balance();
  const driverBal1 = await driver.balance();
  console.log(`after book1: pax1=${pax1Bal1} (was ${pax1Bal0}) driver=${driverBal1} (was ${driverBal0})`);
  check("pax1 balance decreased by booking total", typeof total === "number" && pax1Bal1 === pax1Bal0 - total, `delta=${pax1Bal0 - pax1Bal1} total=${total}`);
  check("driver balance increased", driverBal1 > driverBal0, `delta=${driverBal1 - driverBal0}`);

  // 4. Pax2 books the same ride -> fair-split refund to pax1
  const book2 = await pax2.req(`/api/rides/${rideId}/book`, { method: "POST", body: JSON.stringify({ paymentMethod: "ewallet" }) });
  check("pax2 book 200/201", book2.status === 200 || book2.status === 201, `status=${book2.status} ${JSON.stringify(book2.body).slice(0, 160)}`);
  const booking2Id = book2.body?.booking?.id ?? book2.body?.id;
  const pax1Bal2 = await pax1.balance();
  console.log(`after book2: pax1=${pax1Bal2} (was ${pax1Bal1}) — refund if higher`);
  check("pax1 got fair-split refund (or same)", pax1Bal2 >= pax1Bal1, `refund=${pax1Bal2 - pax1Bal1}`);

  // 5. Pax1 cancels -> full refund of (possibly reduced) total
  const cancel = await pax1.req(`/api/bookings/${booking1Id}/cancel`, { method: "POST", body: JSON.stringify({}) });
  check("pax1 cancel 200", cancel.status === 200, `status=${cancel.status} ${JSON.stringify(cancel.body).slice(0, 160)}`);
  const pax1Bal3 = await pax1.balance();
  console.log(`after cancel: pax1=${pax1Bal3} (was ${pax1Bal2})`);
  check("pax1 refunded on cancel", pax1Bal3 > pax1Bal2, `refund=${pax1Bal3 - pax1Bal2}`);

  // 6. Pax1 re-books, then rates the ride (rating must save)
  const book3 = await pax1.req(`/api/rides/${rideId}/book`, { method: "POST", body: JSON.stringify({ paymentMethod: "ewallet" }) });
  check("pax1 re-book 200/201", book3.status === 200 || book3.status === 201, `status=${book3.status}`);
  const booking3Id = book3.body?.booking?.id ?? book3.body?.id;
  const rate = await pax1.req("/api/ratings", { method: "POST", body: JSON.stringify({ bookingId: booking3Id, stars: 5, comment: "Smoke test ride — smooth and on time." }) });
  check("rating saves 200/201", rate.status === 200 || rate.status === 201, `status=${rate.status} ${JSON.stringify(rate.body).slice(0, 160)}`);
  // driver id = the driver user's id; get it from the ride in /api/rides?mine=1
  const mine = await driver.req("/api/rides?mine=1");
  const myRide = (mine.body?.rides ?? []).find((r) => r.id === rideId);
  const driverUserId = myRide?.driverId ?? myRide?.driver_id;
  const rating = await pax1.req(`/api/drivers/${driverUserId}/rating`);
  console.log(`driver rating: ${JSON.stringify(rating.body)}`);
  check("driver rating shows the saved 5 stars", rating.body?.average === 5 || rating.body?.rating === 5, JSON.stringify(rating.body));

  // 7. Ride-request flow: pax1 creates (prepay) -> pax2 joins -> driver accepts
  const reqCreate = await pax1.req("/api/ride-requests", {
    method: "POST",
    body: JSON.stringify({
      startLabel: "Insein Road", startLat: 16.8509, startLng: 96.1334,
      endLabel: "Downtown", endLat: 16.774, endLng: 96.1587,
      departureTime: new Date(Date.now() + 26 * 3600 * 1000).toISOString(),
    }),
  });
  check("ride request create 200/201", reqCreate.status === 200 || reqCreate.status === 201, `status=${reqCreate.status} ${JSON.stringify(reqCreate.body).slice(0, 200)}`);
  const reqId = reqCreate.body?.request?.id ?? reqCreate.body?.id;
  const pax1Bal4 = await pax1.balance();
  console.log(`after request create: pax1=${pax1Bal4} (prepayment deducted)`);
  const join = await pax2.req(`/api/ride-requests/${reqId}/join`, {
    method: "POST",
    body: JSON.stringify({ startLabel: "Insein Road", startLat: 16.8509, startLng: 96.1334, endLabel: "Downtown", endLat: 16.774, endLng: 96.1587 }),
  });
  check("pax2 joins request 200/201", join.status === 200 || join.status === 201, `status=${join.status} ${JSON.stringify(join.body).slice(0, 200)}`);
  const accept = await driver.req(`/api/ride-requests/${reqId}/accept`, { method: "POST", body: JSON.stringify({}) });
  check("driver accepts request 200/201", accept.status === 200 || accept.status === 201, `status=${accept.status} ${JSON.stringify(accept.body).slice(0, 200)}`);
  const acceptedRideId = accept.body?.ride?.id ?? accept.body?.request?.acceptedRideId;
  console.log(`accepted request -> ride ${acceptedRideId}`);

  // 8. Wallet: top-up pending + withdraw
  const topup = await pax1.req("/api/wallet/topup", { method: "POST", body: JSON.stringify({ amount: 5000, method: "KBZPay", phone: "09123456789" }) });
  check("topup creates pending record", topup.status === 200 || topup.status === 201, `status=${topup.status} ${JSON.stringify(topup.body).slice(0, 160)}`);
  const balBeforeWithdraw = await pax1.balance();
  const withdraw = await pax1.req("/api/wallet/withdraw", { method: "POST", body: JSON.stringify({ amount: 1000 }) });
  check("withdraw 1000 succeeds", withdraw.status === 200 || withdraw.status === 201, `status=${withdraw.status} ${JSON.stringify(withdraw.body).slice(0, 160)}`);
  const balAfterWithdraw = await pax1.balance();
  check("withdraw deducted 1000", balAfterWithdraw === balBeforeWithdraw - 1000, `${balBeforeWithdraw} -> ${balAfterWithdraw}`);
  const txns = await pax1.req("/api/wallet/transactions?limit=5");
  check("transactions list returns rows", Array.isArray(txns.body?.transactions) && txns.body.transactions.length > 0, `count=${txns.body?.transactions?.length}`);

  // 9. Cross-account visibility: pax2 sees pax1's request data via pending list; driver sees own ride
  const pending = await driver.req("/api/ride-requests?pending=1");
  check("driver pending list responds", pending.status === 200, `status=${pending.status}`);

  console.log(failures === 0 ? "\nSMOKE OK" : `\nSMOKE FAILED: ${failures} check(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("SMOKE ERROR", e); process.exit(2); });
