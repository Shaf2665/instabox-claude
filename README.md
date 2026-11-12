# instabox

Keep track of your Instabox VMs, across several accounts, from Claude and use them on demand, with no standing SSH or remote session. The mod calls the Instabox REST API (api.instabox.sh) with your API key.

Setup: create a key in each account with `instabox keys create --name claude` (a key reaches only its own workspace), then enter them in the mod config as `label=key` pairs separated by commas, e.g. `personal=ibk_abc,work=ibk_def` (secure storage, never in the mod files). Address a machine as `account/name` when two accounts share a name.

Tools Claude can call: `list`, `wake` (resume a paused machine or start a stopped one, then wait until ready), `exec` (wake if needed, then run a shell command) and `sleep` (pause). The `/instabox` command opens a pane with Wake, Sleep and Refresh buttons; `/instabox wake <name>`, `/instabox sleep <name>` and `/instabox note <name> <text>` work from the prompt. The last known machine list and your notes are kept across sessions.

Free-tier notes: machines idle-pause after 30 minutes and have a maximum run of 480 minutes followed by a cooldown during which every wake is refused; the mod reports the cooldown instead of retrying.

## Install

At the prompt of a terminal session:

```
/plugin install instabox --marketplace Shaf2665/instabox-claude
```

From a shell:

```
claude plugin install instabox --marketplace Shaf2665/instabox-claude
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Shaf2665/instabox-claude`, then Add plugin.

You are asked to enter your Instabox API keys during install. They stay in your own secure storage; nothing is sent anywhere except api.instabox.sh.

## Codex and other MCP clients
The same four tools are available as a dependency-free stdio MCP server (`mcp/server.mjs`, Node 20+). Clone this repo, then add to `~/.codex/config.toml`:

```toml
[mcp_servers.instabox]
command = "node"
args = ["/absolute/path/to/instabox-claude/mcp/server.mjs"]
env_vars = ["INSTABOX_API_KEYS"]
tool_timeout_sec = 300
default_tools_approval_mode = "prompt"
```

and export your keys in your shell profile (they are never written to the config):

```
export INSTABOX_API_KEYS="personal=ibk_abc,work=ibk_def"
```

Restart Codex and run `/mcp` to confirm `instabox` is listed. Any other MCP client can run `node mcp/server.mjs` the same way. Run the tests with `node --test mcp/server.test.mjs`.

## Is it safe?
Short version: one small source file, one network host (`api.instabox.sh`), no install scripts or dependencies, keys kept in secure storage. The main risk is that `exec` lets the model run commands in your VMs. See [SECURITY.md](SECURITY.md) for what to check, and [AGENTS.md](AGENTS.md) if you are asking an AI agent to install it for you.
