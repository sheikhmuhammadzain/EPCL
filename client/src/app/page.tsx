"use client"

import React from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowRight, Upload, MessageCircle, BarChart3, ShieldAlert, Activity, ClipboardCheck, Map } from "lucide-react"
import { cn } from "@/lib/utils"
import HeroSection from "@/components/blocks/hero-section-9"
import ProCard from "@/components/ui/pro-card"

// Scroll-reveal wrapper with subtle, professional motion
function Reveal({
  children,
  as = "div",
  delay = 0,
  direction = "up",
  className,
}: {
  children: React.ReactNode
  as?: React.ElementType
  delay?: number
  direction?: "up" | "down" | "left" | "right"
  className?: string
}) {
  const Comp: any = as
  const ref = React.useRef<HTMLElement | null>(null)
  const [shown, setShown] = React.useState(false)

  React.useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          ob.disconnect()
        }
      },
      { threshold: 0.08 }
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [])

  const initial =
    direction === "up"
      ? "translate-y-6"
      : direction === "down"
      ? "-translate-y-6"
      : direction === "left"
      ? "translate-x-6"
      : "-translate-x-6"

  return (
    <Comp
      ref={ref}
      className={cn(
        "transform-gpu will-change-transform transition-all duration-700 ease-out",
        shown ? "opacity-100 translate-x-0 translate-y-0" : cn("opacity-0", initial),
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Comp>
  )
}

export default function Page() {
  return (
    <div className="min-h-dvh bg-background text-foreground">

      <main>
        {/* New Hero Section */}
        <HeroSection />

        {/* Social Proof in HeroSection covers partners; skipping duplicate here */}

        {/* Value Props */}
        <section id="features" className="py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="mb-6 text-center">
              <h2 className="h2-tight">Why Safety Co-Pilot</h2>
              <p className="text-sm text-muted-foreground">Turn raw safety data into clear, actionable intelligence for teams on the ground and leaders in the loop.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Reveal direction="up" delay={0}>
                <ProCard>
                  <div className="p-5 flex items-start gap-3">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold">Unified Analytics</p>
                      <p className="text-sm text-muted-foreground">One dashboard for incidents, hazards, audits, and inspections with drill‑downs, filters, and export.</p>
                    </div>
                  </div>
                </ProCard>
              </Reveal>
              <Reveal direction="up" delay={80}>
                <ProCard>
                  <div className="p-5 flex items-start gap-3">
                    <MessageCircle className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold">AI Assistant</p>
                      <p className="text-sm text-muted-foreground">Ask in plain English. Get summaries, top drivers, and suggested actions for your site or time window.</p>
                    </div>
                  </div>
                </ProCard>
              </Reveal>
              <Reveal direction="up" delay={160}>
                <ProCard>
                  <div className="p-5 flex items-start gap-3">
                    <Upload className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold">Fast Excel Uploads</p>
                      <p className="text-sm text-muted-foreground">Drop .xlsx/.xls and we auto‑detect columns, validate data, and update KPIs and charts instantly.</p>
                    </div>
                  </div>
                </ProCard>
              </Reveal>
              <Reveal direction="up" delay={240}>
                <ProCard>
                  <div className="p-5 flex items-start gap-3">
                    <Map className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold">Location Heatmaps</p>
                      <p className="text-sm text-muted-foreground">See hotspots by unit/area and timeframe to prioritize inspections and mitigation.</p>
                    </div>
                  </div>
                </ProCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="mb-6 text-center">
              <h2 className="h2-tight">How it works</h2>
              <p className="text-sm text-muted-foreground">From Excel to insights in minutes — with built‑in validation and an AI assistant to help.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { icon: Upload, title: "Upload Excel", desc: "Drop .xlsx/.xls — we auto‑detect and validate required columns." },
                { icon: BarChart3, title: "Explore KPIs & Trends", desc: "See incidents and hazards by month, type, and location." },
                { icon: MessageCircle, title: "Ask the AI", desc: "Query trends, top drivers, and recommended actions in plain English." },
                { icon: Map, title: "Deep‑Dive & Share", desc: "Filter by area/time, export charts, and share quick snapshots." },
              ].map((s, i) => (
                <Reveal key={i} delay={i * 80}>
                  <ProCard>
                    <div className="p-5">
                      <div className="flex items-center gap-3">
                        <s.icon className="h-5 w-5 text-primary" />
                        <p className="font-semibold">{s.title}</p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{s.desc}</p>
                    </div>
                  </ProCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Use Cases */}
        <section id="use-cases" className="py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="mb-6 text-center">
              <h2 className="h2-tight">Who it’s for</h2>
              <p className="text-sm text-muted-foreground">Designed for HSE leaders, analysts, and supervisors who need fast situational awareness.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Reveal>
                <ProCard>
                  <div className="p-5">
                    <p className="text-base font-semibold">HSE Manager</p>
                    <p className="text-sm text-muted-foreground mt-2">Track monthly hazard trends, compare areas, and identify top incident locations to target interventions.</p>
                  </div>
                </ProCard>
              </Reveal>
              <Reveal delay={80}>
                <ProCard>
                  <div className="p-5">
                    <p className="text-base font-semibold">Analyst</p>
                    <p className="text-sm text-muted-foreground mt-2">Run time‑series and breakdown analyses, validate hypotheses, and use AI to draft quick summaries.</p>
                  </div>
                </ProCard>
              </Reveal>
              <Reveal delay={160}>
                <ProCard>
                  <div className="p-5">
                    <p className="text-base font-semibold">Plant Supervisor</p>
                    <p className="text-sm text-muted-foreground mt-2">Use heatmaps to spot hotspots, focus inspections, and close the loop with quicker actions.</p>
                  </div>
                </ProCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <div className="mb-6 text-center">
              <h2 className="h2-tight">Frequently asked questions</h2>
              <p className="text-sm text-muted-foreground">Short answers to help you get started. Ask the AI or open the dashboard for more.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Reveal>
                <ProCard>
                  <div className="p-5">
                    <p className="font-semibold">What data formats are supported?</p>
                    <p className="text-sm text-muted-foreground mt-1">Excel files (.xlsx/.xls).</p>
                  </div>
                </ProCard>
              </Reveal>
              <Reveal delay={80}>
                <ProCard>
                  <div className="p-5">
                    <p className="font-semibold">How do I get started?</p>
                    <p className="text-sm text-muted-foreground mt-1">Click “Launch Dashboard” and upload an Excel file.</p>
                  </div>
                </ProCard>
              </Reveal>
              <Reveal delay={160}>
                <ProCard>
                  <div className="p-5">
                    <p className="font-semibold">Can I query specific months/years?</p>
                    <p className="text-sm text-muted-foreground mt-1">Yes — ask the AI assistant or use dashboard filters.</p>
                  </div>
                </ProCard>
              </Reveal>
              <Reveal delay={240}>
                <ProCard>
                  <div className="p-5">
                    <p className="font-semibold">Is it aligned with our safety standards?</p>
                    <p className="text-sm text-muted-foreground mt-1">Yes — built to match your organization’s safety requirements and branding.</p>
                  </div>
                </ProCard>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-12 md:py-16">
          <div className="mx-auto max-w-7xl px-4 md:px-6">
            <Reveal className="rounded-lg border border-border bg-secondary text-secondary-foreground p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4" direction="up">
              <div>
                <h2 className="h2-tight">Get instant safety intelligence across your operations.</h2>
                <p className="text-sm text-muted-foreground">Open the dashboard, upload Excel, or chat for quick answers.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/dashboard">
                  <Button className="gap-1.5">Launch Dashboard <ArrowRight className="h-4 w-4" /></Button>
                </Link>
                <Link href="/dashboard?focus=upload">
                  <Button variant="secondary" className="gap-1.5"><Upload className="h-4 w-4" /> Upload Excel</Button>
                </Link>
                <a href="http://103.18.20.205:8501/" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="gap-1.5"><MessageCircle className="h-4 w-4" /> Open Chat</Button>
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex h-8 w-8 items-center justify-center">
              <Image src="/logo.png" alt="Safety Co-Pilot" fill sizes="32px" className="object-contain" />
            </span>
            <span className="text-sm text-muted-foreground"> {new Date().getFullYear()} Safety Co-Pilot</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">Dashboard</Link>
            <a href="http://103.18.20.205:8501/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">Chat</a>
            <a href="#" className="text-muted-foreground hover:text-foreground">Privacy</a>
            <a href="#" className="text-muted-foreground hover:text-foreground">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}