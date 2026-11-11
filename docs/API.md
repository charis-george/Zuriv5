# API and authentication

Base URL locally: `http://localhost:3000`. All JSON routes are under `/api`. Unknown `/api` paths return JSON 404, not the SPA.

## Authentication

Business owners log in with email and password. The response includes a JWT. Send it as `Authorization: Bearer <token>`. The token lasts 7 days and its `sub` is the business id. Routes that use `requireBusinessAuth` reject a missing or bad token with 401.

Scanner staff get a different JWT (`scope: "scanner"`) from `POST /api/qr/scanner-codes/redeem`. That token can verify ticket QR codes. It cannot open the dashboard, and those routes respond 403.

Tap customers have their own register and login under `/api/tap-auth`. Those tokens are separate from the business JWT.

Platform admin routes under `/api/admin` expect `X-Zuri-Admin-Key` (or `Authorization: Bearer <admin key>`). If `ZURI_ADMIN_API_KEY` is unset the routes return 503. A wrong key returns 401.

Payment webhooks are not user-authenticated. Paystack must sign the raw body with `x-paystack-signature` (HMAC SHA-512 of the body, using `PAYSTACK_SECRET_KEY`). Monnify sends `monnify-signature`. A bad Paystack signature is 401 and the order is not touched.

Business socket rooms (`join-business`) also require the business JWT. A token for one venue cannot join another venue's room.

## Orders

`POST /api/order`

```json
{
  "businessId": "uuid",
  "customerName": "Ada Okonkwo",
  "customerPhone": "08012345678",
  "customerEmail": "ada@example.com",
  "items": [{ "menuItemId": "uuid", "quantity": 2, "specialNotes": "no pepper" }]
}
```

Validation before insert:

- name, a phone number of at least 7 digits, and an email
- at least one menu item that belongs to that business and the active catalog
- quantities are clamped to 1–99
- prices come from the menu, not from the client
- invite-only tickets are rejected
- ticketing mode enforces per-buyer limits, group size, and remaining stock

The venue must be allowed to take orders. A suspended or disabled venue returns 403.

`GET /api/order/business/:businessId` requires the business token.
`PATCH /api/order/:id/status` requires the business token and only updates that venue's order.

## Payments

`POST /api/payment/initialize` with `email`, `amount`, `orderId`, `businessId`. `amount` must equal the stored order total. An order that is already paid is rejected.

`GET /api/payment/verify/:reference` checks Paystack or Monnify and, if the charge succeeded and the amount matches, marks the order paid. Calling it again after the order is paid returns success and does not settle a second time.

`POST /api/payment/webhook` and `POST /api/payment/monnify-webhook` are the provider callbacks. Settlement goes through one decision:

| Order state | Result |
| --- | --- |
| Not paid, amount matches | Mark paid once, queue receipt, schedule payout |
| Already paid, receipt not sent | Retry the receipt only |
| Already paid, receipt sent | No further writes |
| Amount does not match | No write. Paystack still gets HTTP 200 so it does not retry forever. |

`POST /api/payment/refund/:orderId` requires the business token.

## Other groups

| Prefix | Auth | Role |
| --- | --- | --- |
| `/api/business` | Public for register and login. Bearer after that. | Account, storefront, password |
| `/api/menu` | Public read of a venue menu. Bearer to edit. | Catalog |
| `/api/qr` | Mixed | Table QR and ticket scan |
| `/api/reservations` | Public create. Bearer to list and update. | Bookings |
| `/api/subscription` | Bearer | Plan checkout |
| `/api/tap`, `/api/tap-auth` | Tap user or business token, depending on the route | Zuri Tap |
| `/api/analytics`, `/api/ai`, `/api/agent` | Bearer | Dashboard insights and payment-alert matching |
| `/api/admin` | Admin key | Venue status and refunds |
| `/api/contact` | Public, rate limited | Demo and waitlist form |
| `/api/health` | Public | Process status |

Login, register, and payment routes are rate limited.
