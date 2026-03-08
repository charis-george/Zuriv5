# Zuri Network – Cross-Business Customer Identity

## 1. Goals

- **One customer identity across all Zuri businesses**  
  A customer who buys from Restaurant A is recognized when they visit Restaurant B (and any other Zuri business).

- **Preferences remembered**  
  (Phase 2) Name, contact, and later dietary/favorite items can follow the customer.

- **Payment one-tap next time**  
  At a new business, we recognize them as a Zuri customer and can offer to save card for one-tap there too; where they already have a card, one-tap works as today.

- **Businesses see returning Zuri customers**  
  At order/checkout or in dashboard, Business B sees: *“Returning Zuri customer – average spend ₦4,500”* so they can tailor service or promotions.

---

## 2. Current State (Baseline)

| Concept | Current model | Limitation |
|--------|----------------|------------|
| **Customer on order** | `orders.customer_email`, `customer_phone`, `customer_name` | No global id; same person at two businesses is two unrelated rows. |
| **Saved cards** | `saved_cards(email, business_id)` unique | One card per business per email; no notion of “same customer across businesses”. |
| **Tap users** | `zuri_tap_users(email, …)` | Separate from storefront orders; no shared identity. |
| **Analytics** | Customer intelligence per business by `customer_email` | “Returning” and “avg spend” are per-business only. |

So today there is **no cross-business identity** and **no Zuri-wide customer stats**.

---

## 3. Design Principles

- **Identity by email (and optionally phone)**  
  Normalize email (lowercase, trim); use it as the primary key for “who is this customer” across businesses. Phone can be a secondary linker later.

- **Backward compatible**  
  Existing orders stay valid without a network customer id; we backfill and set the id for new orders.

- **Privacy-aware**  
  Businesses do not see other businesses’ orders or PII. They only see **aggregate stats** for a customer (e.g. “Returning Zuri customer – average spend ₦4,500”, “Ordered from 3 Zuri businesses”). No sharing of which businesses or which orders.

- **Incremental**  
  Phase 1: identity + stats + “Returning Zuri customer” badge. Phase 2: preferences, optional cross-business card UX, Tap ↔ Network linkage.

---

## 4. Data Model

### 4.1 New table: `zuri_network_customers`

Global identity; one row per customer (per normalized email).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Stable global customer id. |
| `email_normalized` | TEXT UNIQUE NOT NULL | Lowercase, trimmed email. |
| `phone_normalized` | TEXT | Optional; normalized phone (digits only or E.164) for future linking. |
| `first_seen_at` | TIMESTAMPTZ | First order (or first link) across Zuri. |
| `last_seen_at` | TIMESTAMPTZ | Most recent order/link. |
| `created_at` | TIMESTAMPTZ | Row creation. |
| `updated_at` | TIMESTAMPTZ | Last update. |

- **Index:** `UNIQUE(email_normalized)`; index on `phone_normalized` when present.
- **Resolution:** On first order or first Tap sign-in with email, ensure a row exists (insert if not exists), then use `id` everywhere as `zuri_customer_id`.

### 4.2 Orders: link to network customer

Add to `orders`:

| Column | Type | Description |
|--------|------|-------------|
| `zuri_customer_id` | UUID NULL FK → zuri_network_customers(id) | Set when we can resolve identity (e.g. from customer_email). |

- **Nullable** so old orders and orders without email stay valid.
- **Backfill:** Run a one-off (or background job) that, for each order with `customer_email`, resolves/creates `zuri_network_customers` and sets `zuri_customer_id`.

### 4.3 Optional: link saved_cards to network customer

Add to `saved_cards`:

| Column | Type | Description |
|--------|------|-------------|
| `zuri_customer_id` | UUID NULL FK → zuri_network_customers(id) | Denormalized for quick “is this a Zuri customer?” at checkout. |

- **Optional:** We can derive “has card at this business” and “is Zuri customer” from `saved_cards.email` + lookup in `zuri_network_customers`; the column avoids an extra join when showing “Returning Zuri customer” and “Save card for one-tap”.

### 4.4 Zuri-wide customer stats (view or table)

Businesses need **aggregate** stats for a customer, without seeing other businesses’ data.

**Option A – Materialized view / cached table (recommended)**  
Table `zuri_network_customer_stats`:

| Column | Type | Description |
|--------|------|-------------|
| `zuri_customer_id` | UUID PK FK | One row per network customer. |
| `total_orders` | INT | Count of orders across all businesses. |
| `total_spend` | DECIMAL(10,2) | Sum of order totals (paid/completed only if you want revenue-only). |
| `avg_order_value` | DECIMAL(10,2) | total_spend / total_orders. |
| `business_count` | INT | Number of distinct businesses they ordered from. |
| `last_order_at` | TIMESTAMPTZ | Most recent order. |
| `updated_at` | TIMESTAMPTZ | Last recompute. |

