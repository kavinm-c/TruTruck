/** "2026-09-26" + "13:00" -> "Sat, Sep 26 · 1:00 PM" (in the viewer's locale). */
export function formatPickup(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const when = new Date(y, m - 1, d, hh, mm);
  if (Number.isNaN(when.getTime())) return `${date} ${time}`;
  const day = when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const clock = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${clock}`;
}

/** "Warehouse 4 - 8 Industrial Pkwy, Brampton, ON" -> "Brampton, ON" */
export function shortPlace(location: string): string {
  const parts = location.split(",").map((p) => p.trim());
  return parts.length >= 2 ? parts.slice(-2).join(", ") : location;
}

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/** ISO timestamp -> "1:05 PM" today, otherwise "Sep 25, 1:05 PM". */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}
