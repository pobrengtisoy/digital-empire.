# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A broad small-business audience in the Philippines, with no single group favoured:

- Small local businesses (shops, cafes, salons, event organizers) that want a branded tool or website without hiring a developer.
- Freelancers and creators who want invoices, reports and a personal site under their own name.
- Agencies and resellers who would rebrand RZ templates and tools for their own clients.

They usually arrive on a phone or tablet, judge quickly whether the product looks professional enough to carry *their* brand, and try the live demo before trusting anything written about it.

## Product Purpose

RZ (company) runs RZ Digital Empire (marketplace): a showroom of digital products that a buyer can re-skin with their own name, logo, background and colours, live in the browser. Success today means a visitor tries a working demo, sees their own brand on it, and sends RZ a custom-project brief.

## Positioning

Every RZ product is brandable by the buyer in the browser, before purchase, with their own logo and photo, and each product keeps its own distinct identity instead of sharing one template skin.

## Operating Context

- Static site (HTML/CSS/JS, no build step) served by Cloudflare Workers static assets; production branch `main`.
- Product lineup (Nov 2026, user-chosen): RZ Menu, RZ Shop, RZ Booking, RZ Stay, RZ Listahan, RZ Invite, RZ Liga, RZ Quote, RZ Sahod, RZ Tindahan, each a working browser-only demo in `products/<name>/`. Older unlisted demos: RZ Ledger, RZ Arena (playoffs for RZ Liga), RZ Insight, RZ Form, RZ Edition Office.
- RZ Menu has a real backend (Cloudflare Worker + D1): owner accounts, owner dashboard, live menu links and server-side orders with status updates. The other products still hand off by copying a message and opening Messenger.
- Owner alerts: dashboard first; optional Gmail alerts once a custom domain is connected (user choice, Nov 2026).
- Customisation is saved in the visitor's browser and can be exported/imported as JSON. Uploaded images stay on the device.
- Market: Philippines. Copy is English. Money examples use Philippine pesos (₱) and local business names.

## Capabilities and Constraints

- 10 catalogued products, all with working demos. None are sold online yet; RZ sets each up for a client directly.
- NOT implemented, and never to be claimed: checkout or payments, customer accounts, server-side orders, owner dashboard, licensed downloads, hosted customer websites, custom domains, source ZIP export, contact inbox. The custom-project brief only copies text to the clipboard.
- Repository is public: no credentials, private sellable source or client assets.
- Must preserve all existing invoice, bracket, report and site-editor logic.
- User text and uploaded file content must not be inserted as HTML strings.
- Free-tier Cloudflare only; strict CSP (no inline styles).
- Open decision: pricing, licensing terms and how purchases will work.

## Brand Commitments

- Names: company **RZ**; marketplace **RZ Digital Empire**; product names RZ Ledger, RZ Arena, RZ Insight, RZ Form, RZ Edition Office.
- The RZ SVG mark (`rz-mark.svg`) is a placeholder kept until the user supplies an approved logo.
- Each product must carry its own distinct visual signature suited to its trade (user direction: a restaurant product should look like a restaurant), clean, classy and presentable.
- Touch interaction must be excellent on iPhone and iPad.
- The user has chosen a full redesign (Nov 2026): the previous charcoal / warm paper / lime editorial look is evidence, not a commitment.

## Evidence on Hand

- Four working demos and their real feature lists (README.md, products.js).
- No customers, testimonials, sales figures, prices, press or case studies exist. Do not invent them; label demonstration data as sample.

## Product Principles

1. Prove with the working demo before any claim.
2. The buyer's brand is the hero: every surface should show how it looks wearing someone else's identity.
3. Honest about what exists: planned products and missing commerce are labelled plainly.
4. One system, many signatures: shared mechanics, distinct product identities.
5. Phone-first: the decision happens on a phone in the Philippines.

## Accessibility & Inclusion

Readable text sizes and contrast on small phone screens in bright light; full touch and keyboard operation of every editor.
