import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackageSearch } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAppStore } from "@/store/useAppStore";
import type { Shipment } from "@/types";

export function CoordinatorView() {
  const shipments = useAppStore((s) => s.shipments);
  const carriers = useAppStore((s) => s.carriers);
  const truckers = useAppStore((s) => s.truckers);
  const assignShipment = useAppStore((s) => s.assignShipment);

  const [assigning, setAssigning] = useState<Shipment | null>(null);
  const [carrierId, setCarrierId] = useState<string>("");
  const [truckerId, setTruckerId] = useState<string>("");

  const availableTruckers = useMemo(
    () => truckers.filter((t) => t.carrierId === carrierId),
    [truckers, carrierId],
  );

  function openAssignDialog(shipment: Shipment) {
    setAssigning(shipment);
    setCarrierId(shipment.carrierId ?? "");
    setTruckerId(shipment.truckerId ?? "");
  }

  function confirmAssignment() {
    if (!assigning || !carrierId || !truckerId) return;
    assignShipment(assigning.id, carrierId, truckerId);
    const trucker = truckers.find((t) => t.id === truckerId);
    const carrier = carriers.find((c) => c.id === carrierId);
    toast.success(`${assigning.referenceCode} dispatched`, {
      description: `${trucker?.name} (${carrier?.name}) has been notified.`,
    });
    setAssigning(null);
  }

  const unassignedCount = shipments.filter((s) => s.status === "unassigned").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shipments</h1>
        <p className="text-sm text-muted-foreground">
          {unassignedCount > 0
            ? `${unassignedCount} shipment${unassignedCount === 1 ? "" : "s"} waiting on a carrier assignment.`
            : "All shipments have a carrier assigned."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All shipments</CardTitle>
          <CardDescription>Assign and dispatch a trucker/carrier for pickup.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shipment</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Carrier / Trucker</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((shipment) => {
                const carrier = carriers.find((c) => c.id === shipment.carrierId);
                const trucker = truckers.find((t) => t.id === shipment.truckerId);
                return (
                  <TableRow key={shipment.id}>
                    <TableCell>
                      <div className="font-medium">{shipment.referenceCode}</div>
                      <div className="max-w-56 truncate text-xs text-muted-foreground">
                        {shipment.what}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal text-xs text-muted-foreground">
                      {shipment.origin.split(" - ")[1] ?? shipment.origin} &rarr;{" "}
                      {shipment.destination}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{shipment.pickupDate}</div>
                      <div className="text-muted-foreground">{shipment.pickupWindow}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={shipment.status} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {trucker ? (
                        <>
                          <div className="font-medium text-foreground">{trucker.name}</div>
                          <div className="text-muted-foreground">{carrier?.name}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={trucker ? "outline" : "default"} onClick={() => openAssignDialog(shipment)}>
                        {trucker ? "Reassign" : "Assign & dispatch"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={assigning !== null} onOpenChange={(open) => !open && setAssigning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageSearch className="size-4" />
              Assign {assigning?.referenceCode}
            </DialogTitle>
            <DialogDescription>
              Choose a carrier and trucker. They'll be notified with the pickup details.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs">
              <p><span className="text-muted-foreground">What: </span>{assigning?.what}</p>
              <p><span className="text-muted-foreground">Where: </span>{assigning?.origin}</p>
              <p>
                <span className="text-muted-foreground">When: </span>
                {assigning?.pickupDate} &middot; {assigning?.pickupWindow}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="carrier">Carrier</Label>
              <Select
                value={carrierId}
                onValueChange={(value) => {
                  setCarrierId(value);
                  setTruckerId("");
                }}
              >
                <SelectTrigger id="carrier" className="w-full">
                  <SelectValue placeholder="Select a carrier" />
                </SelectTrigger>
                <SelectContent>
                  {carriers.map((carrier) => (
                    <SelectItem key={carrier.id} value={carrier.id}>
                      {carrier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trucker">Trucker</Label>
              <Select value={truckerId} onValueChange={setTruckerId} disabled={!carrierId}>
                <SelectTrigger id="trucker" className="w-full">
                  <SelectValue placeholder={carrierId ? "Select a trucker" : "Select a carrier first"} />
                </SelectTrigger>
                <SelectContent>
                  {availableTruckers.map((trucker) => (
                    <SelectItem key={trucker.id} value={trucker.id}>
                      {trucker.name} &middot; {trucker.vehiclePlate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancel
            </Button>
            <Button disabled={!carrierId || !truckerId} onClick={confirmAssignment}>
              Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
