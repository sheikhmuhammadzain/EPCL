"use client"

import React from "react"
import Image from "next/image"

import { LayoutDashboard, Bell, User, MessageCircle } from "lucide-react"
import SafetyDashboard from "@/components/SafetyDashboard"
import ChatWidget from "@/components/chat/ChatWidget"

export default function Page() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/50 shadow-sm">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="flex h-16 md:h-20 items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative inline-flex h-16 w-16 md:h-20 md:w-28 items-center justify-center rounded-md text-primary-foreground">
                <Image src="/logo.png" alt="EPCL" fill sizes="(min-width: 768px) 112px, 64px" className="object-contain" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold">EPCL VEHS Safety</p>
                <p className="text-[11px] text-muted-foreground">Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Chat"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-primary/10"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.open('http://103.18.20.205:8501/', '_blank', 'noopener,noreferrer')
                  }
                }}
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Notifications"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-primary/10"
              >
                <Bell className="h-4 w-4" />
              </button>
              <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="hidden text-sm md:inline">Analyst</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Only */}
      <main className="mx-auto max-w-7xl px-4 md:px-6 py-4 md:py-6">
        <SafetyDashboard />
      </main>

      {/* Floating Chat Bubble/Window (uncontrolled & portal-mounted) */}
      <ChatWidget />
    </div>
  )
}