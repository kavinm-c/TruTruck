import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BellRing, CalendarClock, Check, Flag, MapPin, Package, Warehouse, X } from "lucide-react";
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
import { DriverAvatar } from "@/components/shared/DriverAvatar";
import { DriverPass } from "@/components/trucker/DriverPass";
import { formatPickup } from "@/lib/format";
import { getDemoTruckers } from "@/services/api";
import { useAppStore, useRoleSession } from "@/store/useAppStore";
import type { Shipment } from "@/types";

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

function OrderDetails({ shipment }: { shipment: Shipment }) {
  return (
    <>
      <DetailRow icon={MapPin} label="Pickup" value={shipment.pickupLocation} />
      <DetailRow icon={Flag} label="Drop-off" value={shipment.dropoffLocation} />
      <DetailRow icon={CalendarClock} label="When" value={formatPickup(shipment.pickupDate, shipment.pickupTime)} />
      {shipment.cargo && <DetailRow icon={Package} label="Cargo" value={shipment.cargo} />}
    </>
  );
}

export function TruckerView() {
  const [demoTruckers, setDemoTruckers] = useState<{ id: string; name: string }[]>([]);
  const [truckerId, setTruckerId] = useState("");

  useEffect(() => {
    getDemoTruckers()
      .then((list) => {
        setDemoTruckers(list);
        setTruckerId((current) => current || list[0]?.id || "");
      })
      .catch(() => toast.error("Can't reach the TruTruck API. Is the server running?"));
  }, []);

  useRoleSession("trucker", truckerId || undefined);

  const shipments = useAppStore((s) => s.shipments);
  const truckers = useAppStore((s) => s.truckers);
  const carriers = useAppStore((s) => s.carriers);
  const acceptShipment = useAppStore((s) => s.acceptShipment);
  const declineShipment = useAppStore((s) => s.declineShipment);
  const markArrived = useAppStore((s) => s.markArrived);

  // The API only returns the logged-in driver's own record.
  const me = truckers.find((t) => t.id === truckerId);
  const carrier = carriers.find((c) => c.id === me?.carrierId);

  const { requests, active, done } = useMemo(() => {
    const mine = shipments.filter((s) => s.truckerId === truckerId);
    return {
      requests: mine.filter((s) => s.status === "assigned"),
      active: mine.filter((s) => s.status === "en_route" || s.status === "at_warehouse"),
      done: mine.filter((s) => s.status === "verified" || s.status === "in_transit"),
    };
  }, [shipments, truckerId]);

  async function run(action: () => Promise<void>, success: string, description: string) {
    try {
      await action();
      toast.success(success, { description });
    } catch (e) {
      toast.error("Action failed", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My deliveries</h1>
          <p className="text-sm text-muted-foreground">
            Accept delivery requests and show your pass at the pickup dock.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Viewing as</span>
          <Select value={truckerId} onValueChange={setTruckerId}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {demoTruckers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {me && (
        <div className="flex items-center gap-3">
          <DriverAvatar photo={me.photo} name={me.name} className="size-12" />
          <div className="text-sm">
            <div className="font-medium">{me.name}</div>
            <div className="text-xs text-muted-foreground">
              {carrier?.name} &middot; <span className="font-mono">{me.vehiclePlate}</span> &middot; Licence{" "}
              <span className="font-mono">{me.licenseNumber}</span>
            </div>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <BellRing className="size-4 text-blue-600 dark:text-blue-400" />
            Delivery requests ({requests.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {requests.map((shipment) => (
              <Card key={shipment.id} className="ring-2 ring-blue-500/40">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{shipment.referenceCode}</CardTitle>
                  <StatusBadge status={shipment.status} />
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <OrderDetails shipment={shipment} />
                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    Accepting unlocks your pickup pass: a QR code and 6-digit code that change every 30 seconds.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        run(
                          () => declineShipment(shipment.id),
                          `${shipment.referenceCode} declined`,
                          "Dispatch has been told so they can reassign it.",
                        )
                      }
                    >
                      <X className="size-4" />
                      Decline
                    </Button>
                    <Button
                      onClick={() =>
                        run(
                          () => acceptShipment(shipment.id),
                          `${shipment.referenceCode} accepted`,
                          "Your pickup pass is ready. Show it to the receiving clerk.",
                        )
                      }
                    >
                      <Check className="size-4" />
                      Accept
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {requests.length === 0 && active.length === 0 && done.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No deliveries assigned right now.
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Active</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((shipment) => (
              <Card key={shipment.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{shipment.referenceCode}</CardTitle>
                  <StatusBadge status={shipment.status} />
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <OrderDetails shipment={shipment} />
                  <Separator />
                  {me && <DriverPass shipment={shipment} driver={me} />}
                  <p className="text-xs text-muted-foreground">
                    At the dock, let the receiving clerk scan this QR (or read them the 6-digit code) and show
                    your licence and vehicle.
                  </p>
                  {shipment.status === "en_route" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        run(
                          () => markArrived(shipment.id),
                          "Checked in at warehouse",
                          "The receiving clerk has been notified.",
                        )
                      }
                    >
                      <Warehouse className="size-4" />
                      I've arrived at pickup
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Completed checks</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {done.map((shipment) => (
              <Card key={shipment.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{shipment.referenceCode}</CardTitle>
                  <StatusBadge status={shipment.status} />
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <OrderDetails shipment={shipment} />
                  <div className="rounded-lg border border-emerald-600/20 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Identity verified{shipment.dockNumber ? ` — proceed to ${shipment.dockNumber}` : ""}.
                    {shipment.status === "in_transit" && " Load released for transit."}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
