import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** Square ID-style photo. Falls back to an icon when no photo is on file. */
export function DriverAvatar({
  photo,
  name,
  className,
}: {
  photo?: string;
  name: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground",
        className,
      )}
    >
      {photo ? (
        <img src={photo} alt={`Photo of ${name}`} className="size-full object-cover" />
      ) : (
        <UserRound className="size-1/2" />
      )}
    </div>
  );
}
