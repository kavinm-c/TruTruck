import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Ban,
  CalendarClock,
  CircleCheck,
  Flag,
  Info,
  MapPin,
  PackagePlus,
  PackageSearch,
  Pencil,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DriverAvatar } from "@/components/shared/DriverAvatar";
import { DriverDialog } from "@/components/coordinator/DriverDialog";
import { DriverSelect } from "@/components/coordinator/DriverSelect";
import { OrderDialog } from "@/components/coordinator/OrderDialog";
import { Dashboard } from "@/components/coordinator/Dashboard";
import { formatPickup, formatStamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore, useRoleSession } from "@/store/useAppStore";
import {
  REVOCABLE_STATUSES,
  SHIPMENT_STATUS_LABEL,
  SHIPMENT_STATUSES,
  type Driver,
  type Shipment,
  type ShipmentStatus,
} from "@/types";

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div>{value || "—"}</div>
      </div>
    </div>
  );
}

export function CoordinatorView() {
  useRoleSession("coordinator");
  const shipments = useAppStore((s) => s.shipments);
  const carriers = useAppStore((s) => s.carriers);
  const drivers = useAppStore((s) => s.drivers);
  const assignShipment = useAppStore((s) => s.assignShipment);
  const reissueCode = useAppStore((s) => s.reissueCode);
  const revokeShipment = useAppStore((s) => s.revokeShipment);

  // Status filter lives in the URL (?status=verified) so it survives refreshes.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const statusFilter: ShipmentStatus | "all" = SHIPMENT_STATUSES.includes(statusParam as ShipmentStatus)
    ? (statusParam as ShipmentStatus)
    : "all";
  function setStatusFilter(status: ShipmentStatus | "all") {
    setSearchParams(status === "all" ? {} : { status }, { replace: true });
  }
  const visibleShipments =
    statusFilter === "all" ? shipments : shipments.filter((s) => s.status === statusFilter);

  const [orderOpen, setOrderOpen] = useState(false);
  const [driverDialog, setDriverDialog] = useState<{ open: boolean; driver: Driver | null }>({
    open: false,
    driver: null,
  });
  const [assigning, setAssigning] = useState<Shipment | null>(null);
  const [driverId, setDriverId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState<Shipment | null>(null);
  const [viewing, setViewing] = useState<Shipment | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  function openAssignDialog(shipment: Shipment) {
    setAssigning(shipment);
    setDriverId(shipment.driverId ?? "");
  }

  async function confirmAssignment() {
    if (!assigning || !driverId) return;
    setSubmitting(true);
    try {
      await assignShipment(assigning.id, driverId);
      const driver = drivers.find((d) => d.id === driverId);
      toast.success(`${assigning.referenceCode} sent to ${driver?.name}`, {
        description: "They'll see the delivery request and can accept it.",
      });
      setAssigning(null);
    } catch (e) {
      toast.error("Dispatch blocked", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReissue(shipment: Shipment) {
    try {
      await reissueCode(shipment.id);
      toast.success(`New pass issued for ${shipment.referenceCode}`, {
        description: "The driver's app switches to the new pass automatically.",
      });
    } catch (e) {
      toast.error("Could not reissue pass", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  function openRevokeDialog(shipment: Shipment) {
    setRevoking(shipment);
    setRevokeReason("");
  }

  async function confirmRevoke() {
    if (!revoking) return;
    setSubmitting(true);
    try {
      await revokeShipment(revoking.id, revokeReason.trim() || undefined);
      toast.success(`${revoking.referenceCode} revoked`, {
        description: revoking.driverName
          ? `${revoking.driverName}'s pass no longer works.`
          : "The order is now marked as cancelled.",
      });
      setRevoking(null);
    } catch (e) {
      toast.error("Could not revoke order", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  const unassignedCount = shipments.filter((s) => s.status === "unassigned").length;
  const awaitingCount = shipments.filter((s) => s.status === "assigned").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            {unassignedCount} order{unassignedCount === 1 ? "" : "s"} need a driver &middot; {awaitingCount} awaiting
            driver acceptance
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            className="h-11 px-5 text-base"
            onClick={() => setDriverDialog({ open: true, driver: null })}
          >
            <UserPlus className="size-5" />
            Add driver
          </Button>
          <Button size="lg" className="h-11 px-5 text-base" onClick={() => setOrderOpen(true)}>
            <PackagePlus className="size-5" />
            New delivery order
          </Button>
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Delivery orders ({shipments.length})</TabsTrigger>
          <TabsTrigger value="drivers">Drivers ({drivers.length})</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery orders</CardTitle>
              <CardDescription>Create orders, assign drivers, and track them to the dock.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter orders by status">
                {(["all", ...SHIPMENT_STATUSES] as const).map((status) => {
                  const count =
                    status === "all" ? shipments.length : shipments.filter((s) => s.status === status).length;
                  const active = statusFilter === status;
                  return (
                    <Button
                      key={status}
                      size="sm"
                      variant={active ? "default" : "outline"}
                      aria-pressed={active}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status === "all" ? "All" : SHIPMENT_STATUS_LABEL[status]}
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[0.7rem] tabular-nums",
                          active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {count}
                      </span>
                    </Button>
                  );
                })}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Driver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleShipments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                        No {statusFilter === "all" ? "" : `${SHIPMENT_STATUS_LABEL[statusFilter].toLowerCase()} `}
                        orders.
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleShipments.map((shipment) => {
                    const driver = drivers.find((d) => d.id === shipment.driverId);
                    const canAssign = ["unassigned", "assigned", "en_route"].includes(shipment.status);
                    const canRevoke = REVOCABLE_STATUSES.includes(shipment.status);
                    return (
                      <TableRow key={shipment.id}>
                        <TableCell>
                          <div className="font-medium">{shipment.referenceCode}</div>
                          <div className="max-w-48 truncate text-xs text-muted-foreground">
                            {shipment.cargo || "—"}
                          </div>
                          <Button
                            size="xs"
                            variant="outline"
                            className="mt-1.5"
                            aria-label={`Pickup and drop-off details for ${shipment.referenceCode}`}
                            onClick={() => setViewing(shipment)}
                          >
                            <Info />
                            Info
                          </Button>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={shipment.status} />
                          {shipment.locked && (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium text-destructive">Pass locked</span>
                              <Button size="xs" variant="destructive" onClick={() => handleReissue(shipment)}>
                                Reissue pass
                              </Button>
                            </div>
                          )}
                          {shipment.status === "verified" && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                              <CircleCheck className="size-3.5 shrink-0" />
                              Verified by receiving clerk
                              {shipment.dockNumber && ` · ${shipment.dockNumber}`}
                              {shipment.verifiedAt && ` · ${formatStamp(shipment.verifiedAt)}`}
                            </div>
                          )}
                          {shipment.status === "in_transit" && shipment.verifiedAt && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <CircleCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              Clerk verified {formatStamp(shipment.verifiedAt)}
                            </div>
                          )}
                          {shipment.status === "cancelled" && (
                            <div className="mt-1 max-w-48 text-xs text-muted-foreground">
                              Revoked{shipment.cancelledAt && ` ${formatStamp(shipment.cancelledAt)}`}
                              {shipment.cancelReason && ` · ${shipment.cancelReason}`}
                            </div>
                          )}
                          {shipment.status === "unassigned" && shipment.declinedBy && (
                            <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                              Declined by {shipment.declinedBy}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center justify-between gap-3">
                            {driver ? (
                              <div className="flex items-center gap-2">
                                <DriverAvatar photo={driver.photo} name={driver.name} className="size-7 rounded-md" />
                                <div>
                                  <div className="font-medium text-foreground">{driver.name}</div>
                                  <div className="text-muted-foreground">{shipment.carrierName}</div>
                                </div>
                              </div>
                            ) : canAssign ? (
                              <Button size="sm" onClick={() => openAssignDialog(shipment)}>
                                Assign driver
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}

                            <div className="flex shrink-0 items-center gap-1">
                              {driver && canAssign && (
                                <Button size="xs" variant="outline" onClick={() => openAssignDialog(shipment)}>
                                  Reassign
                                </Button>
                              )}
                              {canRevoke && (
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  title="Revoke order"
                                  aria-label={`Revoke ${shipment.referenceCode}`}
                                  onClick={() => openRevokeDialog(shipment)}
                                >
                                  <Ban />
                                </Button>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drivers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Drivers</CardTitle>
              <CardDescription>
                The receiving clerk sees these details after scanning a driver's pass.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Licence #</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map((d) => {
                    const carrier = carriers.find((c) => c.id === d.carrierId);
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <DriverAvatar photo={d.photo} name={d.name} />
                            <div>
                              <div className="font-medium">{d.name}</div>
                              <div className="text-xs text-muted-foreground">{d.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{d.phone}</TableCell>
                        <TableCell className="font-mono text-xs">{d.licenseNumber}</TableCell>
                        <TableCell className="text-xs">
                          {carrier?.name}
                          {carrier && carrier.cvorStatus !== "active" && (
                            <div className="font-medium text-destructive">CVOR {carrier.cvorStatus}</div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal text-xs">
                          <div className="font-mono font-medium">{d.vehiclePlate}</div>
                          <div className="text-muted-foreground">{d.vehicleDescription}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setDriverDialog({ open: true, driver: d })}>
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard">
          <Dashboard />
        </TabsContent>
      </Tabs>

      <OrderDialog open={orderOpen} onOpenChange={setOrderOpen} />
      <DriverDialog
        open={driverDialog.open}
        driver={driverDialog.driver}
        onOpenChange={(open) => setDriverDialog((d) => ({ ...d, open }))}
      />

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="size-4" />
              {viewing?.referenceCode}
            </DialogTitle>
            <DialogDescription>{viewing?.cargo || "No cargo description"}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 text-sm">
            <InfoRow icon={MapPin} label="Pickup" value={viewing?.pickupLocation} />
            <InfoRow icon={Flag} label="Drop-off" value={viewing?.dropoffLocation} />
            <InfoRow
              icon={CalendarClock}
              label="Pickup time"
              value={viewing && formatPickup(viewing.pickupDate, viewing.pickupTime)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="size-4 text-destructive" />
              Revoke {revoking?.referenceCode}?
            </DialogTitle>
            <DialogDescription>
              The order is marked as cancelled and can't be reopened.
              {revoking?.driverName && ` ${revoking.driverName}'s pickup pass stops working immediately.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="revoke-reason">Reason (optional)</Label>
            <Input
              id="revoke-reason"
              placeholder="e.g. Customer postponed the delivery"
              maxLength={200}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Keep order
            </Button>
            <Button variant="destructive" disabled={submitting} onClick={confirmRevoke}>
              {submitting ? "Revoking…" : "Revoke order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assigning !== null} onOpenChange={(open) => !open && setAssigning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageSearch className="size-4" />
              Assign {assigning?.referenceCode}
            </DialogTitle>
            <DialogDescription>
              The driver gets a delivery request to accept. Reassigning cancels the previous driver's pass.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs">
              <p><span className="text-muted-foreground">Pickup: </span>{assigning?.pickupLocation}</p>
              <p><span className="text-muted-foreground">Drop-off: </span>{assigning?.dropoffLocation}</p>
              <p>
                <span className="text-muted-foreground">When: </span>
                {assigning && formatPickup(assigning.pickupDate, assigning.pickupTime)}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-driver">Driver</Label>
              <DriverSelect id="assign-driver" value={driverId} onChange={setDriverId} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button disabled={!driverId || submitting} onClick={confirmAssignment}>
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
