"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ChartNoAxesCombined, ChartPie, ChartBarIncreasing, ChartBarDecreasing, FileChartColumn, Activity, ShieldAlert, ClipboardList, ClipboardCheck, RefreshCw, Upload, Database } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import Image from "next/image"
import MobileSectionNav from "@/components/MobileSectionNav"

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Lightbulb } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts"

type KPI = {
  label: string
  value: number
  delta: number | null // percentage change; null means don't show
}

type SimpleDatum = { name: string; value: number }
type TrendDatum = { month: string; value: number }
type GroupDatum = { name: string; [series: string]: number | string }
type HeatMatrix = { x_labels: string[]; y_labels: string[]; values: number[][]; min: number; max: number; title?: string }

type ApiState<T> = {
  loading: boolean
  error: string | null
  data: T | null
}

type SafetyDashboardProps = {
  className?: string
  style?: React.CSSProperties
}

// Enhanced palette with harmonious green shades for better series distinction
const CHART_COLORS = [
  "#16a34a", // emerald-600
  "#22c55e", // green-500
  "#84cc16", // lime-500
  "#65a30d", // olive
  "#166534", // emerald-900
  "#4ade80", // green-300
  "#a3e635", // lime-300
  "#10b981", // emerald-500
]

// Generate n green shades (as HEX) for pie slices to avoid grayscale in some environments
function greenPalette(n: number): string[] {
  const colors: string[] = []
  const N = Math.max(1, n)
  const h = 140 // green hue
  const s = 0.75
  // helper HSL -> HEX
  const hslToHex = (hh: number, ss: number, ll: number) => {
    const c = (1 - Math.abs(2 * ll - 1)) * ss
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
    const m = ll - c / 2
    let r = 0, g = 0, b = 0
    if (0 <= hh && hh < 60) [r, g, b] = [c, x, 0]
    else if (60 <= hh && hh < 120) [r, g, b] = [x, c, 0]
    else if (120 <= hh && hh < 180) [r, g, b] = [0, c, x]
    else if (180 <= hh && hh < 240) [r, g, b] = [0, x, c]
    else if (240 <= hh && hh < 300) [r, g, b] = [x, 0, c]
    else [r, g, b] = [c, 0, x]
    const toHex = (v: number) => {
      const hv = Math.round((v + m) * 255).toString(16).padStart(2, '0')
      return hv
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0.5 : i / (N - 1)
    // Lightness from 0.78 (light) to 0.32 (dark) for better contrast
    const l = 0.78 - 0.46 * t
    colors.push(hslToHex(h, s, l))
  }
  return colors
}

export default function SafetyDashboard({ className, style }: SafetyDashboardProps) {
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "")
  const [kpis, setKpis] = useState<ApiState<KPI[]>>({ loading: true, error: null, data: null })

  const [entriesByCategory, setEntriesByCategory] = useState<ApiState<SimpleDatum[]>>({
    loading: true,
    error: null,
    data: null,
  })
  const [incidentHazardTypes, setIncidentHazardTypes] = useState<ApiState<SimpleDatum[]>>({
    loading: true,
    error: null,
    data: null,
  })
  const [monthlyTrends, setMonthlyTrends] = useState<ApiState<TrendDatum[]>>({
    loading: true,
    error: null,
    data: null,
  })
  const [entriesByLocation, setEntriesByLocation] = useState<ApiState<SimpleDatum[]>>({
    loading: true,
    error: null,
    data: null,
  })
  const [stackedEntriesByLocation, setStackedEntriesByLocation] = useState<ApiState<GroupDatum[]>>({
    loading: true,
    error: null,
    data: null,
  })
  const [typesByLocation, setTypesByLocation] = useState<ApiState<GroupDatum[]>>({
    loading: true,
    error: null,
    data: null,
  })
  const [proportionByLocation, setProportionByLocation] = useState<ApiState<SimpleDatum[]>>({
    loading: true,
    error: null,
    data: null,
  })
  const [statusByLocation, setStatusByLocation] = useState<ApiState<GroupDatum[]>>({
    loading: true,
    error: null,
    data: null,
  })
  const [heatmap, setHeatmap] = useState<ApiState<HeatMatrix>>({
    loading: true,
    error: null,
    data: null,
  })

  // Modular sections: Incidents & Hazards (initial set)
  const [incidentsTypes, setIncidentsTypes] = useState<ApiState<SimpleDatum[]>>({ loading: true, error: null, data: null })
  const [incidentsTopLocations, setIncidentsTopLocations] = useState<ApiState<SimpleDatum[]>>({ loading: true, error: null, data: null })
  const [hazardsMonthly, setHazardsMonthly] = useState<ApiState<TrendDatum[]>>({ loading: true, error: null, data: null })
  const [hazardsByLocation, setHazardsByLocation] = useState<ApiState<SimpleDatum[]>>({ loading: true, error: null, data: null })
  const [hazardsByRisk, setHazardsByRisk] = useState<ApiState<SimpleDatum[]>>({ loading: true, error: null, data: null })
  const [hazardsByArea, setHazardsByArea] = useState<ApiState<SimpleDatum[]>>({ loading: true, error: null, data: null })
  const [hazardsHeatmap, setHazardsHeatmap] = useState<ApiState<HeatMatrix>>({ loading: true, error: null, data: null })
  const [hazVsIncByDept, setHazVsIncByDept] = useState<ApiState<GroupDatum[]>>({ loading: true, error: null, data: null })

  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [hasUploaded, setHasUploaded] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Helper fetcher with robust error handling
  const fetchJSON = useCallback(async <T,>(url: string, opts?: RequestInit): Promise<T> => {
    const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`
    const res = await fetch(fullUrl, {
      ...opts,
      headers: {
        ...(opts?.headers || {}),
      },
      cache: "no-store",
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(text || `Request failed: ${res.status}`)
    }
    return (await res.json()) as T
  }, [])

  const refreshAll = useCallback(async () => {
    // KPIs could be constructed from multiple endpoints; here we will estimate from available ones if a unified endpoint is not defined.
    setKpis((s) => ({ ...s, loading: true, error: null }))
    setEntriesByCategory((s) => ({ ...s, loading: true, error: null }))
    setIncidentHazardTypes((s) => ({ ...s, loading: true, error: null }))
    setMonthlyTrends((s) => ({ ...s, loading: true, error: null }))
    setEntriesByLocation((s) => ({ ...s, loading: true, error: null }))
    setStackedEntriesByLocation((s) => ({ ...s, loading: true, error: null }))
    setTypesByLocation((s) => ({ ...s, loading: true, error: null }))
    setProportionByLocation((s) => ({ ...s, loading: true, error: null }))
    setStatusByLocation((s) => ({ ...s, loading: true, error: null }))
    setHeatmap((s) => ({ ...s, loading: true, error: null }))
    setIncidentsTypes((s) => ({ ...s, loading: true, error: null }))
    setIncidentsTopLocations((s) => ({ ...s, loading: true, error: null }))
    setHazardsMonthly((s) => ({ ...s, loading: true, error: null }))
    setHazardsByLocation((s) => ({ ...s, loading: true, error: null }))

    try {
      const [byCatJson, typesJson, trendsJson, byLocJson, stackedLocJson, typesLocJson, propLocJson, statusLocJson, heatJson,
        incTypesJson, incTopLocJson, hazMonthlyJson, hazLocJson, hazRiskJson, hazAreaJson, hazHeatmapJson, hazVsIncJson] =
        await Promise.all([
          fetchJSON<any>("/chart/entries-by-category"),
          fetchJSON<any>("/chart/incident-hazard-types"),
          fetchJSON<any>("/chart/monthly-trends"),
          fetchJSON<any>("/chart/entries-by-location"),
          fetchJSON<any>("/chart/stacked-entries-by-location"),
          fetchJSON<any>("/chart/types-by-location"),
          fetchJSON<any>("/chart/proportion-by-location"),
          fetchJSON<any>("/chart/status-by-location"),
          fetchJSON<any>("/chart/heatmap"),
          // Modular
          fetchJSON<any>("/chart/incidents/types"),
          fetchJSON<any>("/chart/incidents/top-locations"),
          fetchJSON<any>("/chart/hazards/monthly"),
          fetchJSON<any>("/chart/hazards/by-location"),
          // Hazards dedicated endpoints
          fetchJSON<any>("/hazards/by-risk"),
          fetchJSON<any>("/hazards/by-area"),
          fetchJSON<any>("/hazards/heatmap"),
          fetchJSON<any>("/hazards/compare-by-department"),
        ])

      const byCat = parseCategoryChart(byCatJson)
      const types = parseCategoryChart(typesJson)
      const trends = parseMonthlyTrends(trendsJson)
      const byLoc = parseCategoryChart(byLocJson)
      const stackedLoc = parseStackedChart(stackedLocJson)
      const typesLoc = parseStackedChart(typesLocJson)
      const propLoc = parseCategoryChart(propLocJson)
      const statusLoc = parseStackedChart(statusLocJson)
      const heat = parseHeatmap(heatJson)
      // Modular parses
      const incTypes = parseCategoryChart(incTypesJson)
      const incTopLoc = parseCategoryChart(incTopLocJson)
      const hazMonthly = parseMonthlyTrends(hazMonthlyJson)
      const hazLoc = parseCategoryChart(hazLocJson)
      const hazRisk = parseCategoryChart(hazRiskJson)
      const hazArea = parseCategoryChart(hazAreaJson)
      const hazHeat = parseHeatmap(hazHeatmapJson)
      const hazVsInc = parseStackedChart(hazVsIncJson)

      setEntriesByCategory({ loading: false, error: null, data: byCat })
      setIncidentHazardTypes({ loading: false, error: null, data: types })
      setMonthlyTrends({ loading: false, error: null, data: trends })
      setEntriesByLocation({ loading: false, error: null, data: byLoc })
      setStackedEntriesByLocation({ loading: false, error: null, data: stackedLoc })
      setTypesByLocation({ loading: false, error: null, data: typesLoc })
      setProportionByLocation({ loading: false, error: null, data: propLoc })
      setStatusByLocation({ loading: false, error: null, data: statusLoc })
      setHeatmap({ loading: false, error: null, data: heat })
      // Modular
      setIncidentsTypes({ loading: false, error: null, data: incTypes })
      setIncidentsTopLocations({ loading: false, error: null, data: incTopLoc })
      setHazardsMonthly({ loading: false, error: null, data: hazMonthly })
      setHazardsByLocation({ loading: false, error: null, data: hazLoc })
      setHazardsByRisk({ loading: false, error: null, data: hazRisk })
      setHazardsByArea({ loading: false, error: null, data: hazArea })
      setHazardsHeatmap({ loading: false, error: null, data: hazHeat })
      setHazVsIncByDept({ loading: false, error: null, data: hazVsInc })

      // Compose KPIs from entries-by-category labels
      const totalIncidents = (byCat?.find((d) => d.name?.toLowerCase() === "incidents")?.value || 0)
      const totalHazards = (byCat?.find((d) => d.name?.toLowerCase() === "hazards")?.value || 0)
      const totalAudits = (byCat?.find((d) => d.name?.toLowerCase() === "audits")?.value || 0)
      const totalInspections = (byCat?.find((d) => d.name?.toLowerCase() === "inspections")?.value || 0)
      // Deliberately set delta to 0 if no trend context; real apps compute WoW or MoM
      const kpiData: KPI[] = [
        { label: "Incidents", value: totalIncidents, delta: null },
        { label: "Hazards", value: totalHazards, delta: null },
        { label: "Audits", value: totalAudits, delta: null },
        { label: "Inspections", value: totalInspections, delta: null },
      ]
      setKpis({ loading: false, error: null, data: kpiData })
      setLastUpdated(new Date())
    } catch (e: any) {
      const msg = e?.message || "Failed to load charts"

      setEntriesByCategory((s) => ({ ...s, loading: false, error: msg }))
      setIncidentHazardTypes((s) => ({ ...s, loading: false, error: msg }))
      setMonthlyTrends((s) => ({ ...s, loading: false, error: msg }))
      setEntriesByLocation((s) => ({ ...s, loading: false, error: msg }))
      setStackedEntriesByLocation((s) => ({ ...s, loading: false, error: msg }))
      setTypesByLocation((s) => ({ ...s, loading: false, error: msg }))
      setProportionByLocation((s) => ({ ...s, loading: false, error: msg }))
      setStatusByLocation((s) => ({ ...s, loading: false, error: msg }))
      setHeatmap((s) => ({ ...s, loading: false, error: msg }))
      setIncidentsTypes((s) => ({ ...s, loading: false, error: msg }))
      setIncidentsTopLocations((s) => ({ ...s, loading: false, error: msg }))
      setHazardsMonthly((s) => ({ ...s, loading: false, error: msg }))
      setHazardsByLocation((s) => ({ ...s, loading: false, error: msg }))
      setHazardsByRisk((s) => ({ ...s, loading: false, error: msg }))
      setHazardsByArea((s) => ({ ...s, loading: false, error: msg }))
      setHazardsHeatmap((s) => ({ ...s, loading: false, error: msg }))
      setHazVsIncByDept((s) => ({ ...s, loading: false, error: msg }))
      setKpis((s) => ({ ...s, loading: false, error: msg }))
      toast.error("Error loading data", { description: msg })
    }
  }, [fetchJSON])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const lower = file.name.toLowerCase()
    if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls"))) {
      toast.error("Invalid file type", { description: "Please upload an Excel file (.xlsx or .xls)." })
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`${API_BASE}/upload-excel`, {
        method: "POST",
        body: fd,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || "Upload failed")
      }
      toast.success("Upload complete", { description: "Your Excel data has been processed." })
      await refreshAll()
      setHasUploaded(true)
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message || "Please try again." })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  // If charts load data (e.g., on initial visit), consider the dataset present
  useEffect(() => {
    if (entriesByCategory.data && entriesByCategory.data.some((d) => (d as any).value > 0)) {
      setHasUploaded(true)
    }
  }, [entriesByCategory.data])

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    onFiles(e.dataTransfer.files)
  }

  const monthlyLineSeries = useMemo(() => {
    return monthlyTrends.data?.map((d) => ({ name: d.month, value: d.value })) || []
  }, [monthlyTrends.data])

  const hazardsLineSeries = useMemo(() => {
    return hazardsMonthly.data?.map((d) => ({ name: d.month, value: d.value })) || []
  }, [hazardsMonthly.data])

  // Greens colormap mapping: lighter for low, darker for high
  const heatGreen = useCallback((v: number, vmin: number, vmax: number) => {
    const t = vmax > vmin ? (v - vmin) / (vmax - vmin) : v > 0 ? 1 : 0
    // HSL green: hue ~ 140, saturation 70%, lightness from 95% (low) to 35% (high)
    const L = 95 - 60 * Math.min(1, Math.max(0, t))
    return `hsl(140 70% ${L}%)`
  }, [])

  const sections = [
    { id: "incidents", label: "Incidents" },
    { id: "hazards", label: "Hazards" },
    { id: "audits", label: "Audits" },
    { id: "audit-findings", label: "Audit Findings" },
    { id: "inspections", label: "Inspections" },
    { id: "inspection-findings", label: "Inspection Findings" },
    { id: "location-heatmap", label: "Heatmap" },
  ]

  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    const observers: IntersectionObserver[] = []
    const callback: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute("id")
          if (id) setActiveId(id)
        }
      }
    }
    const opts: IntersectionObserverInit = { rootMargin: "-120px 0px -70% 0px", threshold: [0, 0.25, 0.5, 1] }
    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (!el) return
      const ob = new IntersectionObserver(callback, opts)
      ob.observe(el)
      observers.push(ob)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  return (
    <section className={cn("w-full max-w-full", className)} style={style} aria-label="EPCL VEHS Safety Dashboard">
      {/* Header */}
      <div className="w-full bg-secondary text-secondary-foreground rounded-[calc(var(--radius)+4px)] border border-border card-elevated relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full" style={{ background: "radial-gradient(50% 50% at 50% 50%, hsl(var(--primary)/0.15) 0%, transparent 70%)" }} aria-hidden />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative inline-flex h-16 w-16 md:h-20 md:w-28 items-center justify-center rounded-md bg-card">
              <Image src="/logo.png" alt="EPCL" fill sizes="(min-width: 768px) 112px, 64px" className="object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="h2-tight truncate">EPCL VEHS Dashboard</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">Equipment hazard safety insights and monitoring</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Updated: {formatTime(lastUpdated)}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => refreshAll()} aria-label="Refresh data">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
            <Button type="button" variant="default" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} aria-label="Upload Excel data">
              <Upload className="h-4 w-4" />
              <span className="hidden md:inline">Upload</span>
            </Button>
            <a
              href="http://103.18.20.205:8000/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs md:text-sm hover:opacity-90"
              aria-label="Talk to SQL Agent"
            >
              <Database className="h-4 w-4" />
              <span>Talk to SQL Agent</span>
            </a>
          </div>
        </div>
      </div>

      {/* Hidden file input accessible globally (upload card and sidebar button share this) */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(kpis.loading || !kpis.data) && !kpis.error ? (
          [0, 1, 2, 3].map((i) => <KpiSkeleton key={i} />)
        ) : kpis.error ? (
          <Card className="col-span-1 sm:col-span-2 lg:col-span-4 bg-card">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Failed to load KPIs. {kpis.error}</p>
            </CardContent>
          </Card>
        ) : (
          kpis.data!.map((k) => <KpiCard key={k.label} kpi={k} />)
        )}
      </div>

      <MobileSectionNav sections={sections} />

      {/* Upload (only show until a file has been uploaded / data exists) */}
      {!hasUploaded && (
        <Card className="mt-6 bg-card">
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Upload Excel Data (.xlsx / .xls)</CardTitle>
            <CardDescription>Drag and drop an Excel file or click to select. The dashboard refreshes after upload.</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              role="button"
              aria-label="Upload Excel dropzone"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  inputRef.current?.click()
                }
              }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed transition-colors",
                "bg-secondary/40 hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isDragging ? "border-primary bg-secondary" : "border-input",
                "px-4 py-8"
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <FileChartColumn className="h-6 w-6 text-muted-foreground" aria-hidden />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm md:text-base">Drag and drop your Excel file here</p>
                <p className="text-xs text-muted-foreground">Only .xlsx or .xls files are supported</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? "Uploading..." : "Choose file"}
                </Button>
              </div>
            </div>
            {uploading && (
              <p className="mt-3 text-xs text-muted-foreground">Uploading... This may take a moment.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sidebar + Content */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Left Sidebar */}
        <aside className="hidden lg:block h-fit lg:sticky lg:top-24">
          <nav className="rounded-lg border border-border bg-card p-3 text-sm" aria-label="Sections">
            {hasUploaded && (
              <div className="mb-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? "Uploading..." : "Reupload Excel"}
                </Button>
              </div>
            )}
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sections</p>
            <ul className="space-y-1">
              <li>
                <a href="#hazards" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary/10", activeId === "hazards" && "bg-primary/10 border border-primary/30")}
                   aria-current={activeId === "hazards" ? "page" : undefined}>
                  <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>Hazards</span>
                </a>
              </li>
              <li>
                <a href="#incidents" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary/10", activeId === "incidents" && "bg-primary/10 border border-primary/30")}
                   aria-current={activeId === "incidents" ? "page" : undefined}>
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>Incidents</span>
                </a>
              </li>
              <li>
                <a href="#audits" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary/10", activeId === "audits" && "bg-primary/10 border border-primary/30")}
                   aria-current={activeId === "audits" ? "page" : undefined}>
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>Audits</span>
                </a>
              </li>
              <li>
                <a href="#audit-findings" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary/10", activeId === "audit-findings" && "bg-primary/10 border border-primary/30")}
                   aria-current={activeId === "audit-findings" ? "page" : undefined}>
                  <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>Audit Findings</span>
                </a>
              </li>
              <li>
                <a href="#inspections" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary/10", activeId === "inspections" && "bg-primary/10 border border-primary/30")}
                   aria-current={activeId === "inspections" ? "page" : undefined}>
                  <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>Inspections</span>
                </a>
              </li>
              <li>
                <a href="#inspection-findings" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary/10", activeId === "inspection-findings" && "bg-primary/10 border border-primary/30")}
                   aria-current={activeId === "inspection-findings" ? "page" : undefined}>
                  <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>Inspection Findings</span>
                </a>
              </li>
              <li>
                <a href="#location-heatmap" className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-primary/10", activeId === "location-heatmap" && "bg-primary/10 border border-primary/30")}
                   aria-current={activeId === "location-heatmap" ? "page" : undefined}>
                  <ChartNoAxesCombined className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <span>Heatmap</span>
                </a>
              </li>
            </ul>
          </nav>
        </aside>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Anchor placeholders for smooth scrolling */}
          <div id="incidents" className="col-span-1 lg:col-span-2 scroll-mt-24" aria-hidden />
          <div className="col-span-1 lg:col-span-2 separator-soft" />
          {/* Incidents Section */}
          <ChartCard
            title="Incidents — Types"
            description="Distribution by type"
            state={incidentsTypes}
            chartKey="incidents_types"
            render={(data) => (
              <ChartContainer config={{}} className="h-[300px] sm:h-[360px] md:h-[420px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie dataKey="value" data={[...data].sort((a,b)=>b.value-a.value).slice(0,15)} nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={1} labelLine={false}>
                      {(() => {
                        const finalData = [...data].sort((a,b)=>b.value-a.value).slice(0,15)
                        const cols = greenPalette(finalData.length)
                        return finalData.map((_, i) => <Cell key={i} fill={cols[i % cols.length]} />)
                      })()}
                    </Pie>
                    <Legend verticalAlign="bottom" wrapperStyle={{ maxHeight: 96, overflowY: "auto", width: "100%", paddingTop: 8 }} />
                  </RePieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          />
          <ChartCard
            title="Incidents — Top Locations"
            description="Highest incident counts"
            state={incidentsTopLocations}
            chartKey="incidents_top_locations"
            render={(data) => (
              <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...data].sort((a,b)=>a.value-b.value)} layout="vertical" margin={{ left: 16, right: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--chart-2)" radius={[6,6,6,6]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          />
        <ChartCard
          title="Entries by Category"
          description="Distribution across categories"
          state={entriesByCategory}
          chartKey="entries_by_category"
          render={(data) => (
            <ChartContainer
              config={{
                value: { label: "Count", color: "var(--chart-1)" },
              }}
              className="h-[260px] sm:h-[300px] md:h-[360px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        />

        <ChartCard
          title="Incident & Hazard Types"
          description="Type share"
          state={incidentHazardTypes}
          chartKey="incident_hazard_types"
          render={(data) => (
            <ChartContainer
              config={{}}
              className="h-[300px] sm:h-[360px] md:h-[420px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    dataKey="value"
                    data={data}
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {(() => {
                      const cols = greenPalette(data.length)
                      return data.map((_: unknown, i: number) => (
                        <Cell key={i} fill={cols[i % cols.length]} />
                      ))
                    })()}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ maxHeight: 96, overflowY: "auto", width: "100%", paddingTop: 8 }}
                    formatter={(v) => <span className="text-xs text-muted-foreground">{v as string}</span>}
                  />
                </RePieChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
          icon={<ChartPie className="h-4 w-4 text-muted-foreground" aria-hidden />}
        />

          {/* Hazards anchor */}
          <div id="hazards" className="col-span-1 lg:col-span-2 scroll-mt-24" aria-hidden />
          <div className="col-span-1 lg:col-span-2 separator-soft" />
          {/* Hazards Section */}
          <ChartCard
            title="Hazards — Monthly"
            description="Hazards reported per month"
            state={hazardsMonthly}
            chartKey="hazards_monthly"
            render={() => (
              <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hazardsLineSeries} margin={{ left: 8, right: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="value" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          />
          <ChartCard
            title="Hazards — By Location"
            description="Top locations by hazards"
            state={hazardsByLocation}
            chartKey="hazards_by_location"
            render={(data) => (
              <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...data].sort((a,b)=>a.value-b.value)} layout="vertical" margin={{ left: 16, right: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--chart-5)" radius={[6,6,6,6]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          />
          <ChartCard
            title="Hazards — By Risk Level"
            description="Distribution across risk levels"
            state={hazardsByRisk}
            chartKey="hazards_by_risk"
            render={(data) => (
              <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...data].sort((a,b)=>a.value-b.value)} layout="vertical" margin={{ left: 16, right: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--chart-3)" radius={[6,6,6,6]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          />
          
          <ChartCard
            title="Hazards — By Area/Department"
            description="Counts by area/department/line"
            state={hazardsByArea}
            chartKey="hazards_by_area"
            render={(data) => (
              <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...data].sort((a,b)=>a.value-b.value)} layout="vertical" margin={{ left: 16, right: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--chart-1)" radius={[6,6,6,6]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          />
          <div className="col-span-1 lg:col-span-2">
          <ChartCard
            title="Hazards vs Incidents — By Department/Section"
            description="Side-by-side comparison"
            state={hazVsIncByDept}
            chartKey="hazards_vs_incidents_dept"
            render={(data) => {
              const seriesKeys = Object.keys(data[0] || {}).filter((k) => k !== "name")
              return (
                <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} interval={0} angle={-35} height={96} tickMargin={8} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {/* Two-color palette for Hazards vs Incidents */}
                      {seriesKeys.map((k, i) => (
                        <Bar key={k} dataKey={k} fill={i === 0 ? "var(--chart-3)" : "var(--chart-2)"} radius={[4,4,0,0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )
            }}
          />
          </div>
          <div className="col-span-1 lg:col-span-2">
            <ChartCard
              title="Hazards — Heatmap (Location × Type)"
              description="Concentration of types across locations"
              state={hazardsHeatmap}
              fullHeight
              chartKey="hazards_heatmap"
              render={(hm: HeatMatrix) => (
                <div className="w-full h-[320px] sm:h-[380px] md:h-[480px] flex">
                  <div className="flex-1 overflow-auto rounded-md border border-border">
                    <div
                      className="grid text-xs"
                      style={{
                        gridTemplateColumns: `minmax(160px, 220px) repeat(${hm.x_labels.length}, minmax(70px, 1fr))`,
                      }}
                      role="table"
                      aria-label="Heatmap of Hazards by Location and Type"
                    >
                      <div className="sticky top-0 z-10 bg-card border-b border-border p-2" role="columnheader">
                        Location
                      </div>
                      {hm.x_labels.map((xl) => (
                        <div key={`h-${xl}`} className="sticky top-0 z-10 bg-card border-b border-border p-2 text-center" role="columnheader">
                          {xl}
                        </div>
                      ))}
                      {hm.y_labels.map((yl, r) => (
                        <React.Fragment key={`r-${yl}`}>
                          <div className="border-b border-border p-2 font-medium" role="rowheader">{yl}</div>
                          {hm.values[r]?.map((v, c) => (
                            <div
                              key={`c-${yl}-${hm.x_labels[c]}`}
                              className="border-b border-l border-border flex items-center justify-center font-semibold"
                              style={{ background: heatGreen(v, hm.min, hm.max), color: v > (hm.max + hm.min) / 2 ? "white" : "hsl(var(--foreground))" }}
                              role="cell"
                              title={`${yl} – ${hm.x_labels[c]}: ${v}`}
                            >
                              {v}
                            </div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <div className="w-10 ml-3 flex flex-col items-center justify-between py-2">
                    <span className="text-xs">{hm.max}</span>
                    <div
                      className="w-3 flex-1 rounded"
                      style={{
                        background: "linear-gradient(180deg, hsl(140 70% 35%) 0%, hsl(140 70% 95%) 100%)",
                      }}
                      aria-hidden
                    />
                    <span className="text-xs">{hm.min}</span>
                  </div>
                </div>
              )}
            />
          </div>
        <ChartCard
          title="Monthly Trends"
          description="Entries over time"
          state={monthlyTrends}
          chartKey="monthly_trends"
          render={() => (
            <ChartContainer
              config={{
                value: { label: "Count", color: "var(--chart-4)" },
              }}
              className="h-[260px] sm:h-[300px] md:h-[360px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyLineSeries} margin={{ left: 8, right: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--chart-4)"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        />

        <ChartCard
          title="Entries by Location"
          description="Top locations"
          state={entriesByLocation}
          chartKey="entries_by_location"
          render={(data) => (
            <ChartContainer
              config={{
                value: { label: "Count", color: "var(--chart-2)" },
              }}
              className="h-[260px] sm:h-[300px] md:h-[360px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[...data].sort((a, b) => a.value - b.value)}
                  layout="vertical"
                  margin={{ left: 16, right: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={90}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--chart-2)" radius={[6, 6, 6, 6]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        />

          {/* Audits anchor */}
          <div id="audits" className="col-span-1 lg:col-span-2 scroll-mt-24" aria-hidden />
          <div className="col-span-1 lg:col-span-2 separator-soft" />
        <ChartCard
          title="Location Analysis (Stacked)"
          description="Category stacks per location"
          state={stackedEntriesByLocation}
          chartKey="stacked_entries_by_location"
          render={(data) => {
            const keys = Object.keys(data[0] || {}).filter((k) => k !== "name")
            return (
              <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {keys.map((k, i) => (
                      <Bar key={k} dataKey={k} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )
          }}
        />

        <ChartCard
          title="Types by Location (Grouped)"
          description="Comparative type distribution"
          state={typesByLocation}
          chartKey="types_by_location"
          render={(data) => {
            const keys = Object.keys(data[0] || {}).filter((k) => k !== "name")
            return (
              <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {keys.map((k, i) => (
                      <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )
          }}
        />

          {/* Audit Findings anchor */}
          <div id="audit-findings" className="col-span-1 lg:col-span-2 scroll-mt-24" aria-hidden />
          <div className="col-span-1 lg:col-span-2 separator-soft" />
        <ChartCard
          title="Proportion Analysis"
          description="Share by location"
          state={proportionByLocation}
          chartKey="proportion_by_location"
          render={(data) => {
            // Top-N + Others aggregation to keep the chart readable
            const N = 15
            const sorted = [...data].sort((a, b) => b.value - a.value)
            const top = sorted.slice(0, N)
            const othersTotal = sorted.slice(N).reduce((s, d) => s + d.value, 0)
            const finalData = othersTotal > 0 ? [...top, { name: "Others", value: othersTotal }] : top
            return (
              <ChartContainer config={{}} className="h-[300px] sm:h-[360px] md:h-[420px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      dataKey="value"
                      data={finalData}
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={1}
                      labelLine={false}
                      label={false}
                    >
                      {(() => {
                        const cols = greenPalette(finalData.length)
                        return finalData.map((_, i) => (
                          <Cell key={i} fill={cols[i % cols.length]} />
                        ))
                      })()}
                    </Pie>
                    <Legend verticalAlign="bottom" wrapperStyle={{ maxHeight: 96, overflowY: "auto", width: "100%", paddingTop: 8 }} />
                  </RePieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )
          }}
        />

          {/* Inspections anchor */}
          <div id="inspections" className="col-span-1 lg:col-span-2 scroll-mt-24" aria-hidden />
          <div className="col-span-1 lg:col-span-2 separator-soft" />
        <ChartCard
          title="Status Tracking (Stacked)"
          description="Status by location"
          state={statusByLocation}
          chartKey="status_by_location"
          render={(data) => {
            const keys = Object.keys(data[0] || {}).filter((k) => k !== "name")
            return (
              <ChartContainer config={{}} className="h-[260px] sm:h-[300px] md:h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {keys.map((k, i) => (
                      <Bar key={k} dataKey={k} stackId="status" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )
          }}
        />

          {/* Inspection Findings anchor */}
          <div id="inspection-findings" className="col-span-1 lg:col-span-2 scroll-mt-24" aria-hidden />
          <div className="col-span-1 lg:col-span-2 separator-soft" />
          <div id="location-heatmap" className="col-span-1 lg:col-span-2 scroll-mt-24" aria-hidden />
          <div className="col-span-1 lg:col-span-2 separator-soft" />
        <ChartCard
          title="Location Heatmap"
          description="Incidents and Hazards by location"
          state={heatmap}
          fullHeight
          chartKey="heatmap"
          render={(hm: HeatMatrix) => (
            <div className="w-full h-[320px] sm:h-[380px] md:h-[440px] flex">
              {/* Heatmap grid */}
              <div className="flex-1 overflow-auto rounded-md border border-border">
                <div
                  className="grid text-xs"
                  style={{
                    gridTemplateColumns: `minmax(140px, 180px) repeat(${hm.x_labels.length}, minmax(60px, 1fr))`,
                  }}
                  role="table"
                  aria-label="Heatmap of Incidents and Hazards by Location"
                >
                  {/* Header */}
                  <div className="sticky top-0 z-10 bg-card border-b border-border p-2" role="columnheader">
                    Location
                  </div>
                  {hm.x_labels.map((xl) => (
                    <div key={`h-${xl}`} className="sticky top-0 z-10 bg-card border-b border-border p-2 text-center" role="columnheader">
                      {xl}
                    </div>
                  ))}

                  {/* Rows */}
                  {hm.y_labels.map((yl, r) => (
                    <React.Fragment key={`r-${yl}`}>
                      <div className="border-b border-border p-2 font-medium" role="rowheader">{yl}</div>
                      {hm.values[r]?.map((v, c) => (
                        <div
                          key={`c-${yl}-${hm.x_labels[c]}`}
                          className="border-b border-l border-border flex items-center justify-center font-semibold"
                          style={{ background: heatGreen(v, hm.min, hm.max), color: v > (hm.max + hm.min) / 2 ? "white" : "hsl(var(--foreground))" }}
                          role="cell"
                          title={`${yl} – ${hm.x_labels[c]}: ${v}`}
                        >
                          {v}
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              {/* Colorbar */}
              <div className="w-10 ml-3 flex flex-col items-center justify-between py-2">
                <span className="text-xs">{hm.max}</span>
                <div
                  className="w-3 flex-1 rounded"
                  style={{
                    background: "linear-gradient(180deg, hsl(140 70% 35%) 0%, hsl(140 70% 95%) 100%)",
                  }}
                  aria-hidden
                />
                <span className="text-xs">{hm.min}</span>
              </div>
            </div>
          )}
        />
        </div>
      </div>
    </section>
  )
}

// Map KPI labels to accents and icons for a cohesive visual language
function getKpiMeta(label: string): { color: string; icon: React.ReactNode } {
  const l = (label || "").toLowerCase()
  if (l.includes("incident")) return { color: "var(--chart-1)", icon: <Activity className="h-4 w-4" /> }
  if (l.includes("hazard")) return { color: "var(--chart-3)", icon: <ShieldAlert className="h-4 w-4" /> }
  if (l.includes("audit")) return { color: "var(--chart-2)", icon: <ClipboardList className="h-4 w-4" /> }
  if (l.includes("inspection")) return { color: "var(--chart-4)", icon: <ClipboardCheck className="h-4 w-4" /> }
  return { color: "var(--chart-5)", icon: <Activity className="h-4 w-4" /> }
}

function KpiCard({ kpi }: { kpi: KPI }) {
  const showDelta = typeof kpi.delta === "number" && !Number.isNaN(kpi.delta)
  const isUp = showDelta ? (kpi.delta as number) >= 0 : true
  const DeltaIcon = isUp ? ChartBarIncreasing : ChartBarDecreasing
  const deltaColor = isUp ? "text-emerald-600" : "text-rose-600"
  const meta = getKpiMeta(kpi.label)
  return (
    <Card
      className={cn(
        "relative overflow-hidden bg-card border border-border/60 shadow-sm hover:shadow-md transition-all duration-200",
        "rounded-xl group"
      )}
      aria-label={`${kpi.label} total`}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 h-full w-1.5" style={{ background: `linear-gradient(180deg, ${meta.color} 0%, ${meta.color}AA 100%)` }} />
      {/* Decorative background blob */}
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-10"
        style={{ background: `radial-gradient(50% 50% at 50% 50%, ${meta.color} 0%, transparent 70%)` }}
        aria-hidden
      />
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white shadow-sm"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            >
              {meta.icon}
            </div>
            <p className="text-[11px] md:text-xs text-muted-foreground uppercase tracking-wider font-semibold">{kpi.label}</p>
          </div>
          {showDelta && (
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", deltaColor)}>
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
              {Math.abs(kpi.delta as number).toFixed(1)}%
            </span>
          )}
        </div>
        <div className="mt-2">
          <span className="text-2xl md:text-3xl font-semibold tracking-tight leading-none">{formatNumber(kpi.value)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function KpiSkeleton() {
  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-muted/60" />
          <div className="h-6 w-28 rounded bg-muted/60" />
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard<T>({
  title,
  description,
  state,
  render,
  icon,
  fullHeight = false,
  chartKey,
}: {
  title: string
  description?: string
  state: ApiState<T[] | any>
  render: (data: any) => React.ReactNode
  icon?: React.ReactNode
  fullHeight?: boolean
  chartKey: string
}) {
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "")
  const [open, setOpen] = React.useState(false)
  const [insights, setInsights] = React.useState<string>("")
  const [loading, setLoading] = React.useState(false)
  const controllerRef = React.useRef<AbortController | null>(null)

  const fetchInsights = React.useCallback(async () => {
    try {
      setLoading(true)
      setInsights("")
      controllerRef.current?.abort()
      controllerRef.current = new AbortController()
      const res = await fetch(`${API_BASE}/chart/insights/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart_key: chartKey, verbose: true }),
        signal: controllerRef.current.signal,
      })
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "")
        throw new Error(t || `Request failed: ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setInsights((s) => s + decoder.decode(value, { stream: true }))
      }
    } catch (e: any) {
      setInsights((s) => s + `\n[insights error] ${e?.message || String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [API_BASE, chartKey])

  React.useEffect(() => {
    if (open) {
      fetchInsights()
    } else {
      controllerRef.current?.abort()
    }
    return () => controllerRef.current?.abort()
  }, [open, fetchInsights])

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2 separator-soft">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <CardTitle className="text-sm md:text-base truncate">{title}</CardTitle>
          </div>
          <div className="shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" aria-label="Insights">
                      <Lightbulb className="h-4 w-4" />
                      <span className="hidden sm:inline">Insights</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                      <DialogTitle>AI Insights</DialogTitle>
                      <DialogDescription>{title}</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-auto text-sm">
                      {loading && !insights ? (
                        <p className="text-muted-foreground">Generating insights…</p>
                      ) : (
                        <InsightsView text={insights} />
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>AI-generated analysis and recommendations</TooltipContent>
            </Tooltip>
          </div>
        </div>
        {description ? (
          <CardDescription className="text-xs text-muted-foreground">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className={cn(fullHeight ? "pt-3" : "pt-3")}>        
        {state.loading ? (
          <div className="h-[260px] sm:h-[300px] md:h-[360px] w-full animate-pulse rounded-lg bg-secondary" />
        ) : state.error ? (
          <div className="h-[260px] sm:h-[300px] md:h-[360px] w-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Error: {state.error}</p>
          </div>
        ) : !state.data || (Array.isArray(state.data) && state.data.length === 0) ? (
          <EmptyState />
        ) : (
          render(state.data)
        )}
      </CardContent>
    </Card>
  )
}

function InsightsView({ text }: { text: string }) {
  const [body] = React.useMemo(() => {
    const idx = text.lastIndexOf("[[META]]")
    if (idx >= 0) {
      const t = text.slice(0, idx)
      return [t]
    }
    return [text]
  }, [text])
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: (props) => <h2 className="text-base font-semibold mt-2 mb-1" {...props} />,
        h2: (props) => <h3 className="text-sm font-semibold mt-2 mb-1" {...props} />,
        h3: (props) => <h4 className="text-sm font-semibold mt-2 mb-1" {...props} />,
        p: (props) => <p className="my-2 leading-6" {...props} />,
        ul: (props) => <ul className="list-disc ml-5 my-2 space-y-1" {...props} />,
        ol: (props) => <ol className="list-decimal ml-5 my-2 space-y-1" {...props} />,
        li: (props) => <li className="leading-6" {...props} />,
        table: (props) => <table className="w-full text-left text-xs border-collapse my-3" {...props} />,
        th: (props) => <th className="border-b border-border px-2 py-1 font-semibold" {...props} />,
        td: (props) => <td className="border-b border-border px-2 py-1" {...props} />,
      }}
    >
      {body}
    </ReactMarkdown>
  )
}

