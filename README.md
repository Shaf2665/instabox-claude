# instabox-claude

Manage your [Instabox](https://instabox.sh) VMs from an AI agent, across several accounts, with no standing SSH or remote session. Ask your agent to list your machines, wake a paused one, run a command in it, or pause it again.

It talks to the Instabox REST API (`api.instabox.sh`) with your API keys. It comes in two forms with the same four tools:

| Form | Works in | Setup |
| --- | --- | --- |
| **Claude Code plugin** | Claude Code | `/plugin install`, then enter keys when asked. Also gives you a pane and a `/instabox` command. |
| **MCP server** (`mcp/server.mjs`) | Codex, Claude Code, any MCP client | Clone, add 4 lines of config, export your keys. |

## What you can ask for

| Tool | What it does |
| --- | --- |
| `list` | Lists your machines across all accounts, with state (running, suspended, stopped). |
| `wake` | Resumes a paused machine or starts a stopped one, then waits until it is ready (up to about 3 minutes). |
| `exec` | Runs a shell command inside a machine, waking it first if needed (up to 600 s). |
| `sleep` | Pauses a machine, keeping its running programs. |

Just ask in plain words:

- "List my Instabox machines."
- "Wake `work/build-box` and run `uptime`."
- "Run `docker ps` on `personal/dev`, then pause it."
- "Which of my machines are asleep?"

## Before you start: get an API key from each account

An Instabox key only reaches its own account or workspace, so make one per account, logged into that account:

```
npx instabox@latest sh              # or: npm install -g instabox && instabox login
instabox keys create --name claude  # prints an ibk_... key once; copy it
```

For a separate workspace under the same login, add `--org <workspace>`. Never paste a key into a chat or commit it.

You give the keys to this project as **`label=key` pairs separated by commas**. The label is your own name for the account and shows up in the machine list as `label/machine`:

```
personal=ibk_abc123,work=ibk_def456
```

With a single account a bare key (`ibk_abc123`) also works, labelled `default`.

## Claude Code plugin

Install (in a terminal Claude Code session):

```
/plugin install instabox --marketplace Shaf2665/instabox-claude
```

From a shell: `claude plugin install instabox --marketplace Shaf2665/instabox-claude`.
In the desktop app, where `/plugin` doesn't run: click + next to the prompt box, then Plugins, Add marketplace with `Shaf2665/instabox-claude`, then Add plugin.

1. Answer `y` to "Add marketplace?".
2. Pick a scope. User scope loads it in every session.
3. On the config screen, enter your keys in the form above. They go to secure storage, never to a file.

To change the keys later, edit the plugin's settings in `/config`; it reloads by itself.

### Using it
- Ask your agent in plain words, as in the examples above.
- `/instabox` opens a pane listing your machines with **Wake**, **Sleep** and **Refresh** buttons.
- `/instabox wake <name>` and `/instabox sleep <name>` act from the prompt. Use `account/name` when two accounts share a machine name.
- `/instabox note <name> <text>` attaches a note that shows in the pane and is remembered across sessions.

## Codex

1. Clone this repo (Node 20+ is required):
   ```
   git clone https://github.com/Shaf2665/instabox-claude
   ```
2. Add this to `~/.codex/config.toml`, using the real absolute path to your clone:
   ```toml
   [mcp_servers.instabox]
   command = "node"
   args = ["/absolute/path/to/instabox-claude/mcp/server.mjs"]
   env_vars = ["INSTABOX_API_KEYS"]
   tool_timeout_sec = 300
   default_tools_approval_mode = "prompt"
   ```
3. Export your keys in your shell profile (`~/.bashrc`, `~/.zshrc`). The config only names the variable, so keys never sit in the config file:
   ```
   export INSTABOX_API_KEYS="personal=ibk_abc123,work=ibk_def456"
   ```
4. Restart Codex, then run `/mcp` to confirm `instabox` is listed. Ask in plain words, as above.

`tool_timeout_sec = 300` matters: Codex's default of 60 s is too short for waking a paused machine. Keep `default_tools_approval_mode = "prompt"`, since `exec` runs commands in your VMs.

## Other MCP clients, and Claude Code via MCP

Any client that can start a stdio MCP server runs the same command: `node /absolute/path/to/instabox-claude/mcp/server.mjs`, with `INSTABOX_API_KEYS` in its environment.

For Claude Code without the plugin:

```
claude mcp add --scope user instabox -- node /absolute/path/to/instabox-claude/mcp/server.mjs
```

Export `INSTABOX_API_KEYS` in your shell first; the server reads it from the environment it is started in. If your client does not pass your shell environment through, use its `--env` option, which stores the key in that client's own config, so keep that file private. This route is untested here.

Use either the plugin or the MCP server in Claude Code, not both, since they register the same tool names.

## Free-tier behaviour

- Free machines **idle-pause after 30 minutes**. `exec` and `wake` resume them for you.
- After a machine hits its **maximum run time (480 minutes)**, Instabox locks it for a cooldown and refuses every wake. The tool reports the time it unlocks and does not retry.
- The free plan allows **one machine per workspace** and a limited set of templates. Check Instabox's terms and limits before relying on several free accounts.

## Troubleshooting

| You see | Cause and fix |
| --- | --- |
| `Set the Instabox API keys in the mod config.` / `instabox-mcp: set INSTABOX_API_KEYS=...` | No keys reached it. Plugin: add them in `/config`. MCP: export the variable and restart the client. |
| `invalid_key`, `expired_key` or `revoked_key` for one account | That account's key is bad. Create a new one with `instabox keys create`. Other accounts keep working. |
| `exists in several accounts (...); say which account` | Two accounts have a machine with that name. Use `account/name`. |
| `locked until ...` | Cooldown after the max run time. Wait until the time shown. |
| `did not become ready in 3 minutes` | The machine did not finish booting. Try again, or check it in the Instabox dashboard. |
| Tool times out in Codex | Set `tool_timeout_sec = 300` (or higher) in the config. |
| `No Instabox machine "..."` | The name is wrong or its account failed to load. The error lists the machines it did find. |

## Is it safe?

Short version: small source files, one network host (`api.instabox.sh`), no install scripts or dependencies, and keys kept in secure storage or an environment variable. The main risk is that `exec` lets an agent run commands in your VMs. See [SECURITY.md](SECURITY.md) for what to check, and [AGENTS.md](AGENTS.md) if you are asking an AI agent to install it for you.

## Development

```
node --test mcp/server.test.mjs   # MCP server tests (mocked API, no network)
claude plugin validate .          # plugin manifest and module
claude plugin test .              # plugin tests
```

Licensed under the MIT License.