- Updated by: scheduled job or trigger after order insert/update (only aggregates, no PII).
- **Access:** API that, given `zuri_customer_id`, returns these fields. Called by backend when a business views an order or checkout for a given email; backend resolves email → `zuri_customer_id` then loads stats. Business never sees raw orders from other businesses.

**Option B – On-the-fly query**  
Query `orders` grouped by `zuri_customer_id` (with `zuri_customer_id NOT NULL`) and compute the same aggregates. Simpler but heavier at scale; fine for Phase 1.

### 4.5 Tap users ↔ Network (Phase 2)

- **Option 1:** Add `zuri_customer_id` to `zuri_tap_users`. On Tap sign-in/sign-up, resolve email → `zuri_network_customers.id` (create if needed) and set it. Then Tap users are first-class network customers.
- **Option 2:** Keep Tap separate; only “link” when the same email appears on a storefront order. Same resolution (email → `zuri_network_customers`), no schema change to Tap until you want Tap profile to drive “Returning Zuri customer” from Tap alone.

Recommendation: Phase 1 use **storefront orders only** to build `zuri_network_customers` and stats; Phase 2 add `zuri_tap_users.zuri_customer_id` and backfill so Tap users contribute to and benefit from the network.

---

## 5. Identity Resolution (How we get `zuri_customer_id`)

- **Inputs:** `customer_email` (required for now), optionally `customer_phone`.
- **Steps:**
  1. Normalize email: `lowercase(trim(customer_email))`. If empty, leave `zuri_customer_id` NULL.
  2. `SELECT id FROM zuri_network_customers WHERE email_normalized = $1`.
  3. If found → use that `id` as `zuri_customer_id`.
  4. If not found → `INSERT INTO zuri_network_customers (email_normalized, first_seen_at, last_seen_at) VALUES ($1, NOW(), NOW()) RETURNING id`; use that `id`.
  5. When writing an order, set `orders.zuri_customer_id` to this id.
  6. Optionally update `zuri_network_customers.last_seen_at` (and stats) when the order is created/updated.

- **Phone (later):** If we add `phone_normalized`, we can have a second path: look up by phone; if found, link order to that `zuri_customer_id` and optionally merge/update email if different (careful with privacy).

---

## 6. APIs and Flows

### 6.1 Create order (storefront)

- **Current:** Client sends `customer_email`, `customer_phone`, `customer_name`; server creates order with those fields.
- **New:**
  1. Server resolves `customer_email` → `zuri_customer_id` (create network customer if needed).
  2. Set `orders.zuri_customer_id`.
  3. (Optional) Return a flag `isReturningZuriCustomer: true` and `zuriCustomerStats: { avgOrderValue, totalOrders, businessCount }` so the storefront can show a badge or prefill.

### 6.2 Business views order (dashboard)

- When listing or opening an order that has `zuri_customer_id`:
  - Backend loads stats from `zuri_network_customer_stats` (or computes from orders where `zuri_customer_id = orders.zuri_customer_id`).
  - Return to dashboard: e.g. `returningZuriCustomer: true`, `zuriCustomerAvgSpend: 4500`, `zuriCustomerOrderCount: 12`, `zuriCustomerBusinessCount: 3`.
- Dashboard shows: *“Returning Zuri customer – average spend ₦4,500 (12 orders across 3 Zuri businesses)”*.

### 6.3 Checkout / payment page (storefront)

- When customer enters email (or is already known from session):
  1. Resolve email → `zuri_customer_id` and fetch stats.
  2. If they have a saved card at **this** business → one-tap as today.
  3. If they are a Zuri customer but **no** card at this business → show: *“You’re a Zuri customer. Save your card after this payment for one-tap next time.”* (Same as today; we just add the “Zuri customer” copy.)
  4. (Phase 2) Optional: “Use card from [Other Business]?” if we support cross-business card reuse and Paystack allows it.

### 6.4 Saved cards

- Keep `(email, business_id)` uniqueness.
- When saving a card after payment, set `saved_cards.zuri_customer_id` from email resolution so we can quickly know “this card belongs to a network customer”.
- No need to expose cross-business card list to the business; only “this customer has a card here” and “this customer is a returning Zuri customer with avg spend ₦X”.

---

## 7. Privacy and Consent

