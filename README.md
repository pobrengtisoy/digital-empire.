# RZ DIGITAL EMPIRE — EDITION 005

**Company identity: RZ. Marketplace: RZ Digital Empire.**

A source-controlled, handcrafted editorial digital-products showroom running on Cloudflare Workers static assets. Four browser-local, functioning showcases are available, including the first fully editable website sample.

## Product lineup (November 2026)

Thirteen working product demos, each with its own visual identity for its trade. RZ Menu, RZ Mine, RZ Upa and RZ Bahay also run on real accounts (see Backend below); the rest are browser-only. Every page has a “Make it yours” panel (name, details, Messenger username) saved in the visitor's browser. Order, booking and RSVP pages copy a ready-made message and open the owner's Messenger chat; they do not send anything to a server.

| # | Product | For | Page |
|---|---|---|---|
| 01 | RZ Menu | Restaurants & cafés: online menu, orders to Messenger | `products/menu/` |
| 02 | RZ Shop | Online sellers: catalog, sizes/colours, bag, Messenger checkout | `products/shop/` |
| 03 | RZ Booking | Salons, spas, clinics: services, day and time slots, booking request | `products/booking/` |
| 04 | RZ Stay | Resorts & rentals: photos, rates, availability calendar, quote | `products/stay/` |
| 05 | RZ Listahan | Sari-sari stores: utang/credit tracker, reminders, backups | `products/listahan/` |
| 06 | RZ Invite | Debuts, weddings, events: invitation, countdown, RSVP, calendar file | `products/invite/` |
| 07 | RZ Liga | Leagues: round-robin schedule, scores, standings (playoffs via RZ Arena) | `products/liga/` |
| 08 | RZ Quote | Contractors & freelancers: quotation → invoice, print/PDF | `products/quote/` |
| 09 | RZ Sahod | Small teams: payroll helper, payslips, 13th-month estimate | `products/sahod/` |
| 10 | RZ Tindahan | Small shops: point of sale, stock, daily sales and profit | `products/tindahan/` |

Shared pieces: `products/kit.js` (safe DOM helpers, storage, Messenger hand-off, downloads), `products/kit.css` (the demo strip), self-hosted fonts in `products/fonts/`, screenshots for the homepage in `assets/shots/`. Catalog data: `products.js`.

Earlier demos are still in the repository and still deployed but no longer listed on the homepage: RZ Ledger (`tools/invoice.html`), RZ Arena (`tools/bracket.html`, used by RZ Liga for playoffs), RZ Insight (`tools/report.html`), RZ Form (`site-template.html`) and RZ Edition Office (`templates.html`).

**Not implemented:** checkout, payments, customer accounts, server-side orders or bookings, owner dashboards, hosted customer sites, licences. Do not claim these exist.

## Backend (Phase 1: RZ Menu ordering)

A Cloudflare Worker (`worker/index.js`) answers `/api/*`; everything else is served as static files. Data lives in Cloudflare D1 (binding `DB`, database `rz-empire`, created in the Cloudflare dashboard and referenced by ID in `wrangler.jsonc`). Tables create themselves on first request.

- **Owner dashboard:** `/dashboard/` — create an account, edit the menu, receive orders (refreshes every 10 s, sound and browser alerts while open), move orders through New → Accepted → Preparing → Ready → Completed, change shop settings.
- **Live menu for a real shop:** `/products/menu/?shop=<link-name>` loads that shop's menu, places real orders and shows the customer live status. Without `?shop=` the page stays the browser-only demo.
- **Security:** PBKDF2 password hashing, random session tokens stored hashed, HttpOnly SameSite cookies, same-origin check on every write, prices always recomputed on the server, input limits, rate limits on sign-up, log-in and ordering.
- **Gmail alerts:** owners can save an email and switch alerts on, but sending starts only after a custom domain is connected to Cloudflare (Cloudflare email sending needs one).
- **Personal data:** orders hold customer names, numbers and addresses. The Philippine Data Privacy Act applies; a privacy notice is shown on the order form. Owners can delete orders. A full privacy policy and data-retention rule are still to do.
- **Local development:** `npx wrangler dev --local` runs the Worker with a local D1 database.

## Buying RZ products

- Every product card, product page top bar and the details dialog has a **Buy** button that opens `/buy/?p=<product>`.
- **Prices** (setup + monthly, or per event/season) are set in `worker/index.js` (`PRICES`, the official list the server charges) and shown from `products.js`. Change both together.
- **Payment:** QR Ph (Maya Business account “SQUAREBOYS”, image at `assets/pay/qrph-squareboys.png`, redrawn from the merchant code and verified identical). The buyer pays the shown amount, enters the payment reference number and their details. The server records the purchase with its own price, rejects reused reference numbers and rate-limits submissions.
- **RZ Sales inbox:** dashboard tab visible only to accounts whose email is listed in the Cloudflare secret `ADMIN_EMAILS` (comma-separated). Mark each purchase Paid, Setting up, Done, Refunded or Cancelled after checking the reference in Maya Business; download CSV.
- **Contact:** Telegram @BRZBSST (nav, footer, checkout).
- **Not yet:** automatic payment confirmation (Maya Checkout API keys needed), receipts by email, Telegram bot.

## Local development

Pure HTML, CSS and JavaScript; no build process required.

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/index.html`.

## Current Cloudflare deployment setup

Repository: `pobrengtisoy/digital-empire.` (yes, the trailing dot is part of the repository name).

- Cloudflare Workers static assets via `wrangler.jsonc`
- Git-connected production branch `main`
- Build command: `exit 0`
- Deploy command: `npx wrangler deploy`
- `.assetsignore` keeps internal docs/config out of static bundle
- Account's initial successful deployment was confirmed in the user's screenshot

Live address: `https://digital-empire.rzdigital.workers.dev/`.

We verified V0.5 content in GitHub. The external checker did not independently render the deployed V0.5 pages, so **re-check Cloudflare deployment status** before calling the updated live site confirmed.

## Privacy, limitations and commercial readiness

- Brand settings are **browser-local** (`localStorage`). Photos are resized in the browser. Browser data removal or local storage limits can lose work; export a JSON kit for backup.
- The site editor supports a **single page** and client-side color themes, not a full CMS or drag-and-drop page builder.
- Imported files are bounded and parsed as data. User copy is inserted with `textContent` rather than HTML.
- RZ has no backend customer records, secure downloads, receipt validation, order inbox or hosted client site provisions yet.
- The repository is public. **Never commit credentials, payment keys, licensed private product source code or customer files** here.
- Terms and Privacy: `/terms/`. Owners can delete their account from Dashboard → Settings.
- Still to do for a full launch: backends for the other nine products, customer custom domains, automatic payment verification and email sending.
- The RZ mark is an original temporary code-drawn identity and may be replaced with the official approved RZ company logo if provided. The logo upload field serves the demo customer identity, not a permanent rebrand of the RZ marketplace itself.

## Next priorities

1. Customer-visible editable website template packaging and export/deployment capability.
2. Secure server-side inquiry collection, spam prevention and an owner dashboard (after backend authorization).
3. Private licensed downloads and verified payments, then done-for-you deployment services.

Design guardrail: bespoke identities, editorial layouts and native responsiveness. **Do not replace this with generic AI-looking dashboards, floating cards or stock gradients.**
