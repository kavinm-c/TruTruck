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
    badge: "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
    soft: "border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20",
    solid: "border-violet-600 bg-violet-600 text-white hover:bg-violet-600/90",
    dot: "bg-violet-600",
  },
  {
    id: "closed",
    label: "Closed",
    statuses: ["in_transit", "cancelled"],
    badge: "border-transparent bg-slate-100 text-slate-800 dark:bg-slate-500/15 dark:text-slate-300",
    soft: "border-slate-300 bg-slate-50 text-slate-900 hover:bg-slate-100 dark:border-slate-500/40 dark:bg-slate-500/10 dark:text-slate-200 dark:hover:bg-slate-500/20",
    solid: "border-slate-600 bg-slate-600 text-white hover:bg-slate-600/90",
    dot: "bg-slate-600",
  },
];

export function statusGroup(status: ShipmentStatus) {
  return STATUS_GROUPS.find((g) => g.statuses.includes(status))!;
}
