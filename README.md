# RZ DIGITAL EMPIRE — EDITION 005

**Company identity: RZ. Marketplace: RZ Digital Empire.**

A source-controlled, handcrafted editorial digital-products showroom running on Cloudflare Workers static assets. Four browser-local, functioning showcases are available, including the first fully editable website sample.

## Product lineup (November 2026)

Ten working, browser-only product demos, each with its own visual identity for its trade. Every page has a “Make it yours” panel (name, details, Messenger username) saved in the visitor's browser. Order, booking and RSVP pages copy a ready-made message and open the owner's Messenger chat; they do not send anything to a server.

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

User-provided live address: `https://digital-empire.ronnieredugo.workers.dev/`.

We verified V0.5 content in GitHub. The external checker did not independently render the deployed V0.5 pages, so **re-check Cloudflare deployment status** before calling the updated live site confirmed.

## Privacy, limitations and commercial readiness

- Brand settings are **browser-local** (`localStorage`). Photos are resized in the browser. Browser data removal or local storage limits can lose work; export a JSON kit for backup.
- The site editor supports a **single page** and client-side color themes, not a full CMS or drag-and-drop page builder.
- Imported files are bounded and parsed as data. User copy is inserted with `textContent` rather than HTML.
- RZ has no backend customer records, secure downloads, receipt validation, order inbox or hosted client site provisions yet.
- The repository is public. **Never commit credentials, payment keys, licensed private product source code or customer files** here.
- Before commercial launch, implement a secure customer project and storefront backend, private deliverables, real payment verification, legal terms and privacy policy.
- The RZ mark is an original temporary code-drawn identity and may be replaced with the official approved RZ company logo if provided. The logo upload field serves the demo customer identity, not a permanent rebrand of the RZ marketplace itself.

## Next priorities

1. Customer-visible editable website template packaging and export/deployment capability.
2. Secure server-side inquiry collection, spam prevention and an owner dashboard (after backend authorization).
3. Private licensed downloads and verified payments, then done-for-you deployment services.

Design guardrail: bespoke identities, editorial layouts and native responsiveness. **Do not replace this with generic AI-looking dashboards, floating cards or stock gradients.**
