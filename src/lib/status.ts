import type { ShipmentStatus } from "@/types";

/** The three overall stages an order moves through. Each has one colour everywhere. */
export type StatusGroup = "pending" | "active" | "closed";

export const STATUS_GROUPS: {
  id: StatusGroup;
  label: string;
  statuses: ShipmentStatus[];
  /** Status badge colours. */
  badge: string;
  /** Filter dropdown trigger when not selected / selected. */
  soft: string;
  solid: string;
  dot: string;
}[] = [
  {
    id: "pending",
    label: "Pending",
    statuses: ["unassigned", "assigned"],
    badge: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    soft: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20",
    solid: "border-amber-500 bg-amber-500 text-white hover:bg-amber-500/90 dark:text-amber-950",
    dot: "bg-amber-500",
  },
  {
    id: "active",
    label: "In progress",
    statuses: ["en_route", "at_warehouse", "verified"],
    badge: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    soft: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20",
    solid: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600/90",
    dot: "bg-emerald-600",
  },
  {
    id: "closed",
    label: "Closed",
    statuses: ["in_transit", "cancelled"],
    badge: "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
    soft: "border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20",
    solid: "border-blue-600 bg-blue-600 text-white hover:bg-blue-600/90",
    dot: "bg-blue-600",
  },
];

export function statusGroup(status: ShipmentStatus) {
  return STATUS_GROUPS.find((g) => g.statuses.includes(status))!;
}
