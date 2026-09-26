import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { config } from "./config.js";

// Supabase over HTTPS (PostgREST). The service_role key bypasses RLS, so it must stay server-side.
export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Result<T> = { data: T; error: PostgrestError | null };

function check(error: PostgrestError | null) {
  if (error) throw new Error(`Supabase: ${error.message}${error.hint ? ` (${error.hint})` : ""}`);
}

/** Unwrap a supabase-js result, throwing on error. */
export function must<T>({ data, error }: Result<T>): NonNullable<T> {
  check(error);
  return data as NonNullable<T>;
}

/** Unwrap a `.maybeSingle()` result: the row, or null when there isn't one. */
export function maybe<T>({ data, error }: Result<T | null>): T | null {
  check(error);
  return data;
}

/** Warns (without failing) when the revoke-orders migration hasn't been applied yet. */
export async function warnIfMigrationPending() {
  const { error } = await supabase.from("shipments").select("cancelled_at").limit(1);
  if (error) {
    console.warn(
      "[db] Revoking orders needs a schema update. Paste server/migrations/002_revoke_orders.sql " +
        "into Supabase > SQL Editor and run it.",
    );
  }
}

/** Fails fast with setup instructions if server/schema.sql hasn't been run yet. */
export async function assertSchema() {
  const { error } = await supabase.from("audit_log").select("id").limit(1);
  if (error) {
    throw new Error(
      `Supabase tables are missing or unreachable (${error.message}). ` +
        "Paste server/schema.sql into Supabase > SQL Editor and run it.",
    );
  }
}

export interface CarrierRow {
  id: string;
  name: string;
  phone: string;
  cvor_number: string;
  cvor_status: "active" | "expired" | "suspended";
}

export interface DriverRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  photo: string | null;
  carrier_id: string;
  license_number: string;
  vehicle_plate: string;
  vehicle_description: string;
  created_at: string;
}

export interface ShipmentRow {
  id: string;
  reference_code: string;
  cargo: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_date: string;
  pickup_time: string;
  status: ShipmentStatus;
  carrier_id: string | null;
  driver_id: string | null;
  totp_secret: string | null;
  last_totp_step: number | null;
  failed_attempts: number;
  locked: boolean;
  declined_by: string | null;
  dock_number: string | null;
  accepted_at: string | null;
  arrived_at: string | null;
  verified_at: string | null;
  released_at: string | null;
  verification_notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  // Joined for display.
  driver_name: string | null;
  carrier_name: string | null;
  declined_by_name: string | null;
}

// Two foreign keys point at drivers, so each join names its constraint.
const SHIPMENT_COLUMNS = `*,
  driver:drivers!shipments_driver_id_fkey(name),
  carrier:carriers!shipments_carrier_id_fkey(name),
  decliner:drivers!shipments_declined_by_fkey(name)`;

type Named = { name: string } | null;
type ShipmentWithJoins = Omit<ShipmentRow, "driver_name" | "carrier_name" | "declined_by_name"> & {
  driver: Named;
  carrier: Named;
  decliner: Named;
};

/** Shipments plus driver/carrier names; chain filters/ordering, then pass the result to shipmentRows. */
export function selectShipments() {
  return supabase.from("shipments").select(SHIPMENT_COLUMNS);
}

export function shipmentRows(data: unknown): ShipmentRow[] {
  return (data as ShipmentWithJoins[]).map(({ driver, carrier, decliner, ...s }) => ({
    ...s,
    driver_name: driver?.name ?? null,
    carrier_name: carrier?.name ?? null,
    declined_by_name: decliner?.name ?? null,
  }));
}

export type ShipmentStatus =
  | "unassigned"
  | "assigned"
  | "en_route"
  | "at_warehouse"
  | "verified"
  | "in_transit"
  | "cancelled";
