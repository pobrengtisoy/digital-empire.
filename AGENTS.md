# Digital Empire — development instructions

Digital Empire is an original, handmade-feeling digital-products marketplace. The project name is provisional.

## Design standards
- Retain the charcoal, warm-paper, and lime editorial design and its bespoke information architecture.
- No generic SaaS gradients, glassmorphism, random rounded cards, or cookie-cutter landing page.
- Preserve responsive iPhone/iPad layouts, accessibility, and existing live demos.
- Keep changes targeted and avoid touching unrelated repositories.

## Prototype safety
- Current version is a static catalog with two browser-local demos; checkout, order processing, licensed delivery, and authentication are NOT implemented.
- Treat all planned products as planned. Do not solicit payments as though the storefront is production-ready.
- Do not commit access tokens, credentials, or customer data to GitHub.

## Cloudflare deployment
- This project uses **Cloudflare Workers static assets** via `wrangler.jsonc` for the current connected deployment.
- `assets.directory` is the repository root; maintain `.assetsignore` to exclude internal config and documents from public serving. Move to a dedicated output directory before adding private server code or build products.
- Current Workers Builds settings: production branch `main`, build command `exit 0`, deploy command `npx wrangler deploy`, preview command `npx wrangler preview`.
- Prefer Cloudflare's free tier. No paid services or plan upgrades without user authorization.
- Verify actual deployment result and URL before telling the user the site is live.
- If Cloudflare MCP is available in a supported coding agent, authenticate by OAuth and use it for account operations. ChatGPT's GitHub connection alone does not authorize Cloudflare.
