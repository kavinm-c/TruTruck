import { CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusGroup } from "@/lib/status";
import { cn } from "@/lib/utils";
import { SHIPMENT_STATUS_LABEL, type ShipmentStatus } from "@/types";

/** Coloured by overall stage (pending / in progress / closed); the label keeps the exact status. */
export function StatusBadge({ status, className }: { status: ShipmentStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", statusGroup(status).badge, className)}>
      {status === "verified" && <CircleCheck className="size-3.5" aria-hidden />}
      {status === "cancelled" && <CircleX className="size-3.5" aria-hidden />}
      {SHIPMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
