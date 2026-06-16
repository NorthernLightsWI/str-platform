"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"

export type OccupancyDataPoint = { name: string; occupancy: number }

function barColor(pct: number) {
  if (pct >= 70) return "#4ade80"
  if (pct >= 40) return "#facc15"
  return "#f87171"
}

export function OccupancyChart({ data }: { data: OccupancyDataPoint[] }) {
  const height = Math.max(240, data.length * 30)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ left: 0, right: 24, top: 0, bottom: 0 }}
        barCategoryGap="28%"
      >
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => v + "%"}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={168}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{
            backgroundColor: "#0e1014",
            border: "1px solid rgba(111,161,175,0.2)",
            borderRadius: "8px",
            fontSize: "12px",
            color: "#f5f5f5",
          }}
          formatter={(value: number) => [value + "%", "Occupancy"]}
        />
        <Bar dataKey="occupancy" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={barColor(d.occupancy)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
