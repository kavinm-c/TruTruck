import { useState } from "react";
import { toast } from "sonner";
import { PackagePlus, PackageSearch, Pencil, UserPlus } from "lucide-react";
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
import { formatPickup, shortPlace } from "@/lib/format";
import { useAppStore, useRoleSession } from "@/store/useAppStore";
import type { Shipment, Trucker } from "@/types";

export function CoordinatorView() {
  useRoleSession("coordinator");
  const shipments = useAppStore((s) => s.shipments);
  const carriers = useAppStore((s) => s.carriers);
  const truckers = useAppStore((s) => s.truckers);
  const assignShipment = useAppStore((s) => s.assignShipment);
  const reissueCode = useAppStore((s) => s.reissueCode);

  const [orderOpen, setOrderOpen] = useState(false);
  const [driverDialog, setDriverDialog] = useState<{ open: boolean; driver: Trucker | null }>({
    open: false,
    driver: null,
  });
  const [assigning, setAssigning] = useState<Shipment | null>(null);
  const [truckerId, setTruckerId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function openAssignDialog(shipment: Shipment) {
    setAssigning(shipment);
    setTruckerId(shipment.truckerId ?? "");
  }

  async function confirmAssignment() {
    if (!assigning || !truckerId) return;
    setSubmitting(true);
    try {
      await assignShipment(assigning.id, truckerId);
      const trucker = truckers.find((t) => t.id === truckerId);
      toast.success(`${assigning.referenceCode} sent to ${trucker?.name}`, {
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
          <Button variant="outline" onClick={() => setDriverDialog({ open: true, driver: null })}>
            <UserPlus className="size-4" />
            Add driver
          </Button>
          <Button onClick={() => setOrderOpen(true)}>
            <PackagePlus className="size-4" />
            New delivery order
          </Button>
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Delivery orders ({shipments.length})</TabsTrigger>
          <TabsTrigger value="drivers">Drivers ({truckers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delivery orders</CardTitle>
              <CardDescription>Create orders, assign drivers, and track them to the dock.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Pickup &rarr; drop-off</TableHead>
                    <TableHead>Pickup time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((shipment) => {
                    const trucker = truckers.find((t) => t.id === shipment.truckerId);
                    const canAssign = ["unassigned", "assigned", "en_route"].includes(shipment.status);
                    return (
                      <TableRow key={shipment.id}>
                        <TableCell>
                          <div className="font-medium">{shipment.referenceCode}</div>
                          <div className="max-w-48 truncate text-xs text-muted-foreground">
                            {shipment.cargo || "—"}
                          </div>
                        </TableCell>
                        <TableCell
                          className="max-w-64 whitespace-normal text-xs text-muted-foreground"
                          title={`${shipment.pickupLocation} → ${shipment.dropoffLocation}`}
                        >
                          {shortPlace(shipment.pickupLocation)} &rarr; {shortPlace(shipment.dropoffLocation)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatPickup(shipment.pickupDate, shipment.pickupTime)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={shipment.status} />
                          {shipment.locked && (
                            <div className="mt-1 text-xs font-medium text-destructive">Pass locked</div>
                          )}
                          {shipment.status === "unassigned" && shipment.declinedBy && (
                            <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                              Declined by {shipment.declinedBy}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {trucker ? (
                            <div className="flex items-center gap-2">
                              <DriverAvatar photo={trucker.photo} name={trucker.name} className="size-7 rounded-md" />
                              <div>
                                <div className="font-medium text-foreground">{trucker.name}</div>
                                <div className="text-muted-foreground">{shipment.carrierName}</div>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {shipment.locked && (
                              <Button size="sm" variant="destructive" onClick={() => handleReissue(shipment)}>
                                Reissue pass
                              </Button>
                            )}
                            {canAssign && (
                              <Button
                                size="sm"
                                variant={trucker ? "outline" : "default"}
                                onClick={() => openAssignDialog(shipment)}
                              >
                                {trucker ? "Reassign" : "Assign driver"}
                              </Button>
                            )}
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
                  {truckers.map((t) => {
                    const carrier = carriers.find((c) => c.id === t.carrierId);
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <DriverAvatar photo={t.photo} name={t.name} />
                            <div>
                              <div className="font-medium">{t.name}</div>
                              <div className="text-xs text-muted-foreground">{t.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{t.phone}</TableCell>
                        <TableCell className="font-mono text-xs">{t.licenseNumber}</TableCell>
                        <TableCell className="text-xs">
                          {carrier?.name}
                          {carrier && carrier.cvorStatus !== "active" && (
                            <div className="font-medium text-destructive">CVOR {carrier.cvorStatus}</div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal text-xs">
                          <div className="font-mono font-medium">{t.vehiclePlate}</div>
                          <div className="text-muted-foreground">{t.vehicleDescription}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setDriverDialog({ open: true, driver: t })}>
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
      </Tabs>

      <OrderDialog open={orderOpen} onOpenChange={setOrderOpen} />
      <DriverDialog
        open={driverDialog.open}
        driver={driverDialog.driver}
        onOpenChange={(open) => setDriverDialog((d) => ({ ...d, open }))}
      />

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
              <DriverSelect id="assign-driver" value={truckerId} onChange={setTruckerId} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button disabled={!truckerId || submitting} onClick={confirmAssignment}>
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
