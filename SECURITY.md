# Security and trust

This mod is small (one hooks module, `hooks/register.tsx`, about 300 lines). Read it before installing; the facts below are what to check.

## What it can do
- Calls **one host only**: `https://api.instabox.sh`, through the host's `$.http.fetch`. Grep for `http.fetch` and `BASE`.
- Reads your Instabox API keys from its config (marked `sensitive`, so kept in secure storage, never in files) and sends each key only as the `X-API-Key` header to that host.
- Keeps a cached machine list and your notes in the plugin's own store (`$.store`). No keys are stored there.
- Registers four tools for the model: `list`, `wake`, `exec`, `sleep`, plus the `/instabox` command and a pane.

## What it does not do
- No local file access (`$.fs`), no local processes (`$.process`), no shell, no install scripts, no hooks on other tools' calls or on your prompts.
- No telemetry and no other network destinations.
- No dependencies: no `package.json`, nothing fetched at install time.

## The real risk: `exec`
`exec` runs a shell command **inside your Instabox VM** as the model asks. Anything the model can be talked into running can run there. Reduce the exposure:
- Use a dedicated key per account (`instabox keys create --name claude`) and, if your plan allows scoped keys, the narrowest scope that works.
- Keep sensitive data and credentials out of the VMs you let a model drive.
- Review the tool calls your Claude Code permission settings ask you to approve.

## Verify yourself
```
grep -n "http.fetch\|\$.process\|\$.fs\|BASE =" hooks/register.tsx
claude plugin validate .
claude plugin test .
```
The validator lists every `$` call the module makes; it should show only clock, command, http.fetch, state, store, tool.register and ui.

## Reporting a problem
Open a GitHub issue. For anything involving a leaked key, revoke it in Instabox first (`instabox keys` or the dashboard).
