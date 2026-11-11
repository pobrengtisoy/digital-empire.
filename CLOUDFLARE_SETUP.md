# Deploy Digital Empire to Cloudflare

The project is configured for **Cloudflare Workers static assets** (the screen with `Build command`, `Deploy command` and `Preview command`).

## Workers Builds configuration

- GitHub repository: `pobrengtisoy/digital-empire.` (including the trailing period)
- Project name: `digital-empire`
- Production branch: `main`
- Build command: `exit 0`
- Deploy command: `npx wrangler deploy`
- Preview command: `npx wrangler preview`
- Preview builds: optional (on is fine)
- Cloudflare Access: off for a public demo; turn on only if you want to restrict access

These are valid because `wrangler.jsonc` in the repository sets the Worker name, compatibility date, and `assets.directory` to `./`. `.assetsignore` excludes internal documentation and configuration from being published as static assets.

### Finish in the Cloudflare dashboard

1. From the Worker Git-connected setup screen, keep the settings above.
2. Tap **Deploy**.
3. Check **Deployment / Build logs** for a successful result, and open the actual `*.workers.dev` URL assigned by Cloudflare.
4. Verify the storefront loads and the two demos work. Do not assume the URL exists until Cloudflare confirms it.
5. With the Git integration connected, future pushes to `main` automatically redeploy.

> This is a showcase prototype and is **not** ready to accept paid orders. It has no checkout, customer auth, server-side orders, or secure licensed downloads.

## Agent integration (optional)

Cloudflare's official [agent setup guide](https://developers.cloudflare.com/agent-setup/prompt.md) explains installing Cloudflare Skills and its OAuth MCP server in various agents. This repository includes Codex and VS Code MCP configurations that contain no credentials. The files do not install tools or grant Cloudflare account access themselves.

## Docs
- https://developers.cloudflare.com/workers/static-assets/get-started/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
