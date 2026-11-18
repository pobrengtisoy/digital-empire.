# RZ Digital Empire — working instructions

## Brand ownership and design direction

- **Company brand:** RZ. **Marketplace brand:** RZ Digital Empire.
- Marketplace direction (Nov 2026 redesign, user-approved): a print shop's sample wall of hanging vinyl tarps on an indigo-black wall; deep crimson, flame orange, blossom pink and white tarp stock; Japanese geometric textile patterns (hemp-leaf, checkerboard) as printed material; Kaushan Script brush lettering for display, Archivo for reading. The palette is a colour mood only: never use characters, logos or artwork from any existing show or comic. Each product keeps its own art direction.
- The homepage (`index.html`, `home.css`, `home.js`) is the first surface in this world. Edition Office, RZ Form and the three tools still use the previous look (`styles.css`) until they are redesigned.
- Design context: `PRODUCT.md`, `.impeccable/surfaces/index-html.md` (direction contract), approved mock-up `.impeccable/build/approved-comp.png`.
- Avoid generic AI-generated SaaS aesthetics, random rounded cards, repetitive feature tiles, glassmorphism, stock-illustration gradients, and off-the-shelf dashboard templates.
- Keep typography intentional, details refined, and touch interactions excellent on iPhone and iPad.
- Build one reusable product system, but give each product its own distinct visual signature.
- The RZ SVG mark is our source-controlled placeholder; replace only with a user-supplied approved logo or explicit future redesign.

## Working demos

The homepage lists twelve products (catalog in `products.js`), each a self-contained page in `products/<name>/` with its own fonts, palette and art direction suited to its trade:
RZ Menu, RZ Shop, RZ Booking, RZ Stay, RZ Listahan, RZ Invite, RZ Liga, RZ Quote, RZ Sahod, RZ Tindahan, RZ Mine, RZ Upa.
- Shared helpers: `products/kit.js`, `products/kit.css`; fonts self-hosted in `products/fonts/`; homepage screenshots in `assets/shots/` (regenerate when a product's look changes).
- Each product must stay visually distinct from the homepage and from the others while staying clean and presentable.
- Older demos remain but are unlisted: RZ Ledger `tools/invoice.html`, RZ Arena `tools/bracket.html` (playoff link from RZ Liga), RZ Insight `tools/report.html`, RZ Form `site-template.*`, RZ Edition Office `templates.html`, Brand Desk `brand-lab.*`.
- Backend (Phase 1): `worker/index.js` + D1 serve `/api/*`. RZ Menu has real owner accounts, a dashboard (`dashboard/`), live menus (`products/menu/?shop=slug`) and server-side orders. RZ Mine (live-selling “mine” tracker, `worker/mine.js`) also runs on real accounts: demo at `products/mine/`, seller console at `products/mine/?seller`, buyer checkout links at `products/mine/cart.html?c=<48-hex token>`. Winners are computed from claim order and stock on every read, so undoing a claim promotes the next backup. RZ Upa (rent book, `worker/upa.js`) runs on real accounts too: demo `products/upa/`, owner console `products/upa/?owner`, tenant statements `products/upa/tenant.html?t=<48-hex token>`. Its billing maths lives once in `products/upa/logic.mjs`, imported by both the worker and the page; change it there only. The other nine products are still browser-only demos.
- Buying: `/buy/` checkout with QR Ph (manual payment check), purchases stored server-side, RZ Sales tab for `ADMIN_EMAILS` (Cloudflare secret). Official prices live in `worker/index.js` `PRICES`; `products.js` only displays them. No automatic payment confirmation, licences or hosted customer domains yet. Email alerts are not sending yet (need a custom domain).
- Terms and Privacy live at `/terms/` (setup 1–24 hours, payments final with fix-instead-of-refund, refund only if RZ cannot deliver or on overpayment; Data Privacy Act RA 10173). Keep checkout, dashboard and terms wording consistent. Owners can delete their own account (`DELETE /api/account`, password re-check).
- Never trust client prices or IDs; keep the same-origin check, rate limits and HttpOnly session cookie. Never commit secrets; use Cloudflare secrets.

## Customization rules

- Clients should eventually be able to replace sample brand name, logo, background image, colors and other permitted template content. Start with real visible live controls, not dead demo buttons.
- Current Brand Desk saves browser-local configuration only and supports same-tool JSON export/import; it does NOT provide a paid license, a private source-code ZIP, a client installation or cloud synchronization.
- Keep uploaded images on the client unless a secure upload feature is explicitly built later.
- Preserve all existing invoice, bracket and report logic while improving visuals.
- Avoid JavaScript string-based HTML insertion of untrusted file or user text.

## Commercial safety

- RZ Menu, RZ Mine and RZ Upa now have real owner accounts and server-side data. There is a QR Ph checkout with **manual** payment checking, but still **no automatic payment verification, licensed downloads or email sending**, and the other nine products have no backend yet.
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
