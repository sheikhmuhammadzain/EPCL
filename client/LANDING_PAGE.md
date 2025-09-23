# EPCL Landing Page Specification

This document defines the sections, copy, and design guidelines for a professional marketing landing page for the EPCL application.

The plan is tailored to the current app functionality found in your codebase:
- Dashboard with safety analytics (`src/components/SafetyDashboard.tsx`) showing KPIs, incidents, hazards, audits, inspections, and a location heatmap.
- Excel upload flow (embedded in the dashboard) with charts fetched from an API base `NEXT_PUBLIC_API_BASE`.
- AI Chat Assistant (`src/components/chat/ChatWidget.tsx`) that opens an external chat at http://103.18.20.205:8501/.
- Brand and design tokens in `src/app/globals.css` (Engro green palette), fonts set via Geist.


## Goals
- Communicate EPCL’s value clearly (safety insights, fast data-to-insight via Excel upload, and AI assistant).
- Drive primary conversions: Open Dashboard, Upload Excel, Open Chat.
- Provide product proof via chart previews and a guided “How it works”.


## Audience
- HSE Managers and Plant Supervisors who need quick safety oversight.
- Data/BI Analysts who need ad-hoc queries and drilldowns.


## Primary CTAs
- Launch Dashboard → route: `/dashboard`
- Upload Excel → anchor to upload card on dashboard (see implementation notes)
- Open Chat → http://103.18.20.205:8501/


---
# Information Architecture (Sections)

1) Hero
- Headline: “Proactive Safety Intelligence for EPCL Operations”
- Subtext: “Unify incidents, hazards, audits, and inspections into a single, actionable view. Upload Excel, explore interactive charts, ask our AI assistant, and get answers instantly.”
- Primary CTAs (buttons):
  - Launch Dashboard (/dashboard)
  - Upload Excel (scroll to Upload on dashboard)
  - Open Chat (103.18.20.205:8501)
- Visual: Branded hero with EPCL logo, soft radial gradient using `--color-primary` and mint background.

2) Social Proof / Trusted By
- Show EPCL logo and any internal teams. Use `public/engro_logo.png` if appropriate.
- Short line: “Built for EPCL, aligned with Engro’s safety excellence standards.”

3) Value Props (3–4 cards)
- Unified Safety Analytics: “A single dashboard for incidents, hazards, audits, inspections.”
- Self‑Serve AI Assistant: “Ask natural language questions about your data.”
- Fast Excel Uploads: “Upload .xlsx/.xls and get instant visual insights.”

4) Feature Highlights (Chart Previews)
- Incidents — Types & Top Locations (pie and horizontal bar preview from dashboard)
- Hazards — Monthly Trend (line preview)
- Entries by Category (bar preview)
- Location Heatmap (grid preview)
- Notes:
  - On the landing page, prefer static screenshots or lightweight Lottie/PNG for performance. Link each preview to open `/dashboard#<section>`.

5) How It Works (3–4 steps)
- Step 1: Upload Excel — “Drop your file; we process .xlsx/.xls.”
- Step 2: Explore Dashboard — “KPIs and charts update like magic.”
- Step 3: Ask the AI — “Get answers in plain English.”
- Step 4: Deep‑Dive via Advanced Filters — “Use dashboard filters and breakdowns for deeper analysis.”

6) Use Cases (Personas)
- HSE Manager: “Track hazard trends and top incident locations by area.”
- Analyst: “Time series, comparisons, and AI‑powered questions.”
- Plant Supervisor: “Spot hotspots with the heatmap and act faster.”

7) Integrations & Data Sources
- Today: Excel (.xlsx/.xls)
- Next: Direct database connectors (optional roadmap line).

8) Security & Trust
- “Runs within EPCL network endpoints (links shown above), configurable API base.”
- “Role‑based access (planned) and audit trails (optional).”

9) FAQ
- What data formats are supported? → Excel (.xlsx/.xls)
- How do I get started? → Click “Launch Dashboard” and upload an Excel file.
- Can I query specific months/years? → Yes, use the AI assistant.

10) Final CTA Banner
- Headline: “Get instant safety intelligence across your operations.”
- Button Row: Launch Dashboard, Upload Excel, Open Chat

11) Footer
- Quick links: Dashboard, Chat, Privacy, Terms
- EPCL logo and copyright.


---
# Navigation and Header
- Left: EPCL logo (`/public/logo.png`)
- Right nav links: Features, How it Works, Use Cases, FAQ
- Right CTA (accent): Launch Dashboard
- Sticky with subtle blur (match current top bar style in `src/app/page.tsx`).


