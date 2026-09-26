import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  checkInByHour,
  dailyDeliveries,
  kpis,
  onTimeByCarrier,
  rejectionReasons,
} from "@/data/dashboardData";

// Chart chrome. Colors come from --viz-* tokens in index.css (light + dark).
const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const GRID = { stroke: "var(--viz-grid)", strokeWidth: 1 };
const AXIS_LINE = { stroke: "var(--viz-axis)" };
const HOVER_WASH = { fill: "var(--muted)", opacity: 0.6 };

interface TooltipRow {
  name?: string | number;
  value?: unknown;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  format = (v) => String(v),
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipRow>;
  label?: string | number;
  format?: (value: unknown) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((row) => (
        <div key={String(row.name)} className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: row.color }} />
          <span className="text-muted-foreground">{row.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{format(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Chart card with a "View data" table so values never depend on reading the chart. */
function ChartCard({
  title,
  description,
  legend,
  columns,
  rows,
  className,
  children,
}: {
  title: string;
  description: string;
  legend?: ReactNode;
  columns: string[];
  rows: (string | number)[][];
  className?: string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showTable ? "View chart" : "View data"}
          </button>
        </div>
        {legend && !showTable && <div className="pt-1">{legend}</div>}
      </CardHeader>
      <CardContent>
        {showTable ? (
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  {columns.map((c, i) => (
                    <th key={c} className={cn("py-1.5 font-medium", i > 0 && "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row[0])} className="border-b last:border-0">
                    {row.map((cell, i) => (
                      <td key={i} className={cn("py-1.5", i > 0 && "text-right tabular-nums")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-64">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">Sample data for the demo. Not yet connected to live orders.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
              <span className="text-2xl font-semibold tracking-tight">{kpi.value}</span>
              <span
                className={cn(
                  "text-xs",
                  kpi.good ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                )}
              >
                {kpi.delta}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          className="lg:col-span-2"
          title="Daily deliveries"
          description="Last 14 days, delivered vs cancelled orders"
          legend={
            <Legend
              items={[
                { label: "Delivered", color: "var(--viz-series-1)" },
                { label: "Cancelled", color: "var(--viz-series-2)" },
              ]}
            />
          }
          columns={["Day", "Delivered", "Cancelled"]}
          rows={dailyDeliveries.map((d) => [d.day, d.delivered, d.cancelled])}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyDeliveries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} {...GRID} />
              <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={HOVER_WASH}
                content={({ active, payload, label }) => (
                  <ChartTooltip active={active} payload={payload} label={label} />
                )}
              />
              {/* The surface-colored stroke is the 2px gap between stacked segments. */}
              <Bar
                dataKey="delivered"
                name="Delivered"
                stackId="orders"
                fill="var(--viz-series-1)"
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={24}
              />
              <Bar
                dataKey="cancelled"
                name="Cancelled"
                stackId="orders"
                fill="var(--viz-series-2)"
                stroke="var(--card)"
                strokeWidth={2}
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Rejected check-ins by reason"
          description="Last 30 days, passes the dock refused"
          columns={["Reason", "Rejections"]}
          rows={rejectionReasons.map((r) => [r.reason, r.count])}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rejectionReasons} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} {...GRID} />
              <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="reason"
                width={170}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={AXIS_LINE}
              />
              <Tooltip
                cursor={HOVER_WASH}
                content={({ active, payload, label }) => (
                  <ChartTooltip active={active} payload={payload} label={label} />
                )}
              />
              <Bar dataKey="count" name="Rejections" fill="var(--viz-series-1)" radius={[0, 4, 4, 0]} maxBarSize={20}>
                <LabelList dataKey="count" position="right" fill="var(--muted-foreground)" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="On-time pickups by carrier"
          description="Share of pickups within the booked window, last 30 days"
          columns={["Carrier", "On time"]}
          rows={onTimeByCarrier.map((c) => [c.carrier, `${c.rate}%`])}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={onTimeByCarrier} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} {...GRID} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="carrier"
                width={170}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={AXIS_LINE}
              />
              <Tooltip
                cursor={HOVER_WASH}
                content={({ active, payload, label }) => (
                  <ChartTooltip active={active} payload={payload} label={label} format={(v) => `${v}%`} />
                )}
              />
              <Bar dataKey="rate" name="On time" fill="var(--viz-series-1)" radius={[0, 4, 4, 0]} maxBarSize={20}>
                <LabelList
                  dataKey="rate"
                  position="right"
                  fill="var(--muted-foreground)"
                  fontSize={12}
                  formatter={(v) => `${v}%`}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Dock check-in time by hour"
          description="Median minutes from arrival to verified, by hour of day"
          columns={["Hour", "Median minutes"]}
          rows={checkInByHour.map((h) => [h.hour, h.minutes.toFixed(1)])}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={checkInByHour} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} {...GRID} />
              <XAxis dataKey="hour" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}m`} />
              <Tooltip
                cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload}
                    label={label}
                    format={(v) => `${Number(v).toFixed(1)} min`}
                  />
                )}
              />
              <Line
                type="monotone"
                dataKey="minutes"
                name="Median check-in"
                stroke="var(--viz-series-1)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
