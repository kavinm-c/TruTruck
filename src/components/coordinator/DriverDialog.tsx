import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DriverAvatar } from "@/components/shared/DriverAvatar";
import { photoToDataUrl } from "@/lib/image";
import { useAppStore } from "@/store/useAppStore";
import type { DriverInput, Driver } from "@/types";

const EMPTY: DriverInput = {
  name: "",
  phone: "",
  email: "",
  photo: undefined,
  carrierId: "",
  licenseNumber: "",
  vehiclePlate: "",
  vehicleDescription: "",
};

/** Add a new driver, or edit one when `driver` is passed. */
export function DriverDialog({
  open,
  driver,
  onOpenChange,
}: {
  open: boolean;
  driver?: Driver | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Content unmounts when closed, so the form starts fresh on every open. */}
        <DriverForm key={driver?.id ?? "new"} driver={driver ?? null} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function DriverForm({ driver, onDone }: { driver: Driver | null; onDone: () => void }) {
  const carriers = useAppStore((s) => s.carriers);
  const createDriver = useAppStore((s) => s.createDriver);
  const updateDriver = useAppStore((s) => s.updateDriver);

  const [form, setForm] = useState<DriverInput>(() => (driver ? { ...EMPTY, ...driver } : EMPTY));
  const [photoChanged, setPhotoChanged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof DriverInput>(key: K, value: DriverInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    try {
      set("photo", await photoToDataUrl(file));
      setPhotoChanged(true);
    } catch (e) {
      toast.error("Couldn't use that photo", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.photo) {
      toast.error("A photo is required", { description: "The receiving clerk uses it to confirm who's at the dock." });
      return;
    }
    setSubmitting(true);
    try {
      if (driver) {
        // Only send the photo if it changed; the server keeps the existing one otherwise.
        const { photo: _unchangedPhoto, ...rest } = form;
        await updateDriver(driver.id, photoChanged ? form : rest);
        toast.success(`${form.name} updated`);
      } else {
        await createDriver(form);
        toast.success(`${form.name} added`, { description: "They can now be assigned to delivery orders." });
      }
      onDone();
    } catch (err) {
      toast.error("Couldn't save driver", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{driver ? `Edit ${driver.name}` : "Add driver"}</DialogTitle>
        <DialogDescription>
          These details appear on the driver's pass and are what the receiving clerk checks at the dock.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-4">
        <DriverAvatar photo={form.photo} name={form.name || "new driver"} className="size-20" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="driver-photo">Photo</Label>
          <Button type="button" variant="outline" size="sm" asChild>
            <label htmlFor="driver-photo" className="cursor-pointer">
              <Camera className="size-3.5" />
              {form.photo ? "Replace photo" : "Upload photo"}
            </label>
          </Button>
          <input
            id="driver-photo"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void handlePhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">Clear, front-facing. Cropped to a square.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="driver-name" label="Full name">
          <Input id="driver-name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field id="driver-license" label="Licence number">
          <Input
            id="driver-license"
            required
            placeholder="A1234-56789-01234"
            value={form.licenseNumber}
            onChange={(e) => set("licenseNumber", e.target.value.toUpperCase())}
          />
        </Field>
        <Field id="driver-phone" label="Phone number">
          <Input
            id="driver-phone"
            type="tel"
            required
            placeholder="(905) 555-0100"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field id="driver-email" label="Email">
          <Input
            id="driver-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field id="driver-carrier" label="Carrier">
          <Select value={form.carrierId} onValueChange={(v) => set("carrierId", v)} required>
            <SelectTrigger id="driver-carrier" className="w-full">
              <SelectValue placeholder="Select a carrier" />
            </SelectTrigger>
            <SelectContent>
              {carriers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.cvorStatus !== "active" && ` (CVOR ${c.cvorStatus})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="driver-plate" label="Vehicle plate">
          <Input
            id="driver-plate"
            required
            placeholder="AB12 345"
            value={form.vehiclePlate}
            onChange={(e) => set("vehiclePlate", e.target.value.toUpperCase())}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id="driver-vehicle" label="Vehicle description">
            <Input
              id="driver-vehicle"
              placeholder="White Freightliner Cascadia, 53' dry van"
              value={form.vehicleDescription}
              onChange={(e) => set("vehicleDescription", e.target.value)}
            />
          </Field>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !form.carrierId}>
          {submitting ? "Saving…" : driver ? "Save changes" : "Add driver"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