function EmptyState() {
  return (
    <div className="h-[360px] md:h-[380px] w-full rounded-lg border border-dashed border-input flex items-center justify-center bg-secondary/30">
      <p className="text-sm text-muted-foreground">No data available</p>
    </div>
  )
}

// Utilities

function formatNumber(n: number) {
  try {
    return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n)
  } catch {
    return String(n)
  }
}

function formatTime(d: Date | null) {
  if (!d) return "--"
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
  } catch {
    return d.toLocaleTimeString()
  }
}

function estimateDelta(series: TrendDatum[] | null | undefined): number {
  if (!series || series.length < 2) return 0
  const last = series[series.length - 1]?.value ?? 0
  const prev = series[series.length - 2]?.value ?? 0
  if (prev === 0) return last > 0 ? 100 : 0
  return ((last - prev) / Math.abs(prev)) * 100
}

// Safe access to CSS variable colors after hydration
function getComputedStyleColor(varName: string): string | null {
  if (typeof window === "undefined") return null
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName)
  return v?.trim() || null
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "")
  const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16)
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// Transform helpers for backend -> Recharts shape
function parseCategoryChart(json: any): SimpleDatum[] {
  if (!json || json.error) return []
  const labels: string[] = json.labels || []
  const data: number[] = (json.datasets?.[0]?.data as number[]) || []
  return labels.map((name, i) => ({ name, value: Number(data[i] || 0) }))
}

