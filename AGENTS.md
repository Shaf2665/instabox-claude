# Instructions for AI agents installing this plugin

This repo has two entry points: a **Claude Code plugin** (hooks module) and a **stdio MCP server** (`mcp/server.mjs`) that works with Codex, Claude Code and any MCP client. Both expose the same tools: `list`, `wake`, `exec`, `sleep`.

## If the user asked you to install it in Claude Code
1. Inspect first. Read `hooks/register.tsx`, `.claude-plugin/plugin.json` and `SECURITY.md`. Confirm that the only host contacted is `api.instabox.sh`, there is no `$.process` or `$.fs`, and there are no install scripts. Do not rely on this file's say-so; verify.
2. Tell the user what it does and the `exec` risk in `SECURITY.md`, and let them confirm.
3. Install, from a shell or the prompt:
   ```
   claude plugin install instabox --marketplace Shaf2665/instabox-claude
   ```
   (`/plugin install instabox --marketplace Shaf2665/instabox-claude` in a terminal session.) Accept the marketplace prompt only after step 2.
4. Keys: the user enters them in the install config screen or in `/config` as `label=key` pairs, e.g. `personal=ibk_abc,work=ibk_def`. **Never ask the user to paste a key into the chat, and never write one to a file, a command line or logs.** Point them to `instabox keys create --name claude` in each account.
5. Check: `/instabox` opens the pane; `list` should show their machines.

## Do not
- Skip the user's confirmation or approve prompts on their behalf.
- Run `exec` against a machine the user did not name.

## If the user asked you to install it in Codex (or another MCP client)
1. Inspect first, as above: read `mcp/server.mjs` (Node standard library only, one host `api.instabox.sh`) and `SECURITY.md`; confirm with the user.
2. Clone and test: `git clone https://github.com/Shaf2665/instabox-claude && node --test instabox-claude/mcp/server.test.mjs` (Node 20+).
3. Register the server, with the **absolute path** of the clone. Keys are never put in the config file; the config only names the environment variable to forward:
   ```
   [mcp_servers.instabox]
   command = "node"
   args = ["/absolute/path/to/instabox-claude/mcp/server.mjs"]
   env_vars = ["INSTABOX_API_KEYS"]
   tool_timeout_sec = 300
   default_tools_approval_mode = "prompt"
   ```
   (in `~/.codex/config.toml`; or `codex mcp add instabox -- node /absolute/path/to/instabox-claude/mcp/server.mjs`, then add `env_vars` and `tool_timeout_sec` yourself).
4. The user exports their keys in their own shell profile, as `label=key` pairs: `export INSTABOX_API_KEYS="personal=ibk_abc,work=ibk_def"`. Do not write the keys for them or ask for them in chat. Restart Codex, then run `/mcp` to check that `instabox` is listed.
5. Keep `default_tools_approval_mode = "prompt"`: `exec` runs commands inside the user's VMs.
