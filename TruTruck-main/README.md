# TruTruck: Dispatch & Pickup Verification

Stops fictitious pickups by making sure the driver at the dock is the one the
coordinator actually dispatched. Three roles: **Logistics Coordinator**,
**Trucker**, **Receiving Clerk**.

## Run it (two terminals)

```bash
# 1. Backend  (http://localhost:4000/api), in TruTruck-main/server
cd TruTruck-main/server
cp .env.example .env        # set JWT_SECRET
npm install
npm run dev

# 2. Frontend (http://localhost:5173), in the repo root
cp .env.example .env
npm install
npm run dev
```

Reset demo data any time: `cd TruTruck-main/server && npm run seed`
(Older `trutruck.db` files from before the TOTP pass are dropped and re-seeded automatically.)

## Stack
- **Frontend:** React 19 + Vite + Tailwind + shadcn/ui + Zustand
- **Backend:** Node + Express 5 + TypeScript, built-in `node:sqlite` (no native build step), Zod, JWT
- **Requires Node 22.13 or newer** (Node 24 recommended). You may see an "SQLite is experimental" warning; it is harmless.

## How the driver pass works
1. **Coordinator** adds drivers (name, phone, email, photo, licence #, carrier, plate) and creates a
   delivery order (pickup, drop-off, date, time, driver). The server mints a per-order TOTP secret.
2. **Driver** sees the delivery request and accepts or declines. Only after accepting does their app
   receive the secret; it then shows an authenticator-style pass: a QR code plus a 6-digit code,
   both rotating every 30 seconds (RFC 6238, same scheme as Google Authenticator).
   The QR holds the driver's details, the delivery details and the current code.
3. **Receiving clerk** scans the QR (camera or photo upload) or types the 6-digit code. The server
   checks the code, compares every field in the QR against dispatch records, and only then returns
   the driver's photo and details. The clerk confirms the face, licence, vehicle and plate to admit them.

## Security controls (enforced server-side)
| Control | What it stops |
|---|---|
| Per-order TOTP secret (160-bit, `crypto.randomBytes`); codes rotate every 30s | Screenshots or leaked codes being reused later |
| Secret sent only to the **assigned driver**, only after they accept, and wiped once verified | Coordinator/clerk insiders generating codes; stale passes |
| Each code step works once (replay protection) | Photographing a driver's screen and re-using it |
| QR contents compared field-by-field with dispatch records | Doctored/forged QR codes |
| Driver details (incl. photo) only reach the clerk after a valid scan; clerks can't list drivers | Clerk browsing driver PII |
| 5 wrong codes locks the pass; only the coordinator can reissue (rotates the secret) | Brute-forcing codes at the dock |
| Rate limit on scan/verify (20/min) | Automated guessing |
| Constant-time code comparison | Timing attacks |
| Verify step needs a 5-minute server ticket from a valid scan | Skipping the scan |
| Clerk must type the plate they see; server compares to the plate on file | Wrong truck with a stolen pass |
| Dispatch blocked if carrier CVOR is expired/suspended | Lapsed-credential carriers (All Days Trucking pattern) |
| Unique email and licence number per driver | Duplicate/impersonated driver records |
| Every action written to `audit_log` | Investigation after an incident |

## API
All routes need `Authorization: Bearer <token>` except `/auth/*` and `/health`.

| Method | Path | Role |
|---|---|---|
| GET | `/auth/demo-users` | public (demo) |
| POST | `/auth/demo-login` `{role, truckerId?}` | public (demo) |
| GET | `/shipments` | all (filtered by role) |
| GET | `/carriers` | all |
| GET | `/truckers` | coordinator (all), trucker (self) |
| POST | `/truckers` `{name, phone, email, photo, licenseNumber, carrierId, vehiclePlate, vehicleDescription?}` | coordinator |
| PUT | `/truckers/:id` (same body; omit `photo` to keep it) | coordinator |
| POST | `/shipments` `{pickupLocation, dropoffLocation, pickupDate, pickupTime, cargo?, truckerId?}` | coordinator |
| POST | `/shipments/:id/assign` `{truckerId}` | coordinator |
| POST | `/shipments/:id/reissue-code` | coordinator |
| GET | `/audit?shipmentId=` | coordinator |
| POST | `/shipments/:id/accept`, `/shipments/:id/decline` | trucker (own) |
| POST | `/shipments/:id/arrive` | trucker (own) |
| POST | `/shipments/scan` `{qr}` or `{code}` | clerk |
| POST | `/shipments/:id/verify` `{ticket, idMatches, vehicleMatches, plateEntered, dockNumber?, notes?}` | clerk |
| POST | `/shipments/:id/release` | clerk |

## Demo script
1. **Coordinator:** *New delivery order* and pick *Sam Keller*: blocked (QuickHaul's CVOR expired). Pick another driver.
   TRU-1007 shows *Declined by Marcus Webb*; reassign it. *Add driver* to add someone with a photo.
2. **Trucker (Marcus Webb):** TRU-1002 is a delivery request; accept it and the rotating QR pass appears.
3. **Trucker (Dana Ruiz):** TRU-1003 is at the warehouse with a live pass.
4. **Clerk:** scan Dana's QR (or upload a screenshot of it, or type the 6-digit code). Her photo and details
   appear; tick the checks, type plate `BK72 874`, and admit. Scan the same code again: rejected as already used.
5. Enter a wrong code 5 times against one pass: locked, and the coordinator sees **Reissue pass**.

## Known MVP limits (say these to judges)
- **Demo login has no passwords.** Set `DEMO_LOGIN=false` and add real accounts before any real use.
- **CVOR status is seeded, not live.** Production would pull from MTO data or a carrier-vetting provider.
- TOTP secrets are stored in plaintext (access-controlled) so the server can check codes. Production would encrypt them at rest (KMS).
- The pass lives in the web app; a production driver app would keep the secret in the device keystore.
- All seed data (carriers, drivers, plates, addresses) is fictional.
