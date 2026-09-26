import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/useAppStore";

export const NO_DRIVER = "none";

/** Driver picker that flags drivers whose carrier can't currently be dispatched. */
export function DriverSelect({
  id,
  value,
  onChange,
  allowNone = false,
}: {
  id: string;
  value: string;
  onChange: (truckerId: string) => void;
  allowNone?: boolean;
}) {
  const truckers = useAppStore((s) => s.truckers);
  const carriers = useAppStore((s) => s.carriers);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select a driver" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NO_DRIVER}>Assign later</SelectItem>}
        {truckers.map((t) => {
          const carrier = carriers.find((c) => c.id === t.carrierId);
          const blocked = carrier && carrier.cvorStatus !== "active";
          return (
            <SelectItem key={t.id} value={t.id}>
              {t.name} &middot; {carrier?.name ?? "No carrier"}
              {blocked && <span className="text-destructive"> (CVOR {carrier.cvorStatus})</span>}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
