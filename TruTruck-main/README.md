# TruTruck: Dispatch & Pickup Verification

Stops fictitious pickups by making sure the driver at the dock is the one the
coordinator actually dispatched. Three roles: **Logistics Coordinator**,
**Trucker**, **Receiving Clerk**.

## Run it (two terminals)

```bash
# 1. Backend  (http://localhost:4000/api)
cd server
cp .env.example .env        # set JWT_SECRET
npm install
npm run dev

# 2. Frontend (http://localhost:5173)
cp .env.example .env
npm install
npm run dev
```

Reset demo data any time: `cd server && npm run seed`

## Stack
- **Frontend:** React 19 + Vite + Tailwind + shadcn/ui + Zustand
- **Backend:** Node + Express 5 + TypeScript, built-in `node:sqlite` (no native build step), Zod, JWT
- **Requires Node 22.13 or newer** (Node 24 recommended). You may see an "SQLite is experimental" warning; it is harmless.

## Security controls (enforced server-side)
| Control | What it stops |
|---|---|
| 6-digit code from `crypto.randomInt`, single-use, expires (24h default) | Guessable or reused codes |
| Code only ever sent to the **assigned trucker** (never coordinator or clerk) | Insider/clerk leaking or skipping the check |
| 5 wrong codes locks the shipment; only the coordinator can reissue | Brute-forcing codes at the dock |
| Rate limit on verify/lookup (20/min) | Automated guessing |
| Constant-time code comparison | Timing attacks |
| Clerk must type the plate they see; server compares to the plate on file | Wrong truck with a stolen code |
| Dispatch blocked if carrier CVOR is expired/suspended | Lapsed-credential carriers (All Days Trucking pattern) |
| Truckers can only act on their own shipments; status transitions enforced | Skipping steps, acting on others' loads |
| Every action written to `audit_log` | Investigation after an incident |

## API
All routes need `Authorization: Bearer <token>` except `/auth/*` and `/health`.

| Method | Path | Role |
|---|---|---|
| GET | `/auth/demo-users` | public (demo) |
| POST | `/auth/demo-login` `{role, truckerId?}` | public (demo) |
| GET | `/shipments` | all (filtered by role) |
| GET | `/carriers`, `/truckers` | all |
| POST | `/shipments/:id/assign` `{carrierId, truckerId}` | coordinator |
| POST | `/shipments/:id/reissue-code` | coordinator |
| GET | `/audit?shipmentId=` | coordinator |
| POST | `/shipments/:id/acknowledge` | trucker (own) |
| POST | `/shipments/:id/arrive` | trucker (own) |
| POST | `/shipments/lookup` `{code}` | clerk |
| POST | `/shipments/:id/verify` `{code, idMatches, vehicleMatches, plateEntered?, dockNumber?, notes?}` | clerk |
| POST | `/shipments/:id/release` | clerk |

## Demo script
1. **Coordinator:** try dispatching TRU-1001 to *QuickHaul Express*: blocked (CVOR expired). Dispatch to Redline instead.
2. **Trucker (Dana Ruiz):** TRU-1003 is at the warehouse; note the code.
3. **Clerk:** enter a wrong code: attempts counter drops. Enter the right code + plate `BK72 874`: admitted.
4. Wrong code 5 times on another shipment: locked, and the coordinator sees **Reissue code**.

## Known MVP limits (say these to judges)
- **Demo login has no passwords.** Set `DEMO_LOGIN=false` and add real accounts before any real use.
- **CVOR status is seeded, not live.** Production would pull from MTO data or a carrier-vetting provider.
- Codes are stored in plaintext (access-controlled) so the trucker's app can redisplay them. Production could hash them and deliver by SMS.
- All seed data (carriers, drivers, plates, addresses) is fictional.
