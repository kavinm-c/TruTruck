import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildPass } from "@/lib/pass";
import { currentStep, secondsRemaining, totpAt, TOTP_PERIOD_SECONDS } from "@/lib/totp";
import type { Shipment, Driver } from "@/types";

/**
 * Authenticator-style pass: a QR (driver + delivery details + current code)
 * and the 6-digit code, both rotating every 30 seconds. Computed on-device
 * from the shipment's secret.
 */
export function DriverPass({ shipment, driver }: { shipment: Shipment; driver: Driver }) {
  const secret = shipment.totpSecret;
  const [code, setCode] = useState<string | null>(null);
  const [left, setLeft] = useState(secondsRemaining());

  useEffect(() => {
    if (!secret) return;
    let cancelled = false;
    let lastStep = -1;

    async function tick() {
      const now = Date.now();
      setLeft(secondsRemaining(now));
      const step = currentStep(now);
      if (step === lastStep) return;
      lastStep = step;
      const next = await totpAt(secret!, step);
      if (!cancelled) setCode(next);
    }

    void tick();
    const timer = setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [secret]);

  if (!secret || !code) return null;

  const expiring = left <= 5;

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/40 p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="size-3.5" />
        Live pickup pass &middot; {shipment.referenceCode}
      </div>

      {/* Always dark-on-white so scanners can read it in dark mode too. */}
      <div className="rounded-lg bg-white p-3">
        <QRCodeSVG
          value={buildPass(shipment, driver, code)}
          size={208}
          level="M"
          marginSize={1}
          title={`Pickup pass for ${shipment.referenceCode}`}
        />
      </div>

      <div className="font-mono text-3xl font-semibold tracking-[0.2em]" aria-live="polite">
        {code.slice(0, 3)} {code.slice(3)}
      </div>

      <div className="flex w-full max-w-60 flex-col gap-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-linear",
              expiring ? "bg-amber-500" : "bg-primary",
            )}
            style={{ width: `${(left / TOTP_PERIOD_SECONDS) * 100}%` }}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">New code in {left}s</p>
      </div>
    </div>
  );
}
