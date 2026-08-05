# ZURI + Zuri API - Full Platform Inventory

**Document purpose:** A single source of truth for everything that exists on the ground today across the **ZURI** product app and the **Zuri API** developer platform - what they are, what problems they solve, what is built and launch-usable, tech stack, infrastructure, money rails, and known gaps.

**Scope of truth:** Code and docs in `ZURI/` and `Zuri API/` as of this inventory. "Ready for launch" here means **implemented in the product**, not "already verified live in production with every env wired." Ops verification (keys, webhooks, E2E in prod) remains a separate checklist.

**Brand / domain:** ZURI | zuriqo.com | yellow `#ffcd1c` | orange `#ffbd59` | cream `#fffdf5` | black `#000000` | fonts Syne / DM Sans / Inter

---

## Table of contents

1. [Executive summary - what ZURI is](#1-executive-summary--what-zuri-is)
2. [The two surfaces](#2-the-two-surfaces)
3. [Problems being solved](#3-problems-being-solved)
4. [What you can say at launch](#4-what-you-can-say-at-launch)
5. [ZURI app - full inventory](#5-zuri-app--full-inventory)
6. [Zuri API - full inventory](#6-zuri-api--full-inventory)
7. [How ZURI and Zuri API relate](#7-how-zuri-and-zuri-api-relate)
8. [Money, fees, and merchant-of-record](#8-money-fees-and-merchant-of-record)
9. [Trust, KYC, and risk (what exists today)](#9-trust-kyc-and-risk-what-exists-today)
10. [Tech stack (combined)](#10-tech-stack-combined)
11. [Infrastructure and deploy](#11-infrastructure-and-deploy)
12. [Integrations](#12-integrations)
13. [Security and platform hygiene](#13-security-and-platform-hygiene)
14. [Launch-ready vs not-yet / partial](#14-launch-ready-vs-not-yet--partial)
15. [Suggested launch narratives](#15-suggested-launch-narratives)
16. [File / repo map](#16-file--repo-map)

---

## 1. Executive summary - what ZURI is

**ZURI** is a commerce platform for African mid-level businesses and event organizers: digital menus, QR ordering, event ticketing, door check-in, payments, and bank payouts - built so operators can go live fast without assembling a custom stack.

It has two complementary products:

| Product | Who it's for | What it is |
|---------|--------------|------------|
| **ZURI** (app) | Venues, restaurants, cafés, hotels, event organizers | Finished product: storefronts, dashboards, QR, orders, tickets, Tap, Assist, analytics |
| **Zuri API** | Builders and organizers who want ZURI rails inside their own site/app | Developer platform: API keys, Zuri Terminal, events/tickets, check-in, MoR payouts, docs |

**Core commercial idea:** Speed. Mid-level businesses get professional tickets/orders/payments/door tooling without weeks of engineering or disproportionate processor KYC for every small operation.

**Core infrastructure idea (API):** ZURI acts as **merchant of record** - one verified Paystack (or Monnify) relationship - and organizers sit underneath with lighter onboarding, caps, and delayed payouts (Tier 0), with a path to deeper KYC later.

Together, the honest one-liner for launch:

> **ZURI is the fast way for African businesses to sell with menus or tickets, take payment, and check guests in - as a ready app, or as rails you plug into your own product.**

---

## 2. The two surfaces

```
                    ┌─────────────────────────────────────┐
                    │           ZURI PLATFORM             │
                    │   (brand, MoR, Paystack/Monnify,    │
                    │    email, SMS, bank payouts)        │
                    └───────────────┬─────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
              ▼                                           ▼
   ┌──────────────────────┐                 ┌──────────────────────────┐
   │     ZURI APP         │                 │      ZURI API            │
   │  zuriqo.com product  │                 │  Developer platform      │
   │                      │                 │                          │
   │  • Menu mode         │                 │  • API keys              │
   │  • Ticketing mode    │                 │  • Events / ticket types │
   │  • Business dashboard│                 │  • Zuri Terminal         │
   │  • Guest storefront  │                 │  • Public /e/:id pages   │
   │  • Scanner / Tap     │                 │  • Check-in / QR         │
   │  • Assist / AI       │                 │  • Tier 0 KYC + payouts  │
   │  • SaaS plans        │                 │  • Docs + SDK            │
   └──────────────────────┘                 └──────────────────────────┘
```

ZURI app is the **best-dressed first client** of the same commerce ideas. Zuri API makes those ideas **programmable** for external sites.

---

## 3. Problems being solved

### A. Building it yourself is too slow

QR codes, ticket inventory, checkout, door scanning, receipts, payouts - for a venue or one-off event this is weeks of engineering. Most mid-level operators do not have a technical co-founder or budget for a custom build.

**What exists:** End-to-end product flows in ZURI; end-to-end API + Terminal + scanner in Zuri API.

### B. Payment KYC is disproportionate

Accepting cards/transfers legitimately in Nigeria usually means full Paystack (or similar) KYC - documents, ownership, waiting. For many organizers and smaller businesses that friction kills the project; they fall back to "send money to my personal account."

**What exists (API):** Tier 0 - name, OTP phone, email, bank name-match - under ZURI as MoR, with volume caps and delayed payouts. ZURI app businesses also complete bank verification and can use split/subaccount or collect-then-transfer under the platform.

### C. Tool sprawl

Operators stitch a menu site + Paystack link + QR generator + spreadsheet door list. Staff fail on event night; money reconciliation is manual.

**What exists:** One stack - sell → pay → ticket/receipt → scan → payout status - in both the app and the API.

### D. In-venue payment chaos (ZURI app)

Tables, staff, offline transfers (Moniepoint/OPay SMS), POS terminals - matching "who paid for what" is messy.

**What exists:** Zuri Tap (staff→guest pay requests), Zuri Assist SMS payment matching, Paystack Terminal push.

### E. "We want our own website, not your branding" (API)

Some mid-level businesses want checkout and tickets on their domain.

**What exists:** API keys, purchase → Zuri Terminal → return to `success_url` with payment IDs; optional partner fulfill webhooks; white-label-leaning Terminal return flow.

---

## 4. What you can say at launch

These claims are grounded in shipped code (subject to production env being configured):

### Platform-level claims

- ZURI is a **live commerce product** for African venues and events: menus **and** ticketing.
- ZURI takes **NGN payments** via **Paystack** and/or **Monnify**, with **platform fees** and **bank payouts**.
- Guests can order or buy tickets from a **link or QR** - no app download required for buyers.
- Door staff can **scan ticket QRs** with a dedicated scanner flow (and scanner access codes on the app).
- There is a **developer platform (Zuri API)** with docs, API keys, hosted Terminal, check-in, and Tier 0 organizer onboarding.
- ZURI can act as **merchant of record** for API organizers (split/subaccount + held/delayed payouts).
- Brand is consistent: **ZURI**, zuriqo.com, yellow/orange system, Syne/DM Sans marketing language.

### Do **not** overclaim at launch

- Do not claim full **Tier 1/2 KYC** (BVN/NIN/CAC) - those API endpoints are **501 stubs**.
- Do not claim a finished **automated risk/underwriting engine** beyond Tier 0 caps + delayed payouts + bank match (the advanced rule table is designed, not fully built as a trust service).
- Do not claim Stripe-grade multi-region infra or formal SLAs unless ops has them.
- Do not claim OpenAPI/machine SDK maturity beyond the thin `zuri-client` helper.
- Realtime (Socket.IO) on ZURI requires the **long-lived API host** (e.g. Railway), not Vercel serverless alone.

---

## 5. ZURI app - full inventory

**Location:** `ZURI/`  
**Package name:** `zuri-qr-ordering@1.0.0`  
**Product names in UI:** ZURI / ZURI Quick Order | domain zuriqo.com

### 5.1 Product modes

| Mode | Purpose |
|------|---------|
| **Menu** | Restaurants, cafés, hotels, food halls - digital menu, cart, order, prep status, receipts |
| **Ticketing** | Events - ticket types (paid / free / invite-only), event landing pages, per-ticket QR, check-in |

Businesses choose mode in onboarding / settings (`business_mode`: `menu` | `ticketing`).

### 5.2 Who uses it

| Actor | How they get in |
|-------|-----------------|
| Business owner | Email/password → JWT (7d) |
| Guest / buyer | No account required; optional network/guest identity |
| Scanner staff | Short scanner access codes → scanner-scoped JWT |
| Tap customer | Separate Tap account (register/login) + Tap JWT |
| Platform admin | `ZURI_ADMIN_API_KEY` (API only - no admin UI in client) |

### 5.3 Marketing and public surfaces

| Surface | Route / page | Status |
|---------|--------------|--------|
| Landing | `/` | `Home.tsx` | Implemented |
| Pricing | `/pricing` | Implemented - Free / Starter ₦9,900 / Growth ₦24,900 / Scale ₦59,900 (+ yearly); Enterprise custom |
| Privacy / terms | `/privacy` | Implemented |
| Waitlist | `/waitlist` | Implemented |
| Demo | `/demo` | Implemented |
| Contact / beta | API `POST /api/contact` | Implemented (needs Resend) |

### 5.4 Business product features

| Feature | Status | Notes |
|---------|--------|-------|
| Register / login / onboarding | **Ready** | Mode, branding, Tap intro |
| Password reset | **Ready** | Email via Resend; token table |
| Menu CRUD + categories + images | **Ready** | Plan-gated limits |
| Stock / sold-out / low-stock | **Ready** | Schema + menu flows |
| AI menu digitize (photo/PDF) | **Ready** | Needs Anthropic key |
| Catalog presets | **Ready** | |
| Dish enrich / AI descriptions | **Ready** | Needs Anthropic |
| QR generate / branded QR | **Ready** | |
| Multi-storefront profiles | **Ready** | `storefront_profiles` |
| Storefront customizer (themes, fonts, event pages) | **Ready** | |
| AI storefront generate | **Ready** | Needs Anthropic; usage counters |
| Guest order page (menu) | **Ready** | `/order/:businessId[/:slug]` |
| Event ticketing landing | **Ready** | `/event/:businessId/:eventSlug` |
| Ticket rules (max/min per order, group, perks, pricing types) | **Ready** | |
| Per-ticket QR + verify / check-in | **Ready** | `order_ticket_qrs` |
| Scanner connect codes | **Ready** | `/scan/connect` |
| QR scanner UI | **Ready** | `/scan` |
| Order management dashboard | **Ready** | Status updates |
| Live order updates (Socket.IO) | **Ready on Railway-style host** | Mocked on Vercel serverless shim |
| Analytics (sales, peak hours, popular, profit, customer intel) | **Ready** | Growth+ gated |
| Reservations (guest + inbox) | **Ready** | |
| Reviews | **Ready on main server** | Ensure API host mounts reviews |
| Push notifications (Web Push / VAPID) | **Ready** | |
| Zuri Assist AI tab (insights, briefing, slow hours) | **Ready** | Scale+; needs Anthropic |
| Guest AI menu / languages / personalization | **Ready** | Growth+ surfaces |
| Zuri Tap (rooms, staff codes, pay sessions) | **Ready** | Growth+; Socket.IO |
| Zuri Assist SMS payment matching | **Ready** | Africa's Talking; parsers for bank SMS |
| Paystack Terminal push for unpaid orders | **Ready** | Settings: terminal ID |
| Payment provider choice (Paystack / Monnify) | **Ready** | Business payment page |
| Bank / NUBAN verify | **Ready** | |
| SaaS subscription billing (Paystack recurring) | **Ready** | Monnify path more one-time |
| Refunds | **Ready** | Business + admin API |
| Disputes | **Ready (API)** | Admin moderation API |
| Market / network customer insights | **Ready** | |
| Platform admin venues / refunds / disputes | **API ready** | No client admin UI |

### 5.5 Guest / buyer flows (ZURI app)

1. Scan QR or open link → menu or event page
2. Add items / select tickets → checkout
3. Pay via Paystack Inline/hosted or Monnify
4. Webhook marks order paid → receipt / ticket email
5. Ticketing: show QR(s); door staff scan → one-time use
6. Optional: reservation page, reviews after order, Tap pay flow

### 5.6 Money flows (ZURI app)

```
Order created (pending)
  → POST /api/payment/initialize
  → Guest pays (Paystack or Monnify)
  → Webhook verifies signature / payload
  → Order payment_status = paid
  → Receipt / ticket email
  → Settlement:
       • Paystack split (subaccount) when enabled + bank verified
       • OR collect-then-transfer to business recipient
       • Monnify: disbursement from platform wallet (no Paystack-style split)
```

**Platform transaction fees (defaults, env-overridable):**

| Mode | Fee |
|------|-----|
| Menu ordering | **1.5%** |
| Ticketing | **4% + ₦50** |

SaaS plan fees are separate (subscription to use ZURI).

### 5.7 ZURI app API surface (major prefixes)

Mounted from `ZURI/server/index.js`:

| Prefix | Responsibility |
|--------|----------------|
| `/api/business` | Register, login, profile, storefront, password, push |
| `/api/menu` | Public menu, CRUD, digitize, presets, images |
| `/api/order` | Create, list, status, refund, dispute, ticket invite |
| `/api/payment` | Initialize, verify, webhooks, saved cards, charge-saved, refund |
| `/api/subscription` | Plan checkout, verify, cancel, manage link |
| `/api/qr` | Generate, ticket image/verify, scanner codes |
| `/api/analytics` | Sales and intelligence |
| `/api/ai` | Assist insights, storefront generate, etc. |
| `/api/agent` | SMS inbound, alerts, confirm, Terminal charge |
| `/api/tap` + `/api/tap-auth` | Tap rooms/sessions + Tap user auth |
| `/api/banks` | List banks + resolve account |
| `/api/reservations` | Create + manage |
| `/api/reviews` | Create + list |
| `/api/network` | Market insights |
| `/api/admin` | Venues, status, refunds, disputes, provision subaccount |
| `/api/contact` | Contact form |
| `/api/health` | Health |

### 5.8 ZURI app client routes

| Route | Purpose |
|-------|---------|
| `/` | Marketing home |
| `/pricing` | Plans |
| `/privacy` | Legal |
| `/order/:businessId/...` | Guest menu |
| `/event/:businessId/:eventSlug` | Event tickets |
| `/payment-done`, `/upgrade-done` | Post-payment |
| `/subscribe/:plan` | Plan summary checkout |
| `/scan`, `/scan/connect` | Scanner |
| `/reserve/:businessId` | Reservations |
| `/zuri-tap`, `/tap/*` | Tap marketing + customer flows |
| `/business/login|forgot|reset` | Business auth |
| `/business/onboarding/:id` | Onboarding |
| `/business/dashboard/:id` | Main ops dashboard |
| `.../customize` | Storefront customizer |
| `.../payment` | Provider, bank, subscriptions |
| `.../settings` | Assist agent + Terminal |
| `/demo`, `/waitlist` | Demo / waitlist |
| `*` | 404 |

Dashboard tabs include: **orders | analytics | menu | QR | Zuri Assist (AI)** plus Tap and mode controls.

### 5.9 ZURI database (high level)

Postgres via Supabase. Migrations `001`-`032` under `ZURI/supabase/migrations/`.

**Core:** `businesses`, `categories`, `menu_items`, `orders`, `order_items`, `saved_cards`, `reservations`, `reviews`, `zuri_tap_users`, `zuri_network_customers`

**Notable later tables / columns:** ticket QR (`order_ticket_qrs`), scanner codes, push subscriptions, Tap state/staff/sessions, Assist agent SMS/alerts, Paystack terminal ID, disputes, password reset tokens, storefront profiles, subscription fields, payment provider, bank verification / subaccount codes, stock fields, business_mode, etc.

App auth is **API JWT**, not Supabase Auth (server uses service role).

### 5.10 ZURI tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind 3, React Router 6, Axios, Recharts, Socket.IO client, html5-qrcode, Paystack Inline JS |
| Backend | Node ≥20, Express 4, Socket.IO, Helmet, rate-limit, JWT, bcrypt, multer, sharp, qrcode |
| DB | Supabase Postgres + Storage |
| Payments | Paystack SDK; custom Monnify client |
| Email | Resend |
| AI | Anthropic Claude SDK |
| SMS | Africa's Talking |
| Push | web-push (VAPID) |
| Scale optional | Redis + Socket.IO Redis adapter |

### 5.11 ZURI deploy pattern

| Piece | Typical host |
|-------|----------------|
| SPA + OG HTML rewrites | **Vercel** (`vercel.json`) |
| Long-lived API + Socket.IO + webhooks | **Railway** (or similar; `nixpacks.toml`) |
| Client points at API | `VITE_API_URL` → Railway origin |

**Important:** `ZURI/api/index.js` (Vercel serverless) mocks Socket.IO. Production realtime and reliable webhooks should hit the long-lived server.

---

## 6. Zuri API - full inventory

**Location:** `Zuri API/`  
**Package name:** `zuri-api@1.0.0`  
**Positioning:** Embeddable ticketing, QR & payments - developer platform under the ZURI family

### 6.1 Product identity

| Concept | Meaning in product |
|---------|-------------------|
| **Developer platform** | Landing, docs, register/login, dashboard (keys, events, bank, payouts) |
| **Merchant of record** | Buyers pay ZURI; organizers are subaccounts / transfer recipients |
| **Tier 0** | Instant-ish onboarding: name, OTP, email, bank match; caps; 5%+₦50; T+3 payouts |
| **Zuri Terminal** | Hosted review-and-pay UI; returns buyer to merchant `success_url` |
| **API keys** | `zuri_live_...` for server-side integration |
| **Tier 1 / 2** | Designed in fees/caps; **KYC endpoints stubbed 501** |

### 6.2 Who uses it

| Actor | Auth |
|-------|------|
| Organizer (dashboard) | Register → OTP → JWT |
| Partner app / website | `X-API-Key` / `X-Zuri-Api-Key` |
| Buyer | No account; public purchase → Terminal |
| Door scanner | Scanner JWT for event |
| Platform ops | `X-Zuri-Admin-Key` |

### 6.3 Developer platform UI (client)

Local UI port **5174**. Routes in `Zuri API/client/src/App.tsx`:

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Landing | Product marketing - social commerce infrastructure for tickets, QR, payouts |
| `/docs/*` | Docs | Overview, integrate, quickstart, Terminal, auth, keys, events, payments, check-in, payouts, full reference |
| `/register` | Register | Tier 0 signup + OTP |
| `/login` | Login | Session |
| `/dashboard` | Dashboard | Organizer home |
| `/dashboard/keys` | API keys | Create / list / revoke |
| `/dashboard/events` | Events | List / create |
| `/dashboard/events/:id` | Event detail | Ticket types, insights, publish |
| `/dashboard/payouts` | Payouts | Balance / settle |
| `/dashboard/bank` | Bank setup | Tier 0 bank KYC |
| `/e/:id` | Public event | Buyer-facing checkout entry |
| `/terminal/:purchaseId` | Terminal | Hosted pay |
| `/terminal/done` | Terminal done | QR + merchant return |
| `/scan/:eventId` | Scan | Door scanner |
| `/payment-done` | Payment done | Alt completion |
| `/playground/pay` | Playground | Mock pay when no live keys |

### 6.4 Features (API product)

| Feature | Status |
|---------|--------|
| Organizer register + OTP (email and/or SMS) | **Ready** |
| Password login + JWT | **Ready** |
| Tier 0 bank verify + soft name-match | **Ready** |
| Tier 1 KYC (BVN/NIN, address, liveness) | **Stub 501** |
| Tier 2 KYC (CAC) | **Stub 501** |
| API keys CRUD | **Ready** |
| Partner fulfill webhook URL (HMAC `purchase.paid`) | **Ready** |
| Events CRUD + public config + event QR | **Ready** |
| Ticket types (paid/free/invite_only, capacity, perks) | **Ready** |
| Public purchase (no API key on buyer call) | **Ready** |
| Zuri Terminal + Paystack init | **Ready** |
| Merchant return (`success_url`, `auto_return`) | **Ready** |
| Free ticket fulfill (₦0) | **Ready** |
| Paystack webhook + verify | **Ready** |
| Dev mock-complete / playground pay | **Ready** |
| Ticket mint + QR tokens | **Ready** |
| Ticket email (Resend) | **Ready** |
| Check-in + log + scanner token | **Ready** |
| Event insights | **Ready** |
| Payout balance / history / settle | **Ready** |
| Delayed eligibility (`payout_eligible_at`) | **Ready** |
| Payout-on-Demand | **Blocked until Tier ≥1** (403) |
| Admin settle-payouts + checkouts list | **Ready** |
| Banks list | **Ready** |
| Cancel unpaid purchase | **Ready** |
| Refund request record | **Partial** - records request; not full provider refund automation |
| Thin JS SDK (`sdk/zuri-client.js`) | **Ready (minimal)** |
| INTEGRATE.md 15-minute guide | **Ready** |

### 6.5 End-to-end partner flow (canonical)

```
Partner site
  → POST /v1/events/:id/purchase  (+ success_url, items, buyer_email)
  → Response includes terminal.url
  → Redirect buyer to Zuri Terminal
  → Buyer reviews + pays (Paystack)
  → Webhook / verify → mint tickets + email QR
  → Optional signed partner webhook purchase.paid
  → Buyer returns to success_url?purchase_id&payment_id&status=paid...
  → Door: POST /v1/events/:id/checkin with ticket token
  → After event + T+3: settle organizer share to bank
```

Documented in `Zuri API/INTEGRATE.md` and `/docs/integrate`.

### 6.6 API endpoint catalog

All routes mount under **`/v1` and `/api`** (`server/index.js`). Local API port **3100**.

**Health / banks**

- `GET /health`
- `GET /banks`

**Auth**

- `POST /auth/register`
- `POST /auth/otp/verify`
- `POST /auth/otp/resend`
- `POST /auth/login`

**Organizers / KYC**

- `GET /organizers/me`
- `GET /organizers/:id/kyc/status`
- `POST /organizers/:id/kyc/tier0/bank`
- `POST /organizers/:id/kyc/tier1` → **501**
- `POST /organizers/:id/kyc/tier2` → **501**

**Developers**

- `POST|GET /developers/api-keys`
- `DELETE /developers/api-keys/:id`
- `PUT|GET|DELETE /developers/fulfill-webhook`

**Events and tickets**

- `POST|GET /events`
- `GET|PATCH /events/:id`
- `POST /events/:id/qr`
- `POST|GET /events/:id/tickets/types`
- `PATCH|DELETE /events/:id/tickets/types/:type_id`

**Purchases / Terminal**

- `POST /events/:id/purchase` (public)
- `GET /purchases/:id` (optional `?qr=1`)
- `GET /purchases/:id/terminal`
- `POST /purchases/:id/cancel`
- `POST /purchases/:id/refund` (manual request)

**Payments**

- `POST /payments/webhook`
- `GET /payments/verify/:reference`
- `POST /payments/mock-complete` (dev)

**Check-in**

- `POST /events/:id/checkin`
- `GET /events/:id/checkin/log`
- `POST /events/:id/checkin/scanner-token`

**Insights**

- `GET /events/:id/insights`

**Payouts**

- `GET /organizers/:id/payouts/balance`
- `GET /organizers/:id/payouts/history`
- `POST /organizers/:id/payouts/settle`
- `POST /organizers/:id/payouts/request` (Tier 1+)

**Admin**

- `GET /admin/health`
- `POST /admin/settle-payouts`
- `GET /admin/checkouts`

### 6.7 Tier 0 trust / commercial defaults

From `server/lib/fees.js` and `.env.example`:

| Control | Default |
|---------|---------|
| Per-event volume cap | ₦500,000 |
| Rolling 30-day cap | ₦1,000,000 |
| Max tickets / event | 500 |
| Platform fee | **5% + ₦50** |
| Payout delay | **T+3** after event end/start |
| Min transfer | ₦50 |
| Cap breach | Block purchase + prompt Tier 1 (`tier1_required`) |

Fee tables for Tier 1 (4%+₦50) and Tier 2 (3.5%+₦50) exist in code for future graduation; KYC paths not live yet.

### 6.8 Zuri API database

Tables (prefix `api_`):

| Table | Role |
|-------|------|
| `api_organizers` | Merchants, KYC tier/status, bank, subaccount/recipient, volumes |
| `api_otp_challenges` | OTP challenges |
| `api_keys` | Hashed API keys |
| `api_events` | Events / storefronts |
| `api_ticket_types` | Ticket products |
| `api_purchases` | Orders + payment + payout state |
| `api_purchase_items` | Line items |
| `api_ticket_qrs` | Per-ticket tokens + used_at |
| `api_checkin_log` | Scan audit |
| `api_payout_requests` | Transfer batches |

Migrations: `001_zuri_api_schema.sql`, `002_payment_provider.sql`, `003_fulfill_webhook.sql`, plus `APPLY_IN_DASHBOARD.sql`.

**Storage modes** (`database.js`):

1. **supabase** - full `api_*`
2. **bridge** - organizers may map onto ZURI `businesses` if API schema incomplete (risky for prod)
3. **local** - `.local-store/db.json` for offline/dev

### 6.9 Zuri API tech stack

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind, React Router, Axios |
| Backend | Node ≥20, Express 4, Helmet, rate-limit, JWT, bcrypt, qrcode |
| DB | Supabase / Postgres (`pg` available); local JSON fallback |
| Payments | Paystack SDK; Monnify validate + disburse |
| Email | Resend (OTP + tickets) |
| SMS OTP | Africa's Talking (optional) |
| SDK | ESM + CJS thin clients |

### 6.10 Zuri API deploy

| Piece | Detail |
|-------|--------|
| Vercel | `vercel.json` builds client; `/api` + `/v1` → Express `api/index.js`; SPA fallback |
| Local | API `:3100`, UI `:5174` |
| Settle cron | In-process interval on long-lived Node; **on Vercel call** `POST /admin/settle-payouts` on a schedule |
| Prod secrets | JWT ≥32 chars; Paystack and/or Monnify required |

---

## 7. How ZURI and Zuri API relate

| ZURI app concept | Zuri API concept |
|------------------|------------------|
| `businesses` | `api_organizers` (optional bridge to `businesses`) |
| Menu items / ticket SKUs | `api_ticket_types` |
| Event / storefront pages | `api_events` + `/e/:id` |
| `orders` + `order_ticket_qrs` | `api_purchases` + `api_ticket_qrs` |
| Split / MoR settlement | Same pattern (bank KYC + Paystack subaccount / transfers) |
| Brand tokens | Shared yellow/orange/Syne language |

They are **separate codebases**, same product family. Launch story:

- **ZURI** = use our product and go live today
- **Zuri API** = build on our rails inside your own product

Same company, same money stack philosophy, two distribution surfaces.

---

## 8. Money, fees, and merchant-of-record

### Providers on the ground

| Provider | ZURI app | Zuri API |
|----------|----------|----------|
| Paystack checkout | Yes | Yes (primary Terminal path) |
| Paystack split / subaccounts | Yes | Yes |
| Paystack transfers / recipients | Yes | Yes |
| Paystack refunds | Yes (app) | Partial (request record on API) |
| Paystack Terminal POS | Yes (Assist) | N/A as product surface |
| Paystack subscriptions (SaaS) | Yes | N/A |
| Monnify checkout | Yes | Limited (bank/disburse stronger than card checkout) |
| Monnify disbursements | Yes | Yes |

### Fee snapshot

| Product | Flow | Default take |
|---------|------|--------------|
| ZURI app | Menu orders | 1.5% |
| ZURI app | Ticketing | 4% + ₦50 |
| ZURI app | SaaS plans | Starter / Growth / Scale monthly or yearly |
| Zuri API | Tier 0 purchases | 5% + ₦50 |
| Zuri API | Tier 1/2 (code-ready) | 4% / 3.5% + ₦50 |

### MoR pattern (especially API)

1. Buyer pays ZURI's merchant account
2. Platform fee computed
3. Organizer share recorded
4. Either **split at charge** (subaccount) or **held → transfer after eligibility**
5. Tier 0 eligibility delayed (T+3) as fraud buffer

---

## 9. Trust, KYC, and risk (what exists today)

### Implemented now

| Control | Where |
|---------|--------|
| OTP phone/email verification | API (and related email patterns on app) |
| Bank account resolve + name match (soft/advisory on API) | Both |
| Volume / ticket caps + upgrade prompt | Zuri API Tier 0 |
| Delayed payouts (held until eligible) | Zuri API |
| Higher fee on lighter KYC tier | Zuri API fee table |
| Suspend / account status fields | App compliance migrations; API `kyc_status` |
| Admin settle / checkout visibility | API admin routes |
| Disputes / refunds tooling | Stronger on ZURI app |

### Designed but not fully built as a product

Automated volume-aware trust engine (rule table: new-account delays, ghost-event check-in freezes, pre-payout review queue, progressive BVN/NIN, etc.) - **specified in product thinking; not a complete shipped trust service yet**. Tier 1/2 KYC endpoints are stubs.

**Launch honesty:** You can say Tier 0 MoR with caps and delayed payouts. You should not yet say "fully automated underwriting."

---

## 10. Tech stack (combined)

| Concern | Choice |
|---------|--------|
| Language | JavaScript / TypeScript |
| Runtime | Node.js ≥ 20 |
| API | Express |
| Web UI | React + Vite + Tailwind |
| DB | Supabase (PostgreSQL) |
| Auth | Custom JWT + bcrypt (not Supabase Auth) |
| Realtime | Socket.IO (+ optional Redis) - ZURI app |
| Payments | Paystack, Monnify |
| Email | Resend |
| SMS | Africa's Talking |
| AI | Anthropic Claude - ZURI app |
| QR | `qrcode` + html5-qrcode scanners |
| Hosting | Vercel (frontend / serverless) + Railway-style API for ZURI |
| Package manager | npm |

---

## 11. Infrastructure and deploy

### ZURI app

```
Buyers / businesses
        │
        ▼
   Vercel (SPA + OG)
        │  VITE_API_URL
        ▼
   Railway / long-lived Node (Express + Socket.IO)
        │
        ├── Supabase Postgres + Storage
        ├── Paystack / Monnify webhooks
        ├── Resend
        ├── Africa's Talking
        └── Anthropic
```

### Zuri API

```
Developers / organizers / buyers
        │
        ▼
   Vercel (docs UI + /v1|/api Express)  OR  long-lived Node :3100
        │
        ├── Supabase api_* tables  (or local JSON in dev)
        ├── Paystack webhooks
        ├── Resend + optional Africa's Talking
        └── Admin settle cron (external if serverless)
```

### Shared ops realities

- Webhook URLs must be publicly reachable and signed/verified
- Production JWT secrets must be strong
- Email (Resend) required for real OTP / tickets / receipts
- Without payment keys, both products fall back to mock/dev paths where enabled
- Free-tier Supabase needs monitoring under load

---

## 12. Integrations

| Integration | Used by | Purpose |
|-------------|---------|---------|
| Supabase | Both | Database (+ storage on app) |
| Paystack | Both | Checkout, banks, splits, transfers, (app) Terminal/subscriptions/refunds |
| Monnify | Both | Alternate payments / disbursements |
| Resend | Both | Transactional email |
| Africa's Talking | Both | SMS (OTP on API; Assist agent on app) |
| Anthropic | ZURI app | Assist, digitize, storefront AI |
| Web Push | ZURI app | Business notifications |
| Redis | ZURI app (optional) | Multi-instance Socket.IO |
| Vercel | Both | Frontend / serverless |
| Railway / Nixpacks | ZURI app | Production API |

---

## 13. Security and platform hygiene

Present in codebases:

- Helmet
- CORS allowlists / `FRONTEND_URL`
- Rate limiting on auth and sensitive routes
- JWT scoped tokens (business, organizer, scanner, Tap)
- API key hashing (SHA-256); plaintext shown once at creation
- Paystack webhook signature verification
- Admin key timing-safe compare (API)
- Production secret gates (fail start if weak/missing where enforced)
- Password hashing (bcrypt)
- ErrorBoundary on ZURI client (generic message in production)

Not fully in place:

- Sentry / full observability (called out as optional / open on ZURI launch docs)
- Automated test suite / CI (not a first-class part of these trees)
- OpenAPI machine-readable spec for Zuri API

---

## 14. Launch-ready vs not-yet / partial

### Launch-ready if env + E2E verified

**ZURI app**

- Dual mode menu + ticketing storefronts
- Business onboarding and dashboard
- Paystack (and Monnify) checkout + webhooks
- Bank setup, payouts/splits
- Ticket QR + scanner
- SaaS plans (Paystack recurring)
- Tap, Assist SMS, Terminal (with AT / Paystack Terminal configured)
- AI features (with Anthropic)
- Marketing site, pricing, privacy

**Zuri API**

- Tier 0 organizer onboarding
- Docs + landing developer platform
- API keys + purchase → Terminal → tickets → check-in
- Caps, fees, delayed payout settle path
- Partner return URLs + fulfill webhooks
- Admin settle/checkouts

### Partial / caution

| Item | Caution |
|------|---------|
| Socket.IO on ZURI | Needs long-lived API host |
| Monnify SaaS recurring | Weaker than Paystack auto-renew |
| API refunds | Request record vs full provider refund |
| API volume_30d | Incremented; rolling decay job not clearly automated |
| Bridge DB mode | Don't use as production primary |
| Reviews on Vercel-only API | Prefer Railway mount |
| Name-match KYC | Soft - not hard identity |

### Not launch features yet

- Tier 1 / Tier 2 KYC completion flows
- Full automated risk engine / ops review console from the rule table
- Rich multi-language SDKs / OpenAPI
- Client admin console for platform moderation
- Formal uptime SLA / status page (unless added outside these repos)

---

## 15. Suggested launch narratives

### For mid-level businesses (ZURI app)

> Go live with digital menus or event tickets, QR, payments, and door check-in - without building it yourself. Get paid to your bank.

**Demo path:** signup → mode → add menu or tickets → QR → test pay → scan → payout settings.

### For builders (Zuri API)

> Plug tickets, Terminal checkout, QR, and payouts into your product. Buyers pay through Zuri; you get IDs back for your own success pages.

**Demo path:** register → bank → API key → create event → purchase from docs/curl → Terminal → scan → settle.

### Combined platform line

> **ZURI** is how African businesses sell and get paid fast. **Zuri API** is how other products run on the same rails.

### What makes it "Zuri" (not a feature list)

- Speed for mid-level operators
- Menus **and** tickets in one family
- QR + door as first-class, not an afterthought
- NGN-native Paystack/Monnify reality
- MoR + Tier 0 path for organizers who can't wait on full processor KYC
- Assist / Tap as venue-ops depth competitors often skip

---

## 16. File / repo map

### ZURI

```
ZURI/
├── client/                 # React SPA
├── server/                 # Express + Socket.IO
├── api/                    # Vercel shim
├── supabase/migrations/    # 001-032
├── scripts/
├── vercel.json
├── nixpacks.toml
├── README.md
├── LAUNCH_READINESS.md
├── DEPLOYMENT_CHECKLIST.md
├── ZURI_PLATFORM_FULL_INVENTORY.md   # this document
└── package.json
```

### Zuri API

```
Zuri API/
├── client/                 # Developer platform UI
├── server/                 # Express /v1 + /api
├── api/index.js            # Vercel Express entry
├── sdk/                    # zuri-client.js / .cjs
├── supabase/migrations/    # api_* schema
├── README.md
├── INTEGRATE.md
├── vercel.json
└── package.json
```

---

## Closing - "What's on the ground?"

If you launched **today** with both codebases configured in production, you would be launching:

1. A **full hospitality + events product** (ZURI) with ordering, ticketing, QR, payments, payouts, Tap, Assist, AI, analytics, and SaaS billing.
2. A **developer platform** (Zuri API) with Tier 0 MoR onboarding, API keys, Terminal checkout, tickets, check-in, docs, and delayed payouts.
3. A **shared commercial thesis**: speed for mid-level African businesses - sell and operate without assembling the stack from scratch.
4. Real **NGN payment infrastructure** via Paystack/Monnify, not a mock-only demo (when keys are live).
5. Clear **next moats to build** (Tier 1+ KYC, automated trust engine) that deepen MoR safety - without blocking a Tier 0 + ZURI-app launch narrative.

That is ZURI and Zuri API as they exist on disk: not a pitch deck fantasy, and not yet a finished global infrastructure company - but a **substantial, dual-surface commerce platform** you can truthfully introduce.

---

*End of inventory.*