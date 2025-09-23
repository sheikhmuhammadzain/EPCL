"use client"

import React from "react"

type Section = {
  id: string
  label: string
  icon?: React.ReactNode
}

export default function MobileSectionNav({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const observers: IntersectionObserver[] = []
    const handleObserve: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute("id")
          if (id) {
            setActiveId(id)
          }
        }
      }
    }
    const opts: IntersectionObserverInit = {
      rootMargin: "-120px 0px -70% 0px",
      threshold: [0, 0.25, 0.5, 1],
    }
    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (!el) return
      const ob = new IntersectionObserver(handleObserve, opts)
      ob.observe(el)
      observers.push(ob)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [sections])

  return (
    <nav className="md:hidden sticky top-16 z-30" aria-label="Sections">
      <div className="rounded-lg border border-border bg-card/80 backdrop-blur">
        <ul className="flex items-center gap-2 overflow-x-auto px-2 py-2">
          {sections.map((s) => {
            const isActive = activeId === s.id
            return (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  className={
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (isActive
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-primary/10")
                  }
                  aria-current={isActive ? "page" : undefined}
                >
                  {s.icon}
                  <span>{s.label}</span>
                </a>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}


