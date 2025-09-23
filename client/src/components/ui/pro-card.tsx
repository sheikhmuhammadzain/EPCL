import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export interface ProCardProps extends React.HTMLAttributes<HTMLDivElement> {
  href?: string
}

export default function ProCard({ href, className, children, ...props }: ProCardProps) {
  const content = (
    <div
      className={cn(
        "group relative rounded-xl bg-gradient-to-b from-border/80 to-transparent p-[1px] transition-shadow h-full",
        "hover:shadow-lg",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "relative rounded-xl border border-border/60 bg-card transition-transform duration-300 h-full flex flex-col",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:bg-[radial-gradient(120%_60%_at_50%_0%,hsl(var(--primary)/0.08),transparent)] before:opacity-0 before:transition-opacity",
          "group-hover:-translate-y-0.5 group-hover:before:opacity-100"
        )}
      >
        {children}
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl">
        {content}
      </Link>
    )
  }
  return content
}
