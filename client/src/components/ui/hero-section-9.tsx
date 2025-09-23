import * as React from "react"
import { cn } from '@/lib/utils'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'

const menuItems = [
    { name: 'Features', href: '#' },
    { name: 'Solution', href: '#' },
    { name: 'Pricing', href: '#' },
    { name: 'About', href: '#' },
]

// Subtle, professional typewriter for the last words of the headline
function Typewriter({
  words,
  typingSpeed = 100,
  deletingSpeed = 70,
  pauseMs = 1600,
  className,
}: {
  words: string[]
  typingSpeed?: number
  deletingSpeed?: number
  pauseMs?: number
  className?: string
}) {
  const [index, setIndex] = React.useState(0)
  const [subIndex, setSubIndex] = React.useState(0)
  const [deleting, setDeleting] = React.useState(false)
  const [paused, setPaused] = React.useState(false)

  const reduceMotion = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  React.useEffect(() => {
    if (reduceMotion) return
    if (paused) {
      const t = setTimeout(() => setPaused(false), pauseMs)
      return () => clearTimeout(t)
    }
    const current = words[index % words.length] || ''
    const timeout = setTimeout(() => {
      if (!deleting) {
        if (subIndex < current.length) {
          setSubIndex((s) => s + 1)
        } else {
          setPaused(true)
          setDeleting(true)
        }
      } else {
        if (subIndex > 0) {
          setSubIndex((s) => s - 1)
        } else {
          setDeleting(false)
          setIndex((i) => (i + 1) % words.length)
        }
      }
    }, deleting ? deletingSpeed : typingSpeed)
    return () => clearTimeout(timeout)
  }, [words, index, subIndex, deleting, paused, typingSpeed, deletingSpeed, pauseMs, reduceMotion])

  const current = words[index % words.length] || ''
  const text = reduceMotion ? current : current.slice(0, subIndex)

  return (
    <span className={cn("whitespace-pre", className)}>
      {text}
      <span className="ml-0.5 inline-block w-px h-[1em] align-[-0.1em] bg-current animate-[blink_1.3s_step-end_infinite]" />
      {/* Scoped keyframes for caret blink */}
      <style jsx>{`
        @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
      `}</style>
    </span>
  )
}

