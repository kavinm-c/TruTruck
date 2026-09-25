import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, KeyRound, MapPin, Package, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAppStore } from "@/store/useAppStore";

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span>{value}</span>
      </div>
    </div>
  );
}

export function TruckerView() {
  const shipments = useAppStore((s) => s.shipments);
  const truckers = useAppStore((s) => s.truckers);
  const carriers = useAppStore((s) => s.carriers);
  const acknowledgeShipment = useAppStore((s) => s.acknowledgeShipment);
  const markArrived = useAppStore((s) => s.markArrived);

  const [truckerId, setTruckerId] = useState(truckers[0]?.id ?? "");

  const myShipments = useMemo(
    () =>
      shipments
        .filter((s) => s.truckerId === truckerId)
        .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate)),
    [shipments, truckerId],
  );

  const trucker = truckers.find((t) => t.id === truckerId);
  const carrier = carriers.find((c) => c.id === trucker?.carrierId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My pickups</h1>
          <p className="text-sm text-muted-foreground">
            Shipments assigned to you, from notification through pickup.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Viewing as</span>
          <Select value={truckerId} onValueChange={setTruckerId}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {truckers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {trucker && (
        <p className="text-xs text-muted-foreground">
          {trucker.name} &middot; {carrier?.name} &middot; {trucker.vehiclePlate}
        </p>
      )}

      {myShipments.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No shipments assigned right now.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {myShipments.map((shipment) => (
          <Card key={shipment.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{shipment.referenceCode}</CardTitle>
              <StatusBadge status={shipment.status} />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <DetailRow icon={Package} label="What" value={shipment.what} />
              <DetailRow icon={MapPin} label="Where" value={shipment.origin} />
              <DetailRow
                icon={CalendarClock}
                label="When"
                value={`${shipment.pickupDate} · ${shipment.pickupWindow}`}
              />

              <Separator />

              {shipment.status === "assigned" && (
                <Button
                  onClick={() => {
                    acknowledgeShipment(shipment.id);
                    toast.success(`${shipment.referenceCode} acknowledged`, {
                      description: "Head to the pickup location when ready.",
                    });
                  }}
                >
                  Confirm & head to pickup
                </Button>
              )}

              {shipment.status === "en_route" && (
                <Button
                  onClick={() => {
                    markArrived(shipment.id);
                    toast.success(`Checked in at warehouse`, {
                      description: "Show your verification code to the receiving clerk.",
                    });
                  }}
                >
                  <Warehouse className="size-4" />
                  I've arrived at the warehouse
                </Button>
              )}

              {(shipment.status === "at_warehouse" || shipment.status === "verified" || shipment.status === "in_transit") && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <KeyRound className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Verification code</span>
                  </div>
                  <span className="font-mono text-lg font-semibold tracking-widest">
                    {shipment.verificationCode}
                  </span>
                </div>
              )}

              {shipment.status === "at_warehouse" && (
                <p className="text-xs text-muted-foreground">
                  Show this code, your ID, and vehicle to the receiving clerk to be admitted.
                </p>
              )}

              {(shipment.status === "verified" || shipment.status === "in_transit") && (
                <div className="rounded-lg border border-emerald-600/20 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Identity verified{shipment.dockNumber ? ` — proceed to ${shipment.dockNumber}` : ""}.
                  {shipment.status === "in_transit" && " Load released for transit."}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
