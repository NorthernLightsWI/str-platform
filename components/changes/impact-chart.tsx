"use client"

import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts"
import type { WeeklyPoint } from "@/lib/change-impact"

interface Props {
  data: WeeklyPoint[]
}

export function ImpactChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Not enough data to render chart
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />

        <XAxis
          dataKey="weekLabel"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />

        {/* Left Y: occupancy % */}
        <YAxis
          yAxisId="occ"
          orientation="left"
          domain={[0, 100]}
          tickFormatter={v => `${v}%`}
          tick={{ fill: "#6b7280", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />

        {/* Right Y: ADR */}
        <YAxis
          yAxisId="adr"
          orientation="right"
          tickFormatter={v => `$${v}`}
          tick={{ fill: "#6b7280", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />

        <Tooltip
          contentStyle={{
            background : "#181b20",
            border     : "1px solid rgba(255,255,255,0.1)",
            borderRadius: "8px",
            fontSize   : 12,
            color      : "#e5e7eb",
          }}
          formatter={(value, name) => {
            const v = Number(value)
            if (String(name).includes("Occ")) return [`${v.toFixed(1)}%`, name]
            return [`$${v.toFixed(0)}`, name]
          }}
        />

        <Legend
          wrapperStyle={{ fontSize: 11, color: "#9ca3af", paddingTop: 8 }}
        />

        {/* Marker line at the change week */}
        <ReferenceLine
          x="W0"
          yAxisId="occ"
          stroke="#E88159"
          strokeDasharray="4 2"
          strokeWidth={1.5}
          label={{ value: "Change", position: "top", fill: "#E88159", fontSize: 10 }}
        />

        {/* Occupancy lines */}
        <Line
          yAxisId="occ"
          type="monotone"
          dataKey="propOcc"
          name="Property Occ %"
          stroke="#E88159"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#E88159" }}
        />
        <Line
          yAxisId="occ"
          type="monotone"
          dataKey="ctrlOcc"
          name="Control Occ %"
          stroke="#E88159"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          activeDot={{ r: 3, fill: "#E88159" }}
          strokeOpacity={0.5}
        />

        {/* ADR lines */}
        <Line
          yAxisId="adr"
          type="monotone"
          dataKey="propAdr"
          name="Property ADR"
          stroke="#6FA1AF"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#6FA1AF" }}
        />
        <Line
          yAxisId="adr"
          type="monotone"
          dataKey="ctrlAdr"
          name="Control ADR"
          stroke="#6FA1AF"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          activeDot={{ r: 3, fill: "#6FA1AF" }}
          strokeOpacity={0.5}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
