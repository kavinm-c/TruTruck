// Static sample data for the coordinator dashboard. Not wired to the API yet.

export const kpis = [
  { label: "Deliveries this month", value: "1,248", delta: "+8.2% vs last month", good: true },
  { label: "Verified on first scan", value: "96.4%", delta: "+1.1 pts", good: true },
  { label: "Median dock check-in", value: "2m 41s", delta: "38s faster", good: true },
  { label: "Fraud attempts blocked", value: "23", delta: "forged, replayed or locked passes", good: false },
];

/** Last 14 days. */
export const dailyDeliveries = [
  { day: "Sep 13", delivered: 38, cancelled: 2 },
  { day: "Sep 14", delivered: 22, cancelled: 1 },
  { day: "Sep 15", delivered: 41, cancelled: 3 },
  { day: "Sep 16", delivered: 45, cancelled: 2 },
  { day: "Sep 17", delivered: 43, cancelled: 4 },
  { day: "Sep 18", delivered: 47, cancelled: 1 },
  { day: "Sep 19", delivered: 44, cancelled: 2 },
  { day: "Sep 20", delivered: 26, cancelled: 0 },
  { day: "Sep 21", delivered: 19, cancelled: 1 },
  { day: "Sep 22", delivered: 46, cancelled: 3 },
  { day: "Sep 23", delivered: 50, cancelled: 2 },
  { day: "Sep 24", delivered: 48, cancelled: 5 },
  { day: "Sep 25", delivered: 52, cancelled: 2 },
  { day: "Sep 26", delivered: 31, cancelled: 1 },
];

/** Last 30 days, sorted by count. */
export const rejectionReasons = [
  { reason: "Expired or wrong code", count: 31 },
  { reason: "Plate mismatch", count: 12 },
  { reason: "Code reused", count: 9 },
  { reason: "Carrier CVOR lapsed", count: 7 },
  { reason: "ID didn't match photo", count: 5 },
  { reason: "Tampered QR", count: 2 },
];

export const onTimeByCarrier = [
  { carrier: "Ironwood Logistics", rate: 97 },
  { carrier: "Redline Freight Co.", rate: 94 },
  { carrier: "Pacific Crest Hauling", rate: 89 },
  { carrier: "QuickHaul Express", rate: 71 },
];

/** Median minutes from arrival to verified, by hour of day. */
export const checkInByHour = [
  { hour: "6 AM", minutes: 1.8 },
  { hour: "7 AM", minutes: 2.4 },
  { hour: "8 AM", minutes: 3.9 },
  { hour: "9 AM", minutes: 4.6 },
  { hour: "10 AM", minutes: 3.1 },
  { hour: "11 AM", minutes: 2.5 },
  { hour: "12 PM", minutes: 2.2 },
  { hour: "1 PM", minutes: 3.4 },
  { hour: "2 PM", minutes: 2.9 },
  { hour: "3 PM", minutes: 2.3 },
  { hour: "4 PM", minutes: 1.9 },
  { hour: "5 PM", minutes: 1.6 },
];
