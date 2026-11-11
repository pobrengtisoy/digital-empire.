# DIGITAL EMPIRE — EDITION 003

**Working name. Independent digital workshop. Static storefront hosted through Cloudflare Workers static assets.**

A distinctive, bespoke editorial design and three functioning, browser-local product demonstrations. It uses plain HTML, CSS and JavaScript with no application build step or runtime dependency.

## Status

| Component | State | Location |
|---|---|---|
| Responsive storefront, product search, details and filtering | Working | `index.html`, `app.js`, `products.js` |
| Invoice Maker | Working local demo | `tools/invoice.html` |
| Bracket Engine | Working local demo | `tools/bracket.html` |
| Report Relay | Working local demo | `tools/report.html` |
| Other five listings | Planned / not available for purchase | `products.js` |
| Project-brief builder | Copies the brief; **not sent or recorded** | Homepage → Start a Project |
| Customer accounts, server-side orders, payments, licensed product delivery | **Not implemented** | — |

### Report Relay / Tool 008

- Load a CSV file of no more than 2 MB and up to 10,000 data rows / 30 columns.
- Handles standard quoted CSV data, comma, semicolon and tab delimiters.
- Choose a category column and either record counts or a numeric metric.
- View group counts, sums, visualized top eight groups, and the first eight source rows.
- Download full grouped summaries in CSV or JSON; print or save the visible report to PDF through the browser.
- No CSV content is transmitted to a server. CSV processing happens in memory and clears on reload or when the user selects Clear Workspace.
- This first release does not perform cloud sync, automatic scheduling, data cleaning, or cross-file joins. The sample is fictitious demo data.

### Invoice Maker / Tool 001

Line items, subtotal, tax, discounts, draft autosave in browser localStorage, JSON backup/import and browser print-to-PDF.

### Bracket Engine / Tool 005

Single-elimination tournaments for 2–16 seeded teams, byes, scoring, automatic progression, winner validation, localStorage, JSON backups and print-to-PDF.

## Run locally

Serve the repository root in a local development web server:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The interface is designed for desktop, iPhone and iPad browsers.

## Cloudflare deployment

The connected GitHub repository `pobrengtisoy/digital-empire.` (including the trailing dot) uses **Workers Builds** with `wrangler.jsonc` and `.assetsignore`. The deployment settings are:

- Branch: `main`
- Build command: `exit 0`
- Deploy command: `npx wrangler deploy`
- Worker name: `digital-empire`
- Static assets directory: `./` (repository root)

Cloudflare reports a successful initial deployment in the dashboard screenshot provided November 11, 2026. The exact public `workers.dev` URL has not yet been independently verified. Future pushes to the connected production branch should trigger builds, assuming the Git integration remains enabled.

See [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) for details. `.assetsignore` removes internal repository/agent docs from the public static-asset bundle.

## Architecture and safety

- The tools run in the browser; no backend API, D1 database, payment gateway or user accounts are configured.
- `products.js` is the source-controlled catalog. Only verified product demos use `status:'live'`.
- User-provided CSV cells are inserted as text nodes, not executed as HTML. CSV exports neutralize potentially executable spreadsheet formulas in text fields.
- Do **not** put credentials, confidential customer files, API tokens, or unreleased paid source code into this public repository.
- Do **not** accept customer payments on this site until a secure order workflow, payment verification, and delivery entitlements are implemented and tested.
- Current tools may lose local data if browser storage is cleared or the browser session ends. Use the available backups/export functions.

## Next product milestone

Add an authenticated, server-side custom-order inbox (for example with Workers + D1) **after** Cloudflare account authorization/bindings are available. Pair it with proper spam and rate-limit protections, privacy language, and owner-only access. Follow with payment integration and private licensed downloads.

Preserve the original industrial editorial design. Avoid canned template patterns and redundant effects.
