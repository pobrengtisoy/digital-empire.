# RZ Digital Empire — working instructions

## Brand ownership and design direction

- **Company brand:** RZ. **Marketplace brand:** RZ Digital Empire.
- Strong independent editorial direction: charcoal, warm paper and lime at the marketplace level; a unique art direction for each product.
- Avoid generic AI-generated SaaS aesthetics, random rounded cards, repetitive feature tiles, glassmorphism, stock-illustration gradients, and off-the-shelf dashboard templates.
- Keep typography intentional, details refined, and touch interactions excellent on iPhone and iPad.
- Build one reusable product system, but give each product its own distinct visual signature.
- The RZ SVG mark is our source-controlled placeholder; replace only with a user-supplied approved logo or explicit future redesign.

## Working demos

- RZ Ledger: `tools/invoice.html`
- RZ Arena: `tools/bracket.html`
- RZ Insight: `tools/report.html`
- RZ Edition Office: `templates.html`
- Reusable editable appearance editor: `brand-lab.js` / `brand-lab.css`
- Product catalog: `products.js`

## Customization rules

- Clients should eventually be able to replace sample brand name, logo, background image, colors and other permitted template content. Start with real visible live controls, not dead demo buttons.
- Current Brand Desk saves browser-local configuration only and supports same-tool JSON export/import; it does NOT provide a paid license, a private source-code ZIP, a client installation or cloud synchronization.
- Keep uploaded images on the client unless a secure upload feature is explicitly built later.
- Preserve all existing invoice, bracket and report logic while improving visuals.
- Avoid JavaScript string-based HTML insertion of untrusted file or user text.

## Commercial safety

- This is a static demonstration with **no real checkout, customer accounts, server-side orders, owner dashboard, payment verification, licensed downloads or customer inbox**.
- Never claim these exist until implemented and verified.
- Repository is currently public. Do not commit credentials, private source code meant for sale, unpublished proprietary client assets or secrets.
- For actual sales, separate public demos and private product source, implement legally compliant business and payment processes, and verify entitlements server-side.

## Cloudflare

- Workers static assets configured in `wrangler.jsonc`.
- Git-connected production branch `main`; build `exit 0`; deploy `npx wrangler deploy`.
- `.assetsignore` protects repository documentation from static serving.
- Free-tier-first, no upgrades without user authorization.
- Verify Cloudflare deployment status and actual browser output before claiming changes are live.
- Cloudflare account access requires user OAuth in a supported client; GitHub access alone does not grant Cloudflare credentials.
