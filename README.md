# RZ DIGITAL EMPIRE — EDITION 004

**Company identity: RZ. Marketplace: RZ Digital Empire.**

An original editorial digital-products storefront with three distinct editable tool demos and the RZ Edition Office. This is a frontend prototype deployed using Cloudflare Workers static assets. It does not process orders or payments yet.

## New in Edition 004

- Renamed the marketplace and browser identity to **RZ Digital Empire**, including an RZ vector favicon and updated company wordmark.
- New [Edition Office](templates.html): a bespoke showcase of three visually distinct product editions, not repetitive template cards.
- **RZ Ledger** (`tools/invoice.html`): warm paper / archival stationery visual treatment.
- **RZ Arena** (`tools/bracket.html`): nighttime competition visual treatment.
- **RZ Insight** (`tools/report.html`): modern data-studio visual treatment.
- Shared [RZ Brand Desk](brand-lab.js), styled in [brand-lab.css](brand-lab.css), runs locally in each tool:
  - Change company name and tagline.
  - Switch between three curated visual treatments per product.
  - Pick a custom accent color.
  - Upload a PNG, JPG or WEBP logo and hero background image.
  - Preview the changes live and save the configuration in local browser storage.
  - Export or import a branded JSON kit for **the same product**; reset to the original RZ display.
  - Uploaded invoice logos appear on the printable invoice document (other customizations apply to the editor and display).
- All original working functionality remains: invoice calculations and local drafts, single-elimination tournaments for 2–16 teams, and CSV reporting with export.

### What "editable" means here

The Brand Desk customizes the **demo appearance in the current browser**. Brand preferences are not synced across devices, and browser storage may be cleared. Export a brand kit for safekeeping. These are **not yet downloadable, licensed, deployed client websites or automatic client installations**. Uploads are resized in the browser and not sent to an RZ server. Background images change demo showcase headers; they do not alter the print/PDF templates.

The script uses localStorage with image-size limits. A full client-facing website customizer, downloadable source-code packages, owner-managed branded installations and done-for-you service are commercial roadmap items, **not active checkout features**.

## Existing tools

| Product | Live demo | Key abilities |
|---|---|---|
| RZ Ledger / Tool 001 | `tools/invoice.html` | Invoice items, taxes/discounts, totals, local drafts, JSON backup, print |
| RZ Arena / Tool 005 | `tools/bracket.html` | Team seeding, byes, scoring, winner advancement, local backups |
| RZ Insight / Tool 008 | `tools/report.html` | CSV loading, grouping, numeric summaries, charts and exports |

Five additional catalog concepts remain marked **planned**.

## Local development

No build dependencies are required for the storefront. From the repository root:

```sh
python3 -m http.server 8000
```

Visit `http://localhost:8000`. Static files reference no backend API.

## Cloudflare Workers

GitHub repo: `pobrengtisoy/digital-empire.` (GitHub name includes trailing period). Deployment uses:

- `wrangler.jsonc` with a static assets directory of `./`
- `.assetsignore` to prevent serving internal Markdown/config assets
- Branch `main`
- Build command `exit 0`
- Deploy command `npx wrangler deploy`

The user confirmed an initial successful Cloudflare deployment and supplied this address:

`https://digital-empire.ronnieredugo.workers.dev/`

The external web checker has not independently rendered Edition 004 as of this release. Cloudflare Git integration should deploy changes on `main`; verify the latest build and browser rendering before calling the release live.

## Commercial / security caveats

- The repository is currently **public**. Do not put secret paid source code, API keys, private client assets, payment credentials or proprietary licensed bundles in it.
- The commercial shop requires a secure server-side order system, verified payments, product entitlements, private downloads, real customer contact handling and proper licensing terms before selling.
- There is **no checkout, owner admin account, hosted customer workspace, order inbox or automated delivery** in this version.
- The custom-project brief currently copies text to the visitor's clipboard instead of submitting it to RZ.
- Uploaded demo artwork and settings stay in the browser. Backup with Export Kit; all browser localStorage is subject to user clearing and storage quotas.
- Keep the design bespoke: no AI-looking generic SaaS cards, arbitrary gradients, generic floating dashboards or repetitive templates.

## Next edition

Introduce the first genuine editable **website** template with a simple branded media and content editor (separate from the three tools), plus the secure server-side inquiry path. Create a private product-code delivery repository once licensed packages are ready. Keep public demos separate from paid source code.

See [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) for hosting and [AGENTS.md](AGENTS.md) for the design rules.
