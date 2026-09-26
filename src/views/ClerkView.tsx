import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BadgeCheck, CircleCheck, IdCard, KeyRound, QrCode, ScanLine, ShieldAlert, ShieldCheck, Truck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DriverAvatar } from "@/components/shared/DriverAvatar";
import { QrScanner } from "@/components/clerk/QrScanner";
import { formatPickup, formatStamp, timeAgo } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { ScanInput } from "@/services/verificationService";
import { useAppStore, useRoleSession } from "@/store/useAppStore";
import type { PassMismatch, ScanResult } from "@/types";

/** Shown after a successful check-in until the clerk moves on to the next driver. */
interface Admitted {
  ref: string;
  driverName: string;
  photo?: string;
  plate: string;
  dock: string;
  at: string;
}

interface ScanError {
  message: string;
  mismatches?: PassMismatch[];
  attemptsRemaining?: number;
}

function toScanError(e: unknown): ScanError {
  if (e instanceof ApiError) {
    return { message: e.message, mismatches: e.mismatches, attemptsRemaining: e.attemptsRemaining };
  }
  return { message: e instanceof Error ? e.message : String(e) };
}

export function ClerkView() {
  useRoleSession("clerk");
  const shipments = useAppStore((s) => s.shipments);
  const scanPass = useAppStore((s) => s.scanPass);
  const verifyAndAdmit = useAppStore((s) => s.verifyAndAdmit);
  const releaseForTransit = useAppStore((s) => s.releaseForTransit);

  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<ScanError | null>(null);

  const [idMatches, setIdMatches] = useState(false);
  const [vehicleMatches, setVehicleMatches] = useState(false);
  const [plateEntered, setPlateEntered] = useState("");
  const [dockNumber, setDockNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [admitted, setAdmitted] = useState<Admitted | null>(null);

  const awaitingCheckIn = shipments.filter((s) => s.status === "at_warehouse");
  const recentlyProcessed = shipments.filter((s) => s.status === "verified" || s.status === "in_transit");

  function reset() {
    setResult(null);
    setError(null);
    setCode("");
    setIdMatches(false);
    setVehicleMatches(false);
    setPlateEntered("");
    setDockNumber("");
    setNotes("");
  }

  async function handleScan(input: ScanInput) {
    reset();
    setAdmitted(null);
    setScanning(true);
    try {
      setResult(await scanPass(input));
    } catch (e) {
      setError(toScanError(e));
    } finally {
      setScanning(false);
    }
  }

  function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (/^\d{6}$/.test(code)) void handleScan({ code });
  }

  async function handleVerify() {
    if (!result) return;
    setVerifying(true);
    setError(null);
    try {
      const dock = dockNumber.trim() || "Dock 1";
      await verifyAndAdmit({
        shipmentId: result.shipment.id,
        ticket: result.ticket,
        idMatches,
        vehicleMatches,
        plateEntered,
        dockNumber: dock,
        notes: notes.trim() || undefined,
      });
      toast.success(`${result.shipment.referenceCode} verified`, {
        description: `${result.driver.name} admitted to ${dock}.`,
      });
      setAdmitted({
        ref: result.shipment.referenceCode,
        driverName: result.driver.name,
        photo: result.driver.photo,
        plate: result.driver.vehiclePlate,
        dock,
        at: new Date().toISOString(),
      });
      reset();
    } catch (e) {
      setError(toScanError(e));
    } finally {
      setVerifying(false);
    }
  }

  async function handleRelease(id: string, ref: string) {
    try {
      await releaseForTransit(id);
      toast.success(`${ref} released for transit`);
    } catch (e) {
      toast.error("Could not release", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receiving</h1>
          <p className="text-sm text-muted-foreground">
            Scan the driver's pass to confirm they're the driver dispatch assigned.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting check-in</CardTitle>
            <CardDescription>Drivers who've checked in at the warehouse.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {awaitingCheckIn.length === 0 && (
              <p className="text-sm text-muted-foreground">No one waiting right now.</p>
            )}
            {awaitingCheckIn.map((shipment) => (
              <div
                key={shipment.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{shipment.referenceCode}</div>
                  <div className="text-xs text-muted-foreground">
                    {shipment.driverName} &middot; arrived {shipment.arrivedAt ? timeAgo(shipment.arrivedAt) : "—"}
                  </div>
                </div>
                {shipment.locked ? (
                  <span className="text-xs font-medium text-destructive">Pass locked</span>
                ) : (
                  <StatusBadge status={shipment.status} />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently processed</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {recentlyProcessed.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing processed yet today.</p>
            )}
            {recentlyProcessed.map((shipment) => (
              <div
                key={shipment.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{shipment.referenceCode}</div>
                  <div className="text-xs text-muted-foreground">
                    {shipment.driverName} &middot; {shipment.dockNumber}
                    {shipment.verifiedAt && ` · verified ${formatStamp(shipment.verifiedAt)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={shipment.status} />
                  {shipment.status === "verified" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRelease(shipment.id, shipment.referenceCode)}
                    >
                      Release
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Scanner first on phones; right-hand column on wide screens. */}
      <Card className="order-first h-fit lg:order-last">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="size-4" />
            Verify driver
          </CardTitle>
          <CardDescription>
            Scan the QR on the driver's phone, or type the 6-digit code shown under it. Codes change every 30
            seconds and work once.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {admitted && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-600/30 bg-emerald-50 p-6 text-center dark:bg-emerald-500/10">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-600 text-white">
                <CircleCheck className="size-9" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-300">Driver verified</p>
                <p className="text-sm text-emerald-900/80 dark:text-emerald-300/80">
                  {admitted.ref} &middot; admitted to {admitted.dock} at {formatStamp(admitted.at)}
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-background/70 px-3 py-2 text-left text-sm">
                <DriverAvatar photo={admitted.photo} name={admitted.driverName} className="size-10" />
                <div>
                  <div className="font-medium">{admitted.driverName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{admitted.plate}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Dispatch now sees this order as verified by the clerk.</p>
              <Button onClick={() => setAdmitted(null)}>
                <ScanLine className="size-4" />
                Verify next driver
              </Button>
            </div>
          )}

          {!result && !admitted && (
            <Tabs defaultValue="qr">
              <TabsList>
                <TabsTrigger value="qr">
                  <QrCode className="size-4" />
                  Scan QR
                </TabsTrigger>
                <TabsTrigger value="code">
                  <KeyRound className="size-4" />
                  6-digit code
                </TabsTrigger>
              </TabsList>
              <TabsContent value="qr" className="pt-2">
                <QrScanner disabled={scanning} onScan={(qr) => void handleScan({ qr })} />
              </TabsContent>
              <TabsContent value="code" className="pt-2">
                <form onSubmit={handleCodeSubmit} className="flex gap-2">
                  <Input
                    placeholder="123456"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="font-mono tracking-widest"
                  />
                  <Button type="submit" variant="outline" disabled={code.length !== 6 || scanning}>
                    {scanning ? "Checking…" : "Look up"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}

          {scanning && <p className="text-sm text-muted-foreground">Checking pass…</p>}

          {error && (
            <Alert variant="destructive">
              <ShieldAlert className="size-4" />
              <AlertTitle>{error.mismatches ? "Pass rejected" : "Verification issue"}</AlertTitle>
              <AlertDescription>
                <p>{error.message}</p>
                {error.attemptsRemaining !== undefined && error.attemptsRemaining > 0 && (
                  <p>{error.attemptsRemaining} attempt(s) left before this pass is locked.</p>
                )}
                {error.mismatches && (
                  <ul className="mt-2 list-disc pl-4">
                    {error.mismatches.map((m) => (
                      <li key={m.field}>
                        {m.field}: pass says “{m.onPass}”, records say “{m.onRecord}”
                      </li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          {result && (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-600/20 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300">
                <ShieldCheck className="size-4 shrink-0" />
                Valid pass for {result.shipment.referenceCode} (
                {result.via === "qr" ? "QR scanned, details match dispatch records" : "code entered"}). Now check
                the person and vehicle.
              </div>

              <div className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-3 sm:flex-row">
                <DriverAvatar photo={result.driver.photo} name={result.driver.name} className="size-32 self-start" />
                <div className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Driver</span>
                  <span className="font-medium">{result.driver.name}</span>
                  <span className="text-muted-foreground">Licence #</span>
                  <span className="font-mono">{result.driver.licenseNumber}</span>
                  <span className="text-muted-foreground">Phone</span>
                  <span>{result.driver.phone}</span>
                  <span className="text-muted-foreground">Email</span>
                  <span className="break-all">{result.driver.email}</span>
                  <span className="text-muted-foreground">Carrier</span>
                  <span>
                    {result.carrier.name}{" "}
                    <span className={result.carrier.cvorStatus === "active" ? "text-muted-foreground" : "text-destructive"}>
                      (CVOR {result.carrier.cvorStatus})
                    </span>
                  </span>
                  <span className="text-muted-foreground">Vehicle</span>
                  <span>{result.driver.vehicleDescription || "—"}</span>
                  <span className="text-muted-foreground">Plate</span>
                  <span className="font-mono font-medium">{result.driver.vehiclePlate}</span>
                </div>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
                <span className="text-muted-foreground">Order</span>
                <span>
                  {result.shipment.referenceCode}
                  {result.shipment.cargo && ` · ${result.shipment.cargo}`}
                </span>
                <span className="text-muted-foreground">Pickup</span>
                <span>{result.shipment.pickupLocation}</span>
                <span className="text-muted-foreground">Drop-off</span>
                <span>{result.shipment.dropoffLocation}</span>
                <span className="text-muted-foreground">When</span>
                <span>{formatPickup(result.shipment.pickupDate, result.shipment.pickupTime)}</span>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={idMatches} onCheckedChange={(v) => setIdMatches(v === true)} />
                  <IdCard className="size-4 text-muted-foreground" />
                  Driver matches the photo, and their licence matches the name and number above
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={vehicleMatches} onCheckedChange={(v) => setVehicleMatches(v === true)} />
                  <Truck className="size-4 text-muted-foreground" />
                  Vehicle matches the description above
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plate">Plate you see on the truck</Label>
                  <Input
                    id="plate"
                    placeholder="Type it, don't copy it"
                    value={plateEntered}
                    onChange={(e) => setPlateEntered(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dock">Assign dock</Label>
                  <Input id="dock" placeholder="e.g. Dock 7" value={dockNumber} onChange={(e) => setDockNumber(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={reset}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={!idMatches || !vehicleMatches || plateEntered.trim().length < 2 || verifying}
                  onClick={handleVerify}
                >
                  <BadgeCheck className="size-4" />
                  {verifying ? "Verifying…" : "Verify & admit"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
