import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, IdCard, ScanLine, Truck } from "lucide-react";
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
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ApiError } from "@/services/api";
import { useAppStore, useRoleSession } from "@/store/useAppStore";
import type { Shipment } from "@/types";

export function ClerkView() {
  useRoleSession("clerk");
  const shipments = useAppStore((s) => s.shipments);
  const carriers = useAppStore((s) => s.carriers);
  const truckers = useAppStore((s) => s.truckers);
  const verifyAndAdmit = useAppStore((s) => s.verifyAndAdmit);
  const releaseForTransit = useAppStore((s) => s.releaseForTransit);

  const [code, setCode] = useState("");
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [idMatches, setIdMatches] = useState(false);
  const [vehicleMatches, setVehicleMatches] = useState(false);
  const [dockNumber, setDockNumber] = useState("");
  const [plateEntered, setPlateEntered] = useState("");
  const lookupByCode = useAppStore((s) => s.lookupByCode);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const awaitingCheckIn = shipments.filter((s) => s.status === "at_warehouse");
  const recentlyProcessed = shipments.filter(
    (s) => s.status === "verified" || s.status === "in_transit",
  );

  // Never pre-fill the code: the clerk must type what the driver shows them.
  function selectShipment(shipment: Shipment, enteredCode = "") {
    setSelected(shipment);
    setCode(enteredCode);
    setPlateEntered("");
    setIdMatches(false);
    setVehicleMatches(false);
    setDockNumber("");
    setError(null);
  }

  async function lookUpCode() {
    setError(null);
    try {
      const match = await lookupByCode(code);
      selectShipment(match, code.trim());
    } catch (e) {
      setSelected(null);
      setError(e instanceof Error ? e.message : "No shipment found for that code.");
    }
  }

  const trucker = selected ? truckers.find((t) => t.id === selected.truckerId) : undefined;
  const carrier = selected ? carriers.find((c) => c.id === selected.carrierId) : undefined;

  async function handleVerify() {
    if (!selected || !trucker) return;
    setChecking(true);
    setError(null);
    try {
      await verifyAndAdmit({
        shipmentId: selected.id,
        enteredCode: code,
        idMatches,
        vehicleMatches,
        plateEntered,
        dockNumber: dockNumber || "Dock 1",
      });
    } catch (e) {
      const remaining =
        e instanceof ApiError && e.attemptsRemaining !== undefined && e.attemptsRemaining > 0
          ? ` ${e.attemptsRemaining} attempt${e.attemptsRemaining === 1 ? "" : "s"} left.`
          : "";
      setError((e instanceof Error ? e.message : "Verification failed.") + remaining);
      return;
    } finally {
      setChecking(false);
    }
    toast.success(`${selected.referenceCode} verified`, {
      description: `${trucker.name} admitted to ${dockNumber || "Dock 1"}.`,
    });
    setSelected(null);
    setCode("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Receiving</h1>
          <p className="text-sm text-muted-foreground">
            Verify driver identity and vehicle before admitting to the dock.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting check-in</CardTitle>
            <CardDescription>Drivers who've arrived and need verification.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {awaitingCheckIn.length === 0 && (
              <p className="text-sm text-muted-foreground">No one waiting right now.</p>
            )}
            {awaitingCheckIn.map((shipment) => {
              const t = truckers.find((tr) => tr.id === shipment.truckerId);
              return (
                <button
                  key={shipment.id}
                  onClick={() => selectShipment(shipment)}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  <div>
                    <div className="font-medium">{shipment.referenceCode}</div>
                    <div className="text-xs text-muted-foreground">{t?.name}</div>
                  </div>
                  <StatusBadge status={shipment.status} />
                </button>
              );
            })}
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
                  <div className="text-xs text-muted-foreground">{shipment.dockNumber}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={shipment.status} />
                  {shipment.status === "verified" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        releaseForTransit(shipment.id).catch((e) =>
                          toast.error("Release failed", { description: e instanceof Error ? e.message : String(e) }),
                        )
                      }
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

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="size-4" />
            Verify driver
          </CardTitle>
          <CardDescription>
            Enter the driver's verification code, or select them from the list.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Input
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono tracking-widest"
              maxLength={6}
            />
            <Button variant="outline" onClick={lookUpCode}>
              Look up
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Verification issue</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {selected && trucker && (
            <>
              <Separator />
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Truck className="size-4" />
                  Expected driver &amp; vehicle
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Driver</span>
                  <span>{trucker.name}</span>
                  <span className="text-muted-foreground">License #</span>
                  <span>{trucker.licenseNumber}</span>
                  <span className="text-muted-foreground">Carrier</span>
                  <span>{carrier?.name}</span>
                  <span className="text-muted-foreground">Vehicle</span>
                  <span>{trucker.vehicleDescription}</span>
                  <span className="text-muted-foreground">Plate</span>
                  <span>{trucker.vehiclePlate}</span>
                  <span className="text-muted-foreground">Shipment</span>
                  <span>{selected.referenceCode} &middot; {selected.what}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={idMatches} onCheckedChange={(v) => setIdMatches(v === true)} />
                  <IdCard className="size-4 text-muted-foreground" />
                  Driver ID matches the name above
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={vehicleMatches}
                    onCheckedChange={(v) => setVehicleMatches(v === true)}
                  />
                  <Truck className="size-4 text-muted-foreground" />
                  Vehicle plate/description matches
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plate">Plate on the truck (type what you see)</Label>
                <Input
                  id="plate"
                  placeholder="e.g. AR48 291"
                  value={plateEntered}
                  onChange={(e) => setPlateEntered(e.target.value)}
                  className="font-mono uppercase"
                  maxLength={20}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dock">Assign dock</Label>
                <Input
                  id="dock"
                  placeholder="e.g. Dock 7"
                  value={dockNumber}
                  onChange={(e) => setDockNumber(e.target.value)}
                />
              </div>

              <Button
                disabled={!idMatches || !vehicleMatches || !plateEntered.trim() || code.trim().length !== 6 || checking}
                onClick={handleVerify}
              >
                <BadgeCheck className="size-4" />
                {checking ? "Verifying…" : "Verify & admit"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
