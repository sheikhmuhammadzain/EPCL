"use client"

import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import { MessageCircle, X, Send, Loader2, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
// Replaced ScrollArea with a plain div to reduce overhead and improve responsiveness
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip as ReTooltip } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  meta?: {
    chart_data?: {
      labels: string[]
      datasets: { label: string; data: number[] }[]
    }
    table_data?: {
      headers: Array<string | number>
      rows: Array<Array<string | number>>
    }
    note?: string
    chart_blocks?: Array<{
      chart_data?: {
        labels: string[]
        datasets: { label: string; data: number[] }[]
      }
      table_data?: {
        headers: Array<string | number>
        rows: Array<Array<string | number>>
      }
      note?: string
    }>
  }
}

// Normalize LLM markdown to reduce odd spacing/bullets
function sanitizeMarkdown(input: string): string {
  let s = input || ""
  // Convert unicode bullets to markdown hyphen bullets
  s = s.replace(/^(\s*)•\s+/gm, "$1- ")
  // Drop lines that are only a bullet marker
  s = s.replace(/^\s*([•*+-])\s*$/gm, "")
  // Collapse excessive blank lines
  s = s.replace(/\n{3,}/g, "\n\n")
  // Normalize extra spaces after bullet
  s = s.replace(/^\s*-\s{2,}/gm, "- ")
  return s.trim()
}

// Shorten long X-axis labels for compact charts
function shortenLabel(label: any, max: number = 16): string {
  const s = String(label ?? "")
  if (s.length <= max) return s
  return s.slice(0, Math.max(1, max - 1)) + "…"
}

