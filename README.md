# RZ DIGITAL EMPIRE — EDITION 005

**Company identity: RZ. Marketplace: RZ Digital Empire.**

A source-controlled, handcrafted editorial digital-products showroom running on Cloudflare Workers static assets. Four browser-local, functioning showcases are available, including the first fully editable website sample.

## First editable website — RZ Form / No. 009

[Open RZ Form](site-template.html) to explore the first editable business landing-page specimen.

- Four-part visual layout: oversized editorial hero, business story, services ledger, and contact callout.
- Three original site treatments: Archive, Blackbook, and Signal.
- Edit business name, small identity label, hero text, business story, all three service descriptions, contact message, button label, and safe contact destination.
- Upload a PNG/JPG/WEBP company logo and hero background image. Files are compressed and processed in the visitor's browser, not sent to an RZ server.
- Uploaded artwork replaces the sample logo/monogram in the site preview.
- Save the site kit locally on the browser; export JSON with brand, text and compressed images, import JSON later, or reset to RZ sample.
- Contact CTA can use a verified HTTPS URL, a valid email address, or a local page anchor. It does not create a contact inbox.
- A done-for-you customization link leads to the existing **copyable** custom-project brief, not to a live order submission.

**Important:** RZ Form's editor creates a client-side preview and portable JSON configuration. It does **not** generate a separately deployed website, publish custom domains, export a complete source ZIP, issue product licenses, take payments, or submit orders. These are future product capabilities.

## Three branded utilities / Version 004 brand desk

| Product | Page | Working functions |
|---|---|---|
| RZ Ledger | `tools/invoice.html` | Invoices, line totals, tax/discount, local drafts, JSON backup, print/PDF |
| RZ Arena | `tools/bracket.html` | 2–16 team brackets, byes, automatic winner advancement and scoring |
| RZ Insight | `tools/report.html` | Private CSV loading, grouped numeric analytics, visual summaries and CSV/JSON exports |

All three utility demos include the reusable RZ Brand Desk (`brand-lab.js`, `brand-lab.css`) for changing name, tagline, three different product-specific treatments, accent color, logo and showcase background, then saving or exporting a local identity kit. The deeper domain-specific editors keep their original features.

The [RZ Edition Office](templates.html) displays all four products using distinct visual treatments, not a cookie-cutter template catalog.

## Current inventory

**9 total concepts. 4 working browser demos. 5 planned only.** Commercial checkout, account registration, secure order submission, licensed source-code delivery, admin dashboard and hosted customer websites are not yet implemented.

The homepage custom-project brief copies text to the visitor's clipboard; it does not reach RZ automatically. Do not claim these tools are already purchasable.

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
