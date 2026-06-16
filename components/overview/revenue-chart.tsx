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

export type RevenueDataPoint = { month: string; revenue: number }

function fmt(n: number) {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000)     return "$" + (n / 1_000).toFixed(0) + "K"
  return "$" + n
}

export function RevenueChart({ data }: { data: RevenueDataPoint[] }) {
  const lastIdx = data.length - 1

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barCategoryGap="32%">
        <XAxis
          dataKey="month"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
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
          formatter={(value: number) => [fmt(value), "Revenue"]}
        />
        <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === lastIdx ? "#6FA1AF" : "#2a2e35"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