export default function ChatWidget({ className, open, onOpenChange }: { className?: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false)
  const controlled = typeof open === "boolean"
  const isOpen = controlled ? (open as boolean) : internalOpen
  const [isFull, setIsFull] = useState(false)
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null)
  const setOpen = (val: boolean) => {
    // Reset fullscreen when closing to prevent launcher from inheriting fullscreen container
    if (!val) setIsFull(false)
    if (controlled) {
      onOpenChange?.(val)
    } else {
      setInternalOpen(val)
    }
  }
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m0",
      role: "assistant",
      content:
        "Hi! I can answer questions about your uploaded Excel data, like totals, top locations, or counts in a month/year. Try: ‘Total incidents’, ‘Top hazard location’, or ‘Incidents in March 2024’.",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const hasUserMessage = messages.some((m) => m.role === "user")
  const [isVerbose, setIsVerbose] = useState(true)

  // Build smart, chart-friendly follow-up suggestions based on the latest assistant reply
  function buildSuggestions(lastAssistant: ChatMessage | undefined): string[] {
    const suggestions: string[] = []
    if (!lastAssistant) return suggestions

    const text = (lastAssistant.content || "").toLowerCase()
    const meta = lastAssistant.meta || {}
    const labels: string[] = []

    // Try to infer which categories appeared in the last response from dataset labels
    const pushLabel = (s?: string) => {
      if (!s) return
      const sl = String(s).toLowerCase()
      labels.push(sl)
    }
    if (meta.chart_data?.datasets?.length) {
      pushLabel(meta.chart_data.datasets[0]?.label as any)
    }
    if (Array.isArray(meta.chart_blocks)) {
      meta.chart_blocks.forEach((blk) => pushLabel(blk?.chart_data?.datasets?.[0]?.label as any))
    }

    const hasInc = labels.some((l) => l.includes("incident")) || text.includes("incident")
    const hasHaz = labels.some((l) => l.includes("hazard")) || text.includes("hazard")
    const hasAud = labels.some((l) => l.includes("audit")) || text.includes("audit")
    const hasIns = labels.some((l) => l.includes("inspection")) || text.includes("inspection")

    // Curated, chartable prompts per category
    if (hasInc) {
      suggestions.push(
        "Incidents — Monthly trend",
        "Top incident locations",
        "Incidents by type",
        "Incidents in 2024",
        "Incidents in March 2024"
      )
    }
    if (hasHaz) {
      suggestions.push(
        "Hazards — Monthly trend",
        "Hazards by location",
        "Hazards by risk level",
        "Hazards in 2024",
        "Hazards in March 2024"
      )
    }
    if (hasAud) {
      suggestions.push(
        "Audits — Monthly trend",
        "Audits by department",
        "Audits by status",
        "Audits in 2024"
      )
    }
    if (hasIns) {
      suggestions.push(
        "Inspections — Monthly trend",
        "Inspections by area",
        "Inspections by status",
        "Inspections in 2024"
      )
    }

    // If nothing was inferred, provide general chartable prompts
    if (suggestions.length === 0) {
      suggestions.push(
        "Monthly incidents",
        "Top hazard locations",
        "Audits — Monthly trend",
        "Inspections — Monthly trend",
        "Incident types distribution"
      )
    }

    // De-duplicate while preserving order and cap at 6
    const seen = new Set<string>()
    const uniq = suggestions.filter((s) => (s = s.trim()) && !seen.has(s) && (seen.add(s), true))
    return uniq.slice(0, 6)
  }

  // Sample quick questions
  const samples = [
    "Total incidents",
    "Top hazard location",
    "Incidents in March 2024",
    "Total audits",
    "Inspections in 2024",
  ]

  const sendQuestion = async (q: string) => {
    const question = q.trim()
    if (!question || loading) return
    const userId = `u_${Date.now()}`
    const assistantId = `a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setMessages((m) => [...m, { id: userId, role: "user", content: question }, { id: assistantId, role: "assistant", content: "" }])
    setInput("")
    setLoading(true)
    try {
      // Call external backend directly (SSE-like stream of data: {"content": "..."})
      const chatBase = (process.env.NEXT_PUBLIC_CHAT_BASE || "http://127.0.0.1:8001").replace(/\/$/, "")
      const chatModel = (process.env.NEXT_PUBLIC_CHAT_MODEL || "openai/gpt-4o-mini")
      const res = await fetch(`${chatBase}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question, model: chatModel }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => "")
        throw new Error(t || `Request failed: ${res.status}`)
      }
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let textAccum = ""
      let scheduled = false
      const scheduleFlush = () => {
        if (!scheduled) {
          scheduled = true
          const cb = () => {
            scheduled = false
            setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: textAccum } : msg)))
          }
          if (typeof window !== "undefined" && window.requestAnimationFrame) {
            window.requestAnimationFrame(cb)
          } else {
            setTimeout(cb, 16)
          }
        }
      }
      if (!reader) {
        const txt = await res.text()
        textAccum = txt
        setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: textAccum } : msg)))
      } else {
        let buffer = ""
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let nl = buffer.indexOf("\n")
          while (nl !== -1) {
            const line = buffer.slice(0, nl).trim()
            buffer = buffer.slice(nl + 1)
            if (line.startsWith("data:")) {
              const payload = line.slice(5).trim()
              if (payload === "[DONE]") {
                break
              }
              try {
                const obj = JSON.parse(payload)
                const piece = typeof obj?.content === "string" ? obj.content : ""
                if (piece) {
                  textAccum += piece
                  scheduleFlush()
                }
              } catch {}
            }
            nl = buffer.indexOf("\n")
          }
        }
        setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, content: textAccum } : msg)))
      }
    } catch (err: any) {
      setMessages((m) => m.map((msg) => (msg.role === "assistant" && msg.content === "" ? { ...msg, content: `Error: ${err?.message || "Something went wrong"}` } : msg)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [isOpen, messages.length])

  // Auto-enter fullscreen on smaller viewports when opened
  useEffect(() => {
    if (typeof window !== "undefined" && isOpen && !isFull) {
      if (window.innerHeight < 650) {
        setIsFull(true)
      }
    }
  }, [isOpen, isFull])

  // Portal mount (decouple from dashboard layout)
  useEffect(() => {
    if (typeof document === "undefined") return
    let root = document.getElementById("epcl-chat-root") as HTMLElement | null
    if (!root) {
      root = document.createElement("div")
      root.id = "epcl-chat-root"
      document.body.appendChild(root)
    }
    setPortalEl(root)
  }, [])

  // Global open/close events to avoid parent re-render
  useEffect(() => {
    const onOpenEvt = () => setOpen(true)
    const onCloseEvt = () => setOpen(false)
    if (typeof window !== "undefined") {
      window.addEventListener("epcl:chat-open", onOpenEvt)
      window.addEventListener("epcl:chat-close", onCloseEvt)
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("epcl:chat-open", onOpenEvt)
        window.removeEventListener("epcl:chat-close", onCloseEvt)
      }
    }
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await sendQuestion(input)
  }

  // Only let fullscreen affect layout when the window is open
  const containerClass = cn("fixed z-50", isOpen && isFull ? "inset-0 p-2 sm:p-4" : "", className)
  const containerStyle = (isOpen && isFull) ? undefined : ({ right: 24, bottom: 24 } as React.CSSProperties)

  const content = (
    <div className={cn(containerClass, "pointer-events-none")} style={containerStyle}>
      {/* Launcher Button */}
      {!isOpen && (
        <Button
          type="button"
          aria-label="Open chat"
          className="h-12 w-12 rounded-full shadow-lg pointer-events-auto"
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <Card className={cn(
          isFull
            ? "w-full h-full max-w-none max-h-none rounded-none sm:rounded-xl"
            : "w-[92vw] max-w-[420px] h-[70vh] max-h-[80vh]",
          // Glassmorphism container
          "shadow-2xl overflow-hidden pointer-events-auto backdrop-blur-xl supports-[backdrop-filter]:bg-background/30 bg-background/70 border border-white/20 dark:border-white/10"
        )}>
          <CardHeader className="py-3 px-3 border-b border-border flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Data Assistant</CardTitle>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-2 pr-1">
                <span className="text-[11px] text-muted-foreground">More insights</span>
                <Switch checked={isVerbose} onCheckedChange={setIsVerbose} aria-label="Toggle verbose insights" />
              </div>
              <button
                type="button"
                onClick={() => setIsFull((v) => !v)}
                aria-label={isFull ? "Exit fullscreen" : "Enter fullscreen"}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
              >
                {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              {/* Use a minimal icon button to avoid variant-induced layout shifts */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 h-full flex flex-col min-h-0">
            <div className="flex-1 min-h-0 p-3 overflow-auto">
              <div className="space-y-2">
                {messages.map((m) => (
                  <MessageBubble key={m.id} role={m.role} content={m.content} meta={m.meta} />
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>
            {/* Smart follow-up suggestions after the latest assistant reply */}
            {(() => {
              const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")
              const sugg = buildSuggestions(lastAssistant)
              return (!loading && lastAssistant && sugg.length > 0) ? (
                <div className="px-3 pb-2 border-t border-border/50 bg-card/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Suggested:</span>
                    {sugg.map((s, i) => (
                      <Button
                        key={`sugg_${i}`}
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={loading}
                        onClick={() => sendQuestion(s)}
                        aria-label={`Ask: ${s}`}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null
            })()}
            {/* Quick sample questions (hide after first user message to preserve space) */}
            {!hasUserMessage && (
              <div className="px-3 pb-2 shrink-0 border-t border-border/50 bg-card/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Try:</span>
                  {samples.map((s, i) => (
                    <Button
                      key={i}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={loading}
                      onClick={() => sendQuestion(s)}
                      aria-label={`Ask: ${s}`}
                    >
                      {s}
                    </Button>
                  ))}
                  <div className="grow" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFull((v) => !v)}
                    aria-label={isFull ? "Exit fullscreen" : "Enter fullscreen"}
                    title={isFull ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isFull ? (
                      <span className="inline-flex items-center gap-1"><Minimize2 className="h-3.5 w-3.5" /> Exit</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Maximize2 className="h-3.5 w-3.5" /> Fullscreen</span>
                    )}
                  </Button>
                </div>
              </div>
            )}
            <form onSubmit={onSubmit} className="p-3 border-t border-border flex items-center gap-2 shrink-0 bg-card">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your data..."
                autoComplete="off"
              />
              <Button type="submit" disabled={loading || !input.trim()} aria-label="Send">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )

  if (!portalEl) return null
  return createPortal(content, portalEl)
}

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false })
import remarkGfm from "remark-gfm"

const MessageBubble = React.memo(function MessageBubble({ role, content, meta }: { role: "user" | "assistant" | "system"; content: string; meta?: ChatMessage["meta"] }) {
  const isUser = role === "user"
  const displayContent = role === "assistant" ? sanitizeMarkdown(content) : content
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}
      aria-label={isUser ? "User message" : "Assistant message"}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed shadow-md",
          // Glass bubbles with strong contrast for user messages
          isUser
            ? "bg-emerald-600 text-white dark:text-white border border-emerald-700/40 shadow-lg backdrop-blur-sm"
            : "bg-background/60 text-foreground border border-white/15 dark:border-white/10 backdrop-blur-sm"
        )}
      >
        {/* Markdown-rendered text */}
        <div
          className={cn(
            isUser
              ? "not-prose text-white break-words"
              : "prose prose-sm max-w-none dark:prose-invert whitespace-normal prose-p:my-1.5 prose-li:my-1 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:my-2 prose-headings:font-semibold prose-pre:my-2 prose-table:my-2 prose-hr:my-3"
          )}
        > 
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: (props: any) => (
                <a
                  {...props}
                  className={cn(isUser ? "text-white underline underline-offset-2 hover:text-white/90" : "text-primary underline underline-offset-2")}
                  target="_blank"
                  rel="noreferrer"
                />
              ),
              p: (props: any) => (
                <p
                  {...props}
                  className={cn(
                    "my-1.5 leading-relaxed",
                    isUser ? "text-white" : "text-foreground",
                    props.className
                  )}
                />
              ),
              strong: (props: any) => (
                <strong {...props} className={cn(isUser ? "text-white" : undefined, props.className)} />
              ),
              em: (props: any) => (
                <em {...props} className={cn(isUser ? "text-white" : undefined, props.className)} />
              ),
              h1: (props: any) => (
                <h1 {...props} className={cn("my-2 font-semibold", isUser ? "text-white" : undefined, props.className)} />
              ),
              h2: (props: any) => (
                <h2 {...props} className={cn("my-2 font-semibold", isUser ? "text-white" : undefined, props.className)} />
              ),
              h3: (props: any) => (
                <h3 {...props} className={cn("my-2 font-semibold", isUser ? "text-white" : undefined, props.className)} />
              ),
              h4: (props: any) => (
                <h4 {...props} className={cn("my-2 font-semibold", isUser ? "text-white" : undefined, props.className)} />
              ),
              h5: (props: any) => (
                <h5 {...props} className={cn("my-2 font-semibold", isUser ? "text-white" : undefined, props.className)} />
              ),
              h6: (props: any) => (
                <h6 {...props} className={cn("my-2 font-semibold", isUser ? "text-white" : undefined, props.className)} />
              ),
              code: (props: any) => (
                <code
                  {...props}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-mono",
                    isUser ? "bg-white/10 text-white border border-white/20" : "bg-muted"
                  )}
                />
              ),
              pre: (props: any) => (
                <pre
                  {...props}
                  className={cn(
                    "rounded-md p-2 text-xs overflow-auto",
                    isUser ? "bg-white/10 text-white border border-white/20" : "bg-muted"
                  )}
                />
              ),
              table: (props: any) => (
                <table
                  {...props}
                  className={cn(
                    "w-full text-xs rounded-md overflow-hidden",
                    isUser ? "text-white border border-white/20" : "border border-border"
                  )}
                />
              ),
              thead: (props: any) => (
                <thead {...props} className={cn(isUser ? "bg-white/10" : "bg-muted")} />
              ),
              th: (props: any) => (
                <th
                  {...props}
                  className={cn(
                    "text-left font-medium px-2 py-1.5",
                    isUser ? "border-b border-white/20 text-white" : "border-b border-border"
                  )}
                />
              ),
              td: (props: any) => (
                <td
                  {...props}
                  className={cn(
                    "px-2 py-1.5 align-top",
                    isUser ? "border-b border-white/10 text-white" : "border-b border-border"
                  )}
                />
              ),
              ul: (props: any) => (
                <ul
                  {...props}
                  className={cn(
                    "list-disc pl-5 my-1.5 space-y-1.5",
                    isUser ? "text-white" : undefined,
                    props.className
                  )}
                />
              ),
              ol: (props: any) => (
                <ol
                  {...props}
                  className={cn(
                    "list-decimal pl-5 my-1.5 space-y-1.5",
                    isUser ? "text-white" : undefined,
                    props.className
                  )}
                />
              ),
              li: (props: any) => (
                <li {...props} className={cn("my-0", isUser ? "text-white" : undefined, props.className)} />
              ),
              blockquote: (props: any) => (
                <blockquote {...props} className={cn(isUser ? "text-white border-l border-white/30 pl-3" : undefined, props.className)} />
              ),
              hr: (props: any) => (
                <hr {...props} className={cn(isUser ? "border-white/20" : undefined, props.className)} />
              ),
            }}
          >
            {displayContent}
          </ReactMarkdown>
        </div>
        {/* Optional note (e.g., total vs dated explanation) */}
        {role === "assistant" && meta?.note && (
          <div className="mt-2 text-[11px] text-muted-foreground italic">{meta.note}</div>
        )}
        {/* Multiple chart/table blocks if provided */}
        {role === "assistant" && Array.isArray(meta?.chart_blocks) && meta!.chart_blocks!.length > 0 && (
          <div className="mt-3 space-y-3">
            {meta!.chart_blocks!.map((blk, bi) => (
              <div key={bi} className="p-2 rounded-md bg-background border border-border">
                {blk.note ? <div className="text-[11px] text-muted-foreground mb-2">{blk.note}</div> : null}
                {blk.chart_data ? (
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      {(() => {
                        const labels = blk.chart_data!.labels
                        const ds = blk.chart_data!.datasets?.[0]
                        const data = labels.map((l, i) => ({ name: l, value: (ds?.data?.[i] ?? 0) }))
                        const isTime = labels.length > 0 && /\d{4}-\d{2}/.test(labels[0])
                        if (isTime) {
                          return (
                            <LineChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} />
                              <ReTooltip />
                              <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} />
                            </LineChart>
                          )
                        }
                        const labelCount = data.length
                        const angle = labelCount > 8 ? -35 : 0
                        const height = labelCount > 8 ? 72 : 40
                        const interval: any = labelCount > 12 ? "preserveStartEnd" : 0
                        const fontSize = labelCount > 12 ? 10 : 11
                        const maxChars = labelCount > 8 ? 12 : 18
                        return (
                          <BarChart data={data} margin={{ left: 8, right: 8, bottom: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="name"
                              interval={interval}
                              height={height}
                              tickMargin={8}
                              angle={angle}
                              tick={{ fontSize }}
                              tickFormatter={(v: any) => shortenLabel(v, maxChars)}
                            />
                            <YAxis tick={{ fontSize: 11 }} />
                            <ReTooltip />
                            <Bar dataKey="value" fill="var(--chart-2)" radius={[4,4,0,0]} />
                          </BarChart>
                        )
                      })()}
                    </ResponsiveContainer>
                  </div>
                ) : null}
                {blk.table_data ? (
                  <div className="mt-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {blk.table_data.headers?.map((h: string | number, i: number) => (
                            <TableHead key={i} className="text-xs">{String(h)}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {blk.table_data.rows?.map((r: Array<string | number>, ri: number) => (
                          <TableRow key={ri}>
                            {r.map((c: string | number, ci: number) => (
                              <TableCell key={ci} className="text-xs">{String(c)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {/* Backward-compat single chart */}
        {role === "assistant" && meta?.chart_data && (
          <div className="mt-3 p-2 rounded-md bg-background border border-border">
            <div className="text-[11px] text-muted-foreground mb-2">Chart</div>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                {(() => {
                  const labels = meta.chart_data!.labels
                  const ds = meta.chart_data!.datasets?.[0]
                  const data = labels.map((l, i) => ({ name: l, value: (ds?.data?.[i] ?? 0) }))
                  const isTime = labels.length > 0 && /\d{4}-\d{2}/.test(labels[0])
                  if (isTime) {
                    return (
                      <LineChart data={data} margin={{ left: 8, right: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <ReTooltip />
                        <Line type="monotone" dataKey="value" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    )
                  }
                  const labelCount = data.length
                  const angle = labelCount > 8 ? -35 : 0
                  const height = labelCount > 8 ? 72 : 40
                  const interval: any = labelCount > 12 ? "preserveStartEnd" : 0
                  const fontSize = labelCount > 12 ? 10 : 11
                  const maxChars = labelCount > 8 ? 12 : 18
                  return (
                    <BarChart data={data} margin={{ left: 8, right: 8, bottom: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        interval={interval}
                        height={height}
                        tickMargin={8}
                        angle={angle}
                        tick={{ fontSize }}
                        tickFormatter={(v: any) => shortenLabel(v, maxChars)}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ReTooltip />
                      <Bar dataKey="value" fill="var(--chart-2)" radius={[4,4,0,0]} />
                    </BarChart>
                  )
                })()}
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {role === "assistant" && meta?.table_data && (
          <div className="mt-3 p-2 rounded-md bg-background border border-border">
            <div className="text-[11px] text-muted-foreground mb-2">Table</div>
            <Table>
              <TableHeader>
                <TableRow>
                  {meta.table_data.headers?.map((h: string | number, i: number) => (
                    <TableHead key={i} className="text-xs">{String(h)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {meta.table_data.rows?.map((r: Array<string | number>, ri: number) => (
                  <TableRow key={ri}>
                    {r.map((c: string | number, ci: number) => (
                      <TableCell key={ci} className="text-xs">{String(c)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
})
