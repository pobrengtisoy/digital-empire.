# DIGITAL EMPIRE — EDITION 002

**Working name. Independent digital workshop. Free-to-build static prototype.**

This is a custom-designed, responsive storefront and two real, local-first product demonstrations. It uses native HTML, CSS, and JavaScript. It has **no dependencies, subscriptions, accounts or build step**. Source files are yours to edit.

## What works right now

| Part | Status | Where |
|---|---|---|
| Storefront and editorial design | Works | `index.html`, `styles.css` |
| Category filtering, search and product details | Works | `app.js`, `products.js` |
| Draft a custom project request and copy it | Works, **not sent** | Homepage → Start a Project |
| Invoice Maker (line items, tax, discount, preview, JSON export/import, print/PDF) | Works locally | `tools/invoice.html` |
| Bracket Engine (2–16 seeded teams, automatic byes, scoring, advancement, champion, JSON export/import, print/PDF) | Works locally | `tools/bracket.html` |
| Other 6 product listings | **Planned only** | `products.js` |
| Payment, customer accounts, product delivery | **Not implemented** | — |
| Cloud synchronization and online order submission | **Not implemented** | — |

## Run it

**Simplest:** open `index.html` on a desktop browser. The files are self-contained apart from optional Google Fonts. To test from a web server:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser.

To publish a **preview** through Cloudflare Pages, follow their current upload/deployment instructions and select the folder containing `index.html`, or upload the contents of the project ZIP. Configure a Pages subdomain. Test the commercial terms, free-tier limits and site policies before publishing as a business. Do not enable checkout on this prototype.

### iPhone / iPad

The interface responds to small screens; tournament columns scroll sideways within the bracket area. For reliable access on iOS, publish the static preview to a suitable host or open it from a local web server on the same network. iOS Files doesn't run a website development server by itself.

## Test the second demo

1. Open **Bracket Engine** from the product inventory.
2. Replace the sample teams (one per line), then select **Generate Bracket**.
3. Enter a score for both teams in a match. The higher-scoring side automatically advances. Ties require a winner; draws cannot advance.
4. Continue until a champion is crowned.
5. Export the tournament as JSON to keep a backup. Import that file on another device. For printable brackets, use **Print / Save PDF**.

Important: Editing results in an earlier round clears recorded later-round scores to prevent accidental attribution of results to a different team. Teams receive byes based on their seeded order. No online multiplayer, cloud syncing or public registration is included.

## File guide

```
index.html             Main storefront
styles.css             Global visual language + second release
products.js            Catalog and truthful live/planned status
app.js                 Product search, filters, details, project brief
tools/invoice.html     Invoice Maker UI
tools/invoice.css      Invoice Maker styling
tools/invoice.js       Invoice calculations, JSON/print/drafts
tools/bracket.html     Bracket Engine UI
tools/bracket.css      Bracket Engine styling
tools/bracket.js       Tournament state, logic, scores and persistence
_headers               Recommended headers for a Cloudflare Pages preview
robots.txt             Exclude prototype preview from indexing
```

## Data handling and limitations

- Tool data is held in the **current browser** via `localStorage`. Clearing browser storage removes local work unless a JSON backup is exported.
- The tools do not send information to our server. Google Fonts, when available, are requested from Google; fallbacks work offline.
- The project-brief feature currently **copies text**. It does not contact a salesperson, submit an order or create a ticket.
- There is no secure server-side admin area, commercial payments, license issuance, download entitlements, or order history. **Do not collect payments or customer credentials through this version.**
- Preview product names, descriptions and branding are provisional. You must review legal terms, privacy disclosures, branding rights, and licensing before a public commercial launch.

## Recommended next milestone: Edition 003

Build an original product detail page and a real custom-order inbox behind a server and authenticated admin panel. Then connect supported payments **server-side** and private downloadable product entitlements. Continue using the existing design system, not a canned storefront template.

## Tested in Edition 002

- Bracket generator: eight teams, seven scored matches, champion calculation.
- Six teams: seeded byes, correct count of actual games (five).
- Storefront: eight products, two functional demos, product filter and detail dialog.
- Responsive measurements: 390px phone and 810px tablet without outer-page horizontal overflow; the bracket board scrolls independently.
- Scripts pass `node --check` syntax validation. Tests were performed using local HTML/style/script injection in a headless Chromium browser because direct browser URL navigation was restricted in the test environment. Hosted deployment and real iOS Safari testing remain to be done.
