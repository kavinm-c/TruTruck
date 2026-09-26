import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DriverSelect, NO_DRIVER } from "@/components/coordinator/DriverSelect";
import { useAppStore } from "@/store/useAppStore";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EMPTY = {
  cargo: "",
  pickupLocation: "",
  dropoffLocation: "",
  pickupDate: "",
  pickupTime: "09:00",
  driverId: NO_DRIVER,
};

export function OrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Content unmounts when closed, so the form starts fresh on every open. */}
        <OrderForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function OrderForm({ onDone }: { onDone: () => void }) {
  const createOrder = useAppStore((s) => s.createOrder);
  const drivers = useAppStore((s) => s.drivers);
  const [form, setForm] = useState(() => ({ ...EMPTY, pickupDate: today() }));
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof EMPTY, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { driverId, ...rest } = form;
      const order = await createOrder({ ...rest, driverId: driverId === NO_DRIVER ? undefined : driverId });
      const driver = drivers.find((d) => d.id === order.driverId);
      toast.success(`${order.referenceCode} created`, {
        description: driver
          ? `Delivery request sent to ${driver.name}. Their pass unlocks once they accept.`
          : "Assign a driver when you're ready.",
      });
      onDone();
    } catch (err) {
      toast.error("Couldn'd create order", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New delivery order</DialogTitle>
        <DialogDescription>
          The assigned driver gets a request to accept. Once they do, their phone shows a rotating QR pass.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-pickup">Pickup location</Label>
        <Input
          id="order-pickup"
          required
          placeholder="Warehouse 4 - 8 Industrial Pkwy, Brampton, ON"
          value={form.pickupLocation}
          onChange={(e) => set("pickupLocation", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-dropoff">Drop-off location</Label>
        <Input
          id="order-dropoff"
          required
          placeholder="Distribution Centre B - 1450 Innes Rd, Ottawa, ON"
          value={form.dropoffLocation}
          onChange={(e) => set("dropoffLocation", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-date">Pickup date</Label>
          <Input
            id="order-date"
            type="date"
            required
            min={today()}
            value={form.pickupDate}
            onChange={(e) => set("pickupDate", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="order-time">Pickup time</Label>
          <Input
            id="order-time"
            type="time"
            required
            value={form.pickupTime}
            onChange={(e) => set("pickupTime", e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-cargo">Cargo (optional)</Label>
        <Input
          id="order-cargo"
          placeholder="e.g. 24 pallets of packaged electronics"
          value={form.cargo}
          onChange={(e) => set("cargo", e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="order-driver">Driver</Label>
        <DriverSelect id="order-driver" allowNone value={form.driverId} onChange={(v) => set("driverId", v)} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : form.driverId === NO_DRIVER ? "Create order" : "Create & send to driver"}
        </Button>
      </DialogFooter>
    </form>
  );
}
