import { Link, Outlet, useLocation } from "react-router-dom";
import { Truck, ClipboardCheck, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppStore } from "@/store/useAppStore";

const NAV_ITEMS = [
  { to: "/coordinator", label: "Logistics Coordinator", icon: ClipboardCheck },
  { to: "/trucker", label: "Trucker", icon: Truck },
  { to: "/clerk", label: "Receiving Clerk", icon: Warehouse },
];

export function AppShell() {
  const location = useLocation();
  const error = useAppStore((s) => s.error);

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Truck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">TruTruck</p>
              <p className="text-xs text-muted-foreground">Dispatch &amp; pickup verification</p>
            </div>
          </div>

          <nav className="flex gap-1 rounded-lg bg-muted p-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
              const active = location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Connection problem</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Outlet />
      </main>

      <Toaster position="top-right" />
    </div>
  );
}
