# Security and trust

This repo has two entry points with the same behaviour, both small enough to read before installing: the Claude Code plugin (`hooks/register.tsx`, about 270 lines) and a stdio MCP server for Codex and other agents (`mcp/server.mjs`, about 150 lines, Node standard library only). The facts below are what to check.

## What it can do
- Calls **one host only**: `https://api.instabox.sh` (plugin: through the host's `$.http.fetch`; MCP server: Node's built-in `fetch`). Grep for `BASE`.
- Reads your Instabox API keys from the plugin's config (marked `sensitive`, so kept in secure storage, never in files) or, for the MCP server, from the `INSTABOX_API_KEYS` environment variable (never from files or arguments) and sends each key only as the `X-API-Key` header to that host.
- Keeps a cached machine list and your notes in the plugin's own store (`$.store`). No keys are stored there.
- Registers four tools for the model: `list`, `wake`, `exec`, `sleep`, plus the `/instabox` command and a pane.

## What it does not do
- No local file access, no local processes, no shell (the MCP server imports only `node:fs` (one `realpathSync` call on its own path), `node:readline` and `node:url`), no install scripts, no hooks on other tools' calls or on your prompts.
- No telemetry and no other network destinations.
- No dependencies and no `scripts` in `package.json`: nothing is fetched or run at install time.

## The real risk: `exec`
`exec` runs a shell command **inside your Instabox VM** as the model asks. Anything the model can be talked into running can run there. Reduce the exposure:
- Use a dedicated key per account (`instabox keys create --name claude`) and, if your plan allows scoped keys, the narrowest scope that works.
- Keep sensitive data and credentials out of the VMs you let a model drive.
- Review the tool calls your Claude Code permission settings ask you to approve.

## Verify yourself
```
grep -n "BASE =\|http.fetch\|\$.process\|\$.fs" hooks/register.tsx mcp/server.mjs
grep -n "^import" mcp/server.mjs
node --test mcp/server.test.mjs
claude plugin validate .
claude plugin test .
```
The validator lists every `$` call the module makes; it should show only clock, command, http.fetch, state, store, tool.register and ui.

## Reporting a problem
Open a GitHub issue. For anything involving a leaked key, revoke it in Instabox first (`instabox keys` or the dashboard).
