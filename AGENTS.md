# Digital Empire — development instructions

Digital Empire is an original, handcrafted-feeling digital-products marketplace. The name is provisional.

## Design guardrails
- Preserve the existing charcoal / warm-paper / lime visual system and bespoke editorial layouts.
- Avoid generic AI-generated SaaS designs, glassmorphism, repeated floating cards, and gratuitous gradients.
- Be meticulous about typography, spacing, interaction states, accessibility, and responsive iPhone/iPad layouts.
- Prefer small targeted modifications. Do not overwrite product demos or unrelated project files.

## Project status
- This is a static HTML/CSS/JavaScript prototype with two functioning browser-local demos.
- This is NOT a production checkout. Do not claim payments, order submission, secure downloads, or customer accounts work unless implemented and tested.
- Keep secrets and API tokens out of source control.

## Cloudflare workflow
- For Cloudflare account operations, use the authenticated Cloudflare MCP server when the coding agent supports it; authorization requires user OAuth.
- Use the official Cloudflare documentation to verify current features and deployment behavior.
- Current site needs no build step: deploy the repository root containing index.html with Cloudflare Pages.
- For Pages Git integration select branch main, no framework preset, build command `exit 0` (or blank), and build output directory `.`.
- Use the free tier first, avoiding paid resources and paid plan upgrades without explicit approval.
- Treat deployment and account connection as separate steps. Never assert that the site is live until the deployment URL and status are verified.
