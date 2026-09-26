import { pathToFileURL } from "node:url";
import { db, migrate, transaction } from "./db.js";
import { generateSecret } from "./totp.js";

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

/** Placeholder ID photo: a head-and-shoulders silhouette with the driver's initials. */
function avatar(name: string, bg: string, fg: string): string {
  const initials = name.split(" ").map((p) => p[0]).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<rect width="256" height="256" fill="${bg}"/>
<circle cx="128" cy="100" r="48" fill="${fg}"/>
<path d="M40 256c0-58 40-92 88-92s88 34 88 92z" fill="${fg}"/>
<rect x="84" y="206" width="88" height="34" rx="8" fill="#ffffff" opacity="0.9"/>
<text x="128" y="231" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="${bg}" text-anchor="middle">${initials}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const WAREHOUSE = "Warehouse 4 - 8 Industrial Pkwy, Brampton, ON";

export function seed({ reset = false } = {}) {
  migrate();
  if (reset) {
    db.exec("DELETE FROM audit_log; DELETE FROM shipments; DELETE FROM truckers; DELETE FROM carriers;");
  }
  const hasData = db.prepare("SELECT COUNT(*) AS n FROM carriers").get() as unknown as { n: number };
  if (hasData.n > 0) return;

  const insertCarrier = db.prepare(
    "INSERT INTO carriers (id, name, phone, cvor_number, cvor_status) VALUES (?, ?, ?, ?, ?)",
  );
  const insertTrucker = db.prepare(
    `INSERT INTO truckers (id, name, phone, email, photo, carrier_id, license_number, vehicle_plate, vehicle_description)
     VALUES (@id, @name, @phone, @email, @photo, @carrier, @license, @plate, @vehicle)`,
  );
  const insertShipment = db.prepare(
    `INSERT INTO shipments (id, reference_code, cargo, pickup_location, dropoff_location, pickup_date, pickup_time,
       status, carrier_id, trucker_id, totp_secret, declined_by, dock_number,
       accepted_at, arrived_at, verified_at, released_at)
     VALUES (@id, @ref, @cargo, @pickup, @dropoff, @date, @time, @status, @carrier, @trucker,
       @secret, @declined, @dock, @accepted, @arrived, @verified, @released)`,
  );

  transaction(() => {
    // All fictional demo data.
    insertCarrier.run("car-1", "Redline Freight Co.", "(905) 555-0134", "123-456-789", "active");
    insertCarrier.run("car-2", "Pacific Crest Hauling", "(416) 555-0188", "234-567-890", "active");
    insertCarrier.run("car-3", "Ironwood Logistics", "(905) 555-0162", "345-678-901", "active");
    // Demo case: a carrier whose registration has lapsed (like the All Days Trucking pattern).
    insertCarrier.run("car-4", "QuickHaul Express", "(647) 555-0199", "456-789-012", "expired");

    const drivers = [
      { id: "trk-1", name: "Marcus Webb", phone: "(905) 555-0117", email: "marcus.webb@redlinefreight.example",
        carrier: "car-1", license: "W1234-56789-01234", plate: "AR48 291",
        vehicle: "White Freightliner Cascadia, 53' dry van", colors: ["#1e3a8a", "#93c5fd"] },
      { id: "trk-2", name: "Dana Ruiz", phone: "(416) 555-0145", email: "dana.ruiz@pacificcrest.example",
        carrier: "car-2", license: "R2345-67890-12345", plate: "BK72 874",
        vehicle: "Blue Kenworth T680, 48' flatbed", colors: ["#7c2d12", "#fdba74"] },
      { id: "trk-3", name: "Ollie Bennett", phone: "(905) 555-0171", email: "ollie.bennett@ironwood.example",
        carrier: "car-3", license: "B3456-78901-23456", plate: "CT19 402",
        vehicle: "Red Peterbilt 579, 53' reefer", colors: ["#14532d", "#86efac"] },
      { id: "trk-4", name: "Sam Keller", phone: "(647) 555-0102", email: "sam.keller@quickhaul.example",
        carrier: "car-4", license: "K4567-89012-34567", plate: "DZ55 610",
        vehicle: "Grey Volvo VNL, 53' dry van", colors: ["#3f3f46", "#d4d4d8"] },
      { id: "trk-5", name: "Priya Nair", phone: "(905) 555-0190", email: "priya.nair@redlinefreight.example",
        carrier: "car-1", license: "N5678-90123-45678", plate: "EF31 557",
        vehicle: "Black International LT, 53' dry van", colors: ["#581c87", "#d8b4fe"] },
    ];
    for (const { colors, ...d } of drivers) {
      insertTrucker.run({ ...d, photo: avatar(d.name, colors[0], colors[1]) });
    }

    const base = { pickup: WAREHOUSE, carrier: null, trucker: null, secret: null, declined: null, dock: null,
      accepted: null, arrived: null, verified: null, released: null };

    // Demo: dispatch to Sam Keller is blocked (QuickHaul's CVOR has expired).
    insertShipment.run({ ...base, id: "shp-1001", ref: "TRU-1001", cargo: "24 pallets of packaged electronics",
      dropoff: "Distribution Centre B - 1450 Innes Rd, Ottawa, ON", date: isoDate(1), time: "08:00",
      status: "unassigned" });

    // Demo: waiting for Marcus to accept or decline.
    insertShipment.run({ ...base, id: "shp-1002", ref: "TRU-1002", cargo: "12 pallets of bottled beverages",
      dropoff: "Regional Hub - 200 Exeter Rd, London, ON", date: isoDate(1), time: "09:30",
      status: "assigned", carrier: "car-1", trucker: "trk-1", secret: generateSecret() });

    // Demo: Dana is at the dock with a live QR pass; scan it from the clerk view.
    insertShipment.run({ ...base, id: "shp-1003", ref: "TRU-1003", cargo: "8 crates of machine parts",
      dropoff: "Assembly Plant - 3500 Rue Notre-Dame, Montreal, QC", date: isoDate(0), time: "13:00",
      status: "at_warehouse", carrier: "car-2", trucker: "trk-2", secret: generateSecret(),
      accepted: minutesAgo(120), arrived: minutesAgo(10) });

    // Demo: Ollie accepted and is on the way; his pass is already live.
    insertShipment.run({ ...base, id: "shp-1004", ref: "TRU-1004", cargo: "16 pallets of frozen produce",
      dropoff: "Cold Storage - 95 Nebo Rd, Hamilton, ON", date: isoDate(0), time: "15:30",
      status: "en_route", carrier: "car-3", trucker: "trk-3", secret: generateSecret(),
      accepted: minutesAgo(45) });

    insertShipment.run({ ...base, id: "shp-1005", ref: "TRU-1005", cargo: "40 pallets of canned goods",
      dropoff: "Retail DC - 1 Cataraqui Woods Dr, Kingston, ON", date: isoDate(0), time: "07:00",
      status: "verified", carrier: "car-1", trucker: "trk-5", dock: "Dock 7",
      accepted: minutesAgo(300), arrived: minutesAgo(200), verified: minutesAgo(190) });

    insertShipment.run({ ...base, id: "shp-1006", ref: "TRU-1006", cargo: "30 rolls of industrial carpet",
      dropoff: "Flooring Depot - 740 Wilson Ave, Toronto, ON", date: isoDate(-1), time: "10:00",
      status: "in_transit", carrier: "car-2", trucker: "trk-2", dock: "Dock 3",
      accepted: minutesAgo(1600), arrived: minutesAgo(1500), verified: minutesAgo(1490), released: minutesAgo(1460) });

    // Demo: Marcus declined this one, so it's back with the coordinator to reassign.
    insertShipment.run({ ...base, id: "shp-1007", ref: "TRU-1007", cargo: "18 pallets of frozen poultry",
      dropoff: "Cold Storage - 95 Nebo Rd, Hamilton, ON", date: isoDate(1), time: "06:00",
      status: "unassigned", declined: "trk-1" });
  });

  console.log("[seed] demo data loaded");
}

// Run directly: `npm run seed` resets the DB to demo state.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  seed({ reset: process.argv.includes("--reset") });
}
