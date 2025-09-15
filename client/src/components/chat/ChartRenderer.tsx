"use client"

import React from "react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
} from "recharts"

export default function ChartRenderer({ labels, dataset }: { labels: string[]; dataset?: { label: string; data: number[] } }) {
  const data = React.useMemo(() => labels.map((l, i) => ({ name: l, value: dataset?.data?.[i] ?? 0 })), [labels, dataset])
  const isTime = labels.length > 0 && /\d{4}-\d{2}/.test(labels[0])

  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        {isTime ? (
          <LineChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <ReTooltip />
            <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={0} height={40} />
            <YAxis tick={{ fontSize: 11 }} />
            <ReTooltip />
            <Bar dataKey="value" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