function parseStackedChart(json: any): GroupDatum[] {
  if (!json || json.error) return []
  const labels: string[] = json.labels || []
  const datasets: Array<{ label: string; data: number[] }> = json.datasets || []
  return labels.map((name, i) => {
    const row: GroupDatum = { name }
    datasets.forEach((ds) => {
      const key = ds.label || "series"
      ;(row as any)[key] = Number(ds.data?.[i] || 0)
    })
    return row
  })
}

function parseMonthlyTrends(json: any): TrendDatum[] {
  if (!json || json.error) return []
  const labels: string[] = json.labels || []
  const datasets: Array<{ label: string; data: number[] }> = json.datasets || []
  return labels.map((month, i) => {
    const total = datasets.reduce((sum, ds) => sum + Number(ds.data?.[i] || 0), 0)
    return { month: String(month), value: total }
  })
}

function parseHeatmap(json: any): HeatMatrix {
  if (!json || json.error) {
    return { x_labels: [], y_labels: [], values: [], min: 0, max: 0 }
  }
  const x: string[] = Array.isArray(json.x_labels) ? json.x_labels.map(String) : []
  const y: string[] = Array.isArray(json.y_labels) ? json.y_labels.map(String) : []
  const valsRaw: any[] = Array.isArray(json.values) ? json.values : []
  const vals: number[][] = valsRaw.map((row) => (Array.isArray(row) ? row.map((v) => Number(v || 0)) : []))
  let min = typeof json.min === "number" ? json.min : 0
  let max = typeof json.max === "number" ? json.max : 0
  if (!json.min || !json.max) {
    const flat = vals.flat()
    if (flat.length) {
      min = Math.min(...flat)
      max = Math.max(...flat)
    }
  }
  return { x_labels: x, y_labels: y, values: vals, min, max, title: typeof json.title === "string" ? json.title : undefined }
}