export const HeroSection = () => {
    const [menuState, setMenuState] = React.useState(false)
    const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'Safety Co-Pilot'
    const SITE_TAGLINE = process.env.NEXT_PUBLIC_SITE_TAGLINE || 'Safety Intelligence'
    const HERO_HEADLINE = process.env.NEXT_PUBLIC_HERO_HEADLINE || 'Proactive Safety Intelligence for Your Operations'
    const HERO_SUBHEAD = process.env.NEXT_PUBLIC_HERO_SUBHEAD || 'Unify incidents, hazards, audits, and inspections into a single, actionable view. Upload Excel, explore interactive charts, ask our AI assistant, and get answers instantly.'
    // Derive a professional animated suffix (last two words by default), and cycle a few variants
    const tokens = React.useMemo(() => HERO_HEADLINE.trim().split(/\s+/), [HERO_HEADLINE])
    const tail = tokens.length >= 2 ? tokens.slice(-2).join(' ') : tokens.join(' ')
    const prefix = tokens.length >= 2 ? tokens.slice(0, -2).join(' ') : ''
    const animatedWords = React.useMemo(() => [tail, 'Every Site', 'Every Shift'], [tail])
    return (
        <div>
            <header>
                <nav
                    data-state={menuState && 'active'}
                    className="group fixed z-20 w-full border-b border-border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/50 md:relative">
                    <div className="m-auto max-w-5xl px-6">
                        <div className="flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
                            <div className="flex w-full justify-between lg:w-auto">
                                <Link
                                    href="/"
                                    aria-label="home"
                                    className="flex items-center gap-2">
                                    <span className="relative inline-flex h-8 w-8 items-center justify-center">
                                        <Image src="/logo.png" alt={SITE_NAME} fill sizes="32px" className="object-contain" />
                                    </span>
                                    <span className="hidden sm:inline leading-tight">
                                        <span className="block text-sm font-semibold">{SITE_NAME}</span>
                                        <span className="block text-[11px] text-muted-foreground">{SITE_TAGLINE}</span>
                                    </span>
                                </Link>

                                <button
                                    onClick={() => setMenuState(!menuState)}
                                    aria-label={menuState == true ? 'Close Menu' : 'Open Menu'}
                                    className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden">
                                    <Menu className="group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                    <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                                </button>
                            </div>

                            <div className="bg-background group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                                <div className="lg:pr-4">
                                    <ul className="space-y-6 text-base lg:flex lg:gap-8 lg:space-y-0 lg:text-sm">
                                        {menuItems.map((item, index) => (
                                            <li key={index}>
                                                <Link
                                                    href={item.href}
                                                    className="text-muted-foreground hover:text-accent-foreground block duration-150">
                                                    <span>{item.name}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit lg:border-l lg:pl-6">
                                    <Button asChild size="sm">
                                        <Link href="/dashboard">
                                            <span>Launch Dashboard</span>
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
            </header>

            <main>
                <div
                    aria-hidden
                    className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block">
                    <div className="w-[35rem] h-[80rem] -translate-y-87.5 absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
                    <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
                    <div className="h-[80rem] -translate-y-87.5 absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
                </div>

                <section className="overflow-hidden bg-background">
                    <div className="relative mx-auto max-w-5xl px-6 py-28 lg:py-24">
                        <div className="relative z-10 mx-auto max-w-2xl text-center">
                            <h1 className="text-balance text-4xl font-semibold md:text-5xl lg:text-6xl">
                                {prefix}
                                {prefix ? ' ' : ''}
                                <span className="inline-block text-primary">
                                  <Typewriter words={animatedWords} />
                                </span>
                            </h1>
                            <p className="mx-auto my-8 max-w-2xl text-xl">{HERO_SUBHEAD}</p>

                            <Button
                                asChild
                                size="lg">
                                <Link href="/dashboard">
                                    <span className="btn-label">Launch Dashboard</span>
                                </Link>
                            </Button>
                        </div>
                    </div>

                    <div className="mx-auto -mt-16 max-w-7xl [mask-image:linear-gradient(to_bottom,black_50%,transparent_100%)]">
                        <div className="[perspective:1200px] [mask-image:linear-gradient(to_right,black_50%,transparent_100%)] -mr-16 pl-16 lg:-mr-56 lg:pl-56">
                            <div className="[transform:rotateX(20deg);]">
                                <div className="lg:h-[44rem] relative skew-x-[.36rad]">
                                    <img
                                        className="rounded-[--radius] z-[2] relative border dark:hidden"
                                        src="/heropic.png"
                                        alt="Analytics dashboard preview"
                                        width={2880}
                                        height={2074}
                                    />
                                    <img
                                        className="rounded-[--radius] z-[2] relative hidden border dark:block"
                                        src="https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=2880&q=75"
                                        alt="Analytics dashboard preview (dark)"
                                        width={2880}
                                        height={2074}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                <section className="bg-background relative z-10 py-16">
                    <div className="m-auto max-w-5xl px-6">
                        <h2 className="text-center text-lg font-medium">Your favorite companies are our partners.</h2>
                        <div className="mx-auto mt-20 flex max-w-4xl flex-wrap items-center justify-center gap-x-12 gap-y-8 sm:gap-x-16 sm:gap-y-12">
                            <img
                                className="h-5 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/nvidia.svg"
                                alt="Nvidia Logo"
                                height="20"
                                width="auto"
                            />
                            <img
                                className="h-4 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/column.svg"
                                alt="Column Logo"
                                height="16"
                                width="auto"
                            />
                            <img
                                className="h-4 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/github.svg"
                                alt="GitHub Logo"
                                height="16"
                                width="auto"
                            />
                            <img
                                className="h-5 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/nike.svg"
                                alt="Nike Logo"
                                height="20"
                                width="auto"
                            />
                            <img
                                className="h-4 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/laravel.svg"
                                alt="Laravel Logo"
                                height="16"
                                width="auto"
                            />
                            <img
                                className="h-7 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/lilly.svg"
                                alt="Lilly Logo"
                                height="28"
                                width="auto"
                            />
                            <img
                                className="h-5 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/lemonsqueezy.svg"
                                alt="Lemon Squeezy Logo"
                                height="20"
                                width="auto"
                            />
                            <img
                                className="h-6 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/openai.svg"
                                alt="OpenAI Logo"
                                height="24"
                                width="auto"
                            />
                            <img
                                className="h-4 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/tailwindcss.svg"
                                alt="Tailwind CSS Logo"
                                height="16"
                                width="auto"
                            />
                            <img
                                className="h-5 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/vercel.svg"
                                alt="Vercel Logo"
                                height="20"
                                width="auto"
                            />
                            <img
                                className="h-5 w-fit dark:invert"
                                src="https://html.tailus.io/blocks/customers/zapier.svg"
                                alt="Zapier Logo"
                                height="20"
                                width="auto"
                            />
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}
