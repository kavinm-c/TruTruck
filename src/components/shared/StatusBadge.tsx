import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SHIPMENT_STATUS_LABEL, type ShipmentStatus } from "@/types";

const STATUS_CLASSES: Record<ShipmentStatus, string> = {
  unassigned: "border-border bg-muted text-muted-foreground",
  assigned: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  en_route: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  at_warehouse:
    "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  verified: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  in_transit: "border-transparent bg-slate-800 text-slate-50 dark:bg-slate-200 dark:text-slate-900",
};

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_CLASSES[status])}>
      {SHIPMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
