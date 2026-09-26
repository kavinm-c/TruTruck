import { pathToFileURL } from "node:url";
import { db, migrate, transaction } from "./db.js";
import { codeExpiry, generateCode } from "./codes.js";

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

const ORIGIN = "Warehouse 4 - 8 Industrial Pkwy, Brampton, ON";

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
    `INSERT INTO truckers (id, name, phone, carrier_id, license_number, vehicle_plate, vehicle_description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertShipment = db.prepare(
    `INSERT INTO shipments (id, reference_code, what, origin, destination, pickup_date, pickup_window,
       status, carrier_id, trucker_id, verification_code, code_expires_at, dock_number,
       acknowledged_at, arrived_at, verified_at)
     VALUES (@id, @ref, @what, @origin, @dest, @date, @window, @status, @carrier, @trucker,
       @code, @expires, @dock, @ack, @arrived, @verified)`,
  );

  transaction(() => {
    // All fictional demo data.
    insertCarrier.run("car-1", "Redline Freight Co.", "(905) 555-0134", "123-456-789", "active");
    insertCarrier.run("car-2", "Pacific Crest Hauling", "(416) 555-0188", "234-567-890", "active");
    insertCarrier.run("car-3", "Ironwood Logistics", "(905) 555-0162", "345-678-901", "active");
    // Demo case: a carrier whose registration has lapsed (like the All Days Trucking pattern).
    insertCarrier.run("car-4", "QuickHaul Express", "(647) 555-0199", "456-789-012", "expired");

    insertTrucker.run("trk-1", "Marcus Webb", "(905) 555-0117", "car-1", "W1234-56789-01234",
      "AR48 291", "White Freightliner Cascadia, 53' dry van");
    insertTrucker.run("trk-2", "Dana Ruiz", "(416) 555-0145", "car-2", "R2345-67890-12345",
      "BK72 874", "Blue Kenworth T680, 48' flatbed");
    insertTrucker.run("trk-3", "Ollie Bennett", "(905) 555-0171", "car-3", "B3456-78901-23456",
      "CT19 402", "Red Peterbilt 579, 53' reefer");
    insertTrucker.run("trk-4", "Sam Keller", "(647) 555-0102", "car-4", "K4567-89012-34567",
      "DZ55 610", "Grey Volvo VNL, 53' dry van");

    const base = { origin: ORIGIN, carrier: null, trucker: null, code: null, expires: null,
      dock: null, ack: null, arrived: null, verified: null };

    insertShipment.run({ ...base, id: "shp-1001", ref: "TRU-1001",
      what: "24 pallets of packaged electronics", dest: "Distribution Centre B - Ottawa, ON",
      date: isoDate(1), window: "8:00 AM - 10:00 AM", status: "unassigned" });

    insertShipment.run({ ...base, id: "shp-1002", ref: "TRU-1002",
      what: "12 pallets of bottled beverages", dest: "Regional Hub - London, ON",
      date: isoDate(1), window: "9:30 AM - 11:00 AM", status: "assigned",
      carrier: "car-1", trucker: "trk-1", code: generateCode(), expires: codeExpiry() });

    insertShipment.run({ ...base, id: "shp-1003", ref: "TRU-1003",
      what: "8 crates of machine parts", dest: "Assembly Plant - Montreal, QC",
      date: isoDate(0), window: "1:00 PM - 2:30 PM", status: "at_warehouse",
      carrier: "car-2", trucker: "trk-2", code: generateCode(), expires: codeExpiry(),
      ack: minutesAgo(120), arrived: minutesAgo(10) });

    insertShipment.run({ ...base, id: "shp-1004", ref: "TRU-1004",
      what: "40 pallets of canned goods", dest: "Retail DC - Kingston, ON",
      date: isoDate(0), window: "7:00 AM - 8:30 AM", status: "verified",
      carrier: "car-3", trucker: "trk-3", dock: "Dock 7",
      ack: minutesAgo(300), arrived: minutesAgo(200), verified: minutesAgo(190) });

    insertShipment.run({ ...base, id: "shp-1005", ref: "TRU-1005",
      what: "18 pallets of frozen poultry", dest: "Cold Storage - Hamilton, ON",
      date: isoDate(1), window: "6:00 AM - 7:30 AM", status: "unassigned" });
  });

  console.log("[seed] demo data loaded");
}

// Run directly: `npm run seed` resets the DB to demo state.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  seed({ reset: process.argv.includes("--reset") });
}
