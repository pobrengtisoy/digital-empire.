# Cloudflare setup — Digital Empire

This repository has Cloudflare MCP configuration for Codex (`.codex/config.toml`) and VS Code / GitHub Copilot (`.vscode/mcp.json`). The configuration stores **no credentials**, cannot authorize an account by itself, and does not create a Cloudflare deployment.

## Authorize your coding agent
- **Codex CLI / IDE:** open this trusted project. If your Codex version does not load project-scoped MCP config, run `codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp`. Then run `codex mcp login cloudflare` or authorize on first use.
- **VS Code / GitHub Copilot:** open this project, enable the Cloudflare MCP server in Agent mode, and complete the browser-based OAuth prompt.
- Install Cloudflare skills in your actual agent environment as described in the [official Cloudflare instructions](https://developers.cloudflare.com/agent-setup/prompt.md). These skills are not installed by committing this repository.

## Publish the static storefront with Cloudflare Pages

1. Sign in to [Cloudflare](https://dash.cloudflare.com/) using your own account.
2. Open **Workers & Pages** → **Create application** → **Pages** → **Import an existing Git repository**.
3. Authorize Cloudflare's GitHub integration to access `pobrengtisoy/digital-empire.` and select that exact repository.
4. Configure **Production branch: main**, **Framework: None**, **Build command: exit 0** (or blank), **Build output directory: .** (repository root).
5. Select **Save and Deploy**, then verify the returned `*.pages.dev` URL.

This is a prototype storefront. Do not enable payments or label planned products ready for sale. Do not put Cloudflare API tokens, service credentials, private certificates, or customer data into this public repository.

Official references:
- https://developers.cloudflare.com/agent-setup/prompt.md
- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/get-started/git-integration/