# Design System & Visual Style
- Colors: Use the tokens defined in `src/app/globals.css`
  - Primary (Engro green): `--color-primary: #16a34a`
  - Background: `--color-background: #f7fdf9`
  - Muted/Accent tokens for subtle sections
- Typography: Geist Sans & Mono already configured in `src/app/layout.tsx`
- Components: Reuse card polish (`.card-elevated`) and soft separators (`.separator-soft`)
- Spacing: Keep comfortable paddings (hero ~ top/bottom 64–96px on desktop)
- Illustrations: Soft radial gradients via CSS; avoid heavy 3D artwork
- Icons: `lucide-react` for consistent iconography
- Animations: Subtle transitions or small reveal effects


# Copy Guidelines
- Focus on outcomes: “Faster oversight. Fewer surprises. Clear action.”
- Use concrete nouns (incidents, hazards, audits, inspections) and reflect actual dashboard terminology.
- Keep headlines short; support with a sub‑line.
- CTA labels should be action‑oriented (Launch Dashboard, Upload Excel, Ask AI).


# SEO & Meta
- Title: “EPCL VEHS — Safety Intelligence Dashboard”
- Description: “Upload Excel, explore incidents and hazards, and query your data with AI.”
- Social image: Use a lightweight dashboard composite (PNG) showing green accents.


# Accessibility Notes
- Ensure 4.5:1 contrast for text against `--color-background`.
- Add `alt` text for all images (logo, screenshots).
- Keyboard navigability for all CTA buttons.


---
# Routing Plan (Non‑breaking)
Your current dashboard is served at `src/app/page.tsx`. To introduce a marketing landing page without disrupting the dashboard:

Option A (Recommended, clean grouping)
- Move the dashboard to: `src/app/dashboard/page.tsx`
  - Create the folder `src/app/dashboard/` and move the current `page.tsx` there.
- Add a new marketing landing at root: `src/app/page.tsx`
- Update header CTAs on the landing page to link to `/dashboard` and external endpoints.

Option B (Aliases)
- Keep dashboard at `/`
- Create a marketing page at `/home` and configure external entry points to `/home`.
- Not recommended if you want `/` to be a marketing page.


# Suggested Component Structure for Landing Page
- `src/app/(marketing)/page.tsx` — main landing route
- `src/components/marketing/Hero.tsx`
- `src/components/marketing/ValueProps.tsx`
- `src/components/marketing/FeaturePreviews.tsx`
- `src/components/marketing/HowItWorks.tsx`
- `src/components/marketing/UseCases.tsx`
- `src/components/marketing/Faq.tsx`
- `src/components/marketing/FinalCta.tsx`


# CTA Links & Behaviors
- Launch Dashboard → `/dashboard`
- Upload Excel → Navigate to `/dashboard` and auto‑scroll to the upload card (implementation idea: query param `?focus=upload` and let the dashboard scroll to the upload section on mount)
- Open Chat → `http://103.18.20.205:8501/` (opens in new tab)


# Assets Needed
- High‑quality PNG of the dashboard (wide aspect) for hero/feature previews
- EPCL/Engro logo with transparent background


# Implementation Notes (when building)
- Keep the new landing page lightweight: static images for chart previews, minimal JS.
- Reuse color tokens and fonts to stay on brand with the dashboard.
- Preserve the sticky header pattern from the dashboard (`page.tsx` top bar) for visual continuity.
- Consider adding a tiny announcement bar (e.g., “Beta”) if relevant.


---
## Sample Section Wireframes (content, not code)

Hero
- H1: Proactive Safety Intelligence for EPCL Operations
- P: Unify incidents, hazards, audits, and inspections into a single, actionable view. Upload Excel, explore interactive charts, ask our AI assistant, and get answers instantly.
- Buttons: Launch Dashboard • Upload Excel • Open Chat
- Visual: Logo + gradient + dashboard composite image

Value Props
- 4 cards with icon, title, and single line value statement.

Feature Previews
- Grid of 2×2 with static images, small captions, and links to `/dashboard#incidents`, `/dashboard#hazards`, `/dashboard#location-heatmap`.

How It Works
- 4 simple steps with icons.

Use Cases
- Three persona cards with brief scenarios.

FAQ
- 5–6 short Q/As.

Final CTA
- Concise headline + button row repeating primary CTAs.