- **What businesses see:** Only aggregate stats for the customer (avg spend, order count, business count). No list of other businesses, no other businesses’ order details.
- **What we store:** We already store `customer_email` (and phone) on the order; we are only adding a global id and precomputed aggregates. No new PII from the business’s perspective.
- **Consent:** Option A – Implicit: using Zuri to pay implies we use data to recognize you across Zuri businesses and show businesses aggregate stats. Option B – Explicit: add a checkbox “Allow Zuri to recognize me across Zuri businesses for faster checkout and tailored service” and only set `zuri_customer_id` when true; store consent in `zuri_network_customers`. Recommendation: start with Option A; add Option B if you need it for compliance or positioning.

---

## 8. Phasing and Migration

### Phase 1 – Minimum viable Zuri Network

1. **Schema**
   - Add `zuri_network_customers` table.
   - Add `orders.zuri_customer_id` (nullable FK).
   - Add `zuri_network_customer_stats` (or equivalent view/table).
2. **Resolution**
   - In order-creation API, resolve `customer_email` → create/get `zuri_network_customers`, set `orders.zuri_customer_id`.
3. **Stats**
   - After order create/update, recompute stats for that `zuri_customer_id` (total orders, total spend, avg, business count, last order).
4. **APIs**
   - Order create: return optional `isReturningZuriCustomer` and `zuriCustomerStats` for the storefront.
   - Dashboard: when fetching order(s), include `returningZuriCustomer` and stats for orders that have `zuri_customer_id`.
5. **UI**
   - Storefront: show “Returning Zuri customer” (and e.g. “Avg spend ₦X”) when stats exist.
   - Dashboard: on order detail or list, show “Returning Zuri customer – average spend ₦X (Y orders across Z businesses)”.
6. **Backfill**
   - One-off script: for all orders with `customer_email` and no `zuri_customer_id`, resolve/create network customer and set `zuri_customer_id`; then recompute stats.

### Phase 2 – Preferences and Tap linkage

- Add `zuri_tap_users.zuri_customer_id`; on Tap sign-in/sign-up, link to `zuri_network_customers`.
- Optional: `zuri_network_customers.preferences` (JSONB) for dietary, favorites, etc., filled from Tap or storefront over time.
- Optional: cross-business “save card once” or “use card from another Zuri business” if product and Paystack support it.

### Phase 3 – Business Graph (anonymous market insights)

- Use `zuri_network_customers` and orders for anonymous, aggregate market insights (“demand in your area +22%”) without exposing any business’s or customer’s data.
- **Access:** Business Graph features (e.g. market insights, area demand trends) are available **only on Pro plan and above**. Gate all Business Graph APIs and UI with `canAccessProFeatures(plan)` (or equivalent) so that Free, Starter, and Growth do not see or call these features.

---

## 9. Example: Restaurant A → Restaurant B

1. **Customer orders at Restaurant A**  
   Email `john@example.com`, order ₦5,000.  
   - We create/link `zuri_network_customers` for `john@example.com`, set `orders.zuri_customer_id`.  
   - Stats: 1 order, ₦5,000, avg ₦5,000, 1 business.

2. **Same customer orders at Restaurant B**  
   Email `john@example.com`.  
   - Resolution finds same `zuri_customer_id`.  
   - Order is stored with that id.  
   - Stats updated: 2 orders, ₦9,000 total (e.g.), avg ₦4,500, 2 businesses.

3. **Restaurant B’s dashboard**  
   When they open this order, API returns:  
   `returningZuriCustomer: true`, `zuriCustomerAvgSpend: 4500`, `zuriCustomerOrderCount: 2`, `zuriCustomerBusinessCount: 2`.  
   UI shows: *“Returning Zuri customer – average spend ₦4,500 (2 orders across 2 Zuri businesses).”*

4. **Checkout at Restaurant B**  
   Storefront can show “Welcome back! You’re a Zuri customer. Save your card after payment for one-tap next time here.”

---

## 10. Summary

| Component | Purpose |
|-----------|--------|
| `zuri_network_customers` | Single global identity per customer (keyed by normalized email). |
| `orders.zuri_customer_id` | Links every order to a network customer when email is present. |
| `zuri_network_customer_stats` | Precomputed Zuri-wide aggregates (orders, spend, avg, business count). |
| Resolution on order create | Create/find network customer from email; set `zuri_customer_id`. |
| Dashboard API | Return “Returning Zuri customer” and stats when viewing orders. |
| Storefront API | Optionally return same for checkout UX and “Save card for one-tap” copy. |

This gives you **one customer identity across all Zuri businesses** and **businesses seeing “Returning Zuri customer – average spend ₦X”** without exposing other businesses’ data, and sets the base for preferences and Tap linkage in a later phase.
