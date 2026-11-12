# instabox-claude

**Control your Instabox VMs by chatting with an AI assistant.** Say "wake my build machine and run `uptime`" and it happens. No logging in, no SSH, no dashboard.

Works with **Claude Code** (as a plugin) and **Codex** (and other tools that support MCP).

## What is this, in plain words?

[Instabox](https://instabox.sh) gives you small cloud computers ("VMs", or "machines"). On the free plan they **fall asleep after 30 minutes** of inactivity. This project lets your AI assistant:

| Ask it to... | What happens |
| --- | --- |
| **list** your machines | Shows every machine, in every account you set up, and whether it's running, asleep or stopped |
| **wake** a machine | Wakes it up and waits until it is ready |
| **exec** (run) a command | Wakes the machine if needed, runs your command inside it, and shows the result |
| **sleep** a machine | Puts it to sleep (programs keep their state) |

You can connect **several Instabox accounts** and manage all their machines in one place.

## What you need

- [ ] An **Instabox account** (free is fine).
- [ ] **Claude Code** or **Codex** already installed and working.
- [ ] For Codex only: **Node.js 20 or newer** and **git**. Check by opening a terminal and typing `node --version`; it should print `v20` or higher. Get Node from [nodejs.org](https://nodejs.org).

> **What is a "terminal"?** The text window where you type commands. macOS: open the *Terminal* app. Windows: open *PowerShell* from the Start menu. Linux: you know the drill.

## Step 1: Get an API key from Instabox

An **API key** is like a password that lets this tool act on your Instabox account. You make one per account.

1. In a terminal, run:
   ```
   npx instabox@latest sh
   ```
   (This installs the Instabox command-line tool and signs you in. Follow the prompts to sign in.)
2. Create a key:
   ```
   instabox keys create --name claude
   ```
3. It prints something starting with `ibk_`. **Copy it now, it is shown only once.** Keep it private: never paste it into a chat or commit it to GitHub.

Have a second Instabox account? Sign in to *that* account and repeat steps 2-3. Each key only works for its own account.

### How you'll give the keys to this tool
Write each account as `name=key`, separated by commas. The **name is anything you like** (it appears in the machine list):

```
personal=ibk_abc123,work=ibk_def456
```

Only one account? Just the key works: `ibk_abc123`.

## Step 2: Install

Pick **A** if you use Claude Code, **B** if you use Codex.

### A. Claude Code (easiest)

1. In Claude Code, type this and press Enter:
   ```
   /plugin install instabox --marketplace Shaf2665/instabox-claude
   ```
   - No `/plugin` command (for example in the desktop app)? Click **+** next to the prompt box, then **Plugins**, then **Add marketplace**, type `Shaf2665/instabox-claude`, then **Add plugin**.
   - Prefer a normal terminal? `claude plugin install instabox --marketplace Shaf2665/instabox-claude`
2. It asks **"Add marketplace?"**. Press `y`.
3. It asks where to install. Choose the first option, **user** (so it works in every project).
4. It shows a box asking for your keys. Paste them in the `name=key,name=key` form from Step 1. They are stored in secure storage, not in a file.
5. You'll see **"Installed instabox. Plugin is now active."** Done.

### B. Codex

1. **Download this project.** In a terminal:
   ```
   git clone https://github.com/Shaf2665/instabox-claude
   ```
   Note where it went. Type `pwd` (macOS/Linux) or `cd` (Windows) inside the new `instabox-claude` folder to see the full path, for example `/Users/sam/instabox-claude` or `C:\Users\sam\instabox-claude`.
2. **Tell Codex about it.** Open (or create) Codex's settings file:
   - macOS/Linux: `~/.codex/config.toml`
   - Windows: `C:\Users\<you>\.codex\config.toml`

   Add this at the bottom, **replacing the path with yours**:
   ```toml
   [mcp_servers.instabox]
   command = "node"
   args = ['/Users/sam/instabox-claude/mcp/server.mjs']
   env_vars = ["INSTABOX_API_KEYS"]
   tool_timeout_sec = 300
   default_tools_approval_mode = "prompt"
   ```
   (On Windows write the path with single quotes, like `'C:\Users\sam\instabox-claude\mcp\server.mjs'`.)
3. **Save your keys on your computer** (not in that file). Use your keys from Step 1:
   - macOS/Linux: add this line to `~/.zshrc` (or `~/.bashrc`), then open a new terminal:
     ```
     export INSTABOX_API_KEYS="personal=ibk_abc123,work=ibk_def456"
     ```
   - Windows PowerShell: run this once, then open a new terminal:
     ```
     setx INSTABOX_API_KEYS "personal=ibk_abc123,work=ibk_def456"
     ```
4. **Restart Codex**, then type `/mcp`. You should see **instabox** in the list.

What those settings mean: `tool_timeout_sec = 300` gives Codex 5 minutes to wait for a sleeping machine to wake up (the default of 1 minute is too short). `default_tools_approval_mode = "prompt"` makes Codex ask you before running anything, which you want, because running a command changes things inside your machine.

## Step 3: Try it

Type any of these to your assistant:

1. **"List my Instabox machines."** You should get a list like `personal/dev-box: suspended`. If you see your machines, everything works.
2. **"Wake personal/dev-box."** It waits until the machine is ready, then confirms.
3. **"Run `uptime` on personal/dev-box."** It wakes the machine if needed and shows the output.
4. **"Put personal/dev-box to sleep."**

Machines are written **`account/machine`**, using the account name you chose in Step 1. If every machine name is unique you can leave the account out.

### Extras in Claude Code
- Type `/instabox` to open a small panel listing your machines with **Wake**, **Sleep** and **Refresh** buttons.
- `/instabox wake personal/dev-box` and `/instabox sleep personal/dev-box` do the same from the prompt.
- `/instabox note personal/dev-box "runs the nightly build"` adds a note that shows in the panel and is remembered.

## Adding or changing accounts later
- **Claude Code:** open `/config`, find the instabox plugin, and edit the keys. It reloads by itself.
- **Codex:** edit the `INSTABOX_API_KEYS` line (or re-run `setx` on Windows), open a new terminal, restart Codex.
- A key stopped working? Make a new one with `instabox keys create --name claude`, replace it, and revoke the old one in the Instabox dashboard.

## Good to know (free plan)
- Machines **fall asleep after 30 minutes** idle. You don't need to do anything: asking to wake or run a command wakes them.
- After a machine has been running **8 hours straight**, Instabox locks it for a cooldown. The assistant will tell you the time it unlocks; nothing can wake it before then.
- The free plan gives **one machine per account** and a limited set of templates. Check Instabox's own terms before relying on several free accounts.

## Something went wrong?

| What you see | What it means and what to do |
| --- | --- |
| "Set the Instabox API keys..." or "set INSTABOX_API_KEYS" | The keys didn't reach the tool. Claude Code: add them in `/config`. Codex: check Step 2B-3, **open a new terminal** and restart Codex. |
| `invalid_key`, `expired_key` or `revoked_key` | One account's key is bad. Make a new one (Step 1). Your other accounts keep working. |
| "exists in several accounts" | Two accounts have a machine with the same name. Say `account/name`, e.g. `work/box`. |
| "locked until ..." | The 8-hour cooldown. Wait until the time shown. |
| "did not become ready in 3 minutes" | The machine is slow to boot. Ask again, or check it in the Instabox dashboard. |
| Codex says the tool timed out | Make sure `tool_timeout_sec = 300` is in your config, then restart Codex. |
| "No Instabox machine ..." | Check the spelling. The message lists the machines it did find. |
| `instabox` missing from `/mcp` | The path in `args` is wrong or Node isn't installed. Check `node --version`, and that the file exists at that path. |

## Is it safe?

The code is small and readable: it talks to **one website only** (`api.instabox.sh`), has no hidden install steps, and keeps your keys out of files. The one thing to understand: **`exec` lets the AI run commands inside your machines**, so only connect machines you're comfortable with an AI working in, and keep Codex's approval prompts on. Details in [SECURITY.md](SECURITY.md). If you want an AI agent to do the setup for you, point it at [AGENTS.md](AGENTS.md).

## Other tools and developers

- **Other MCP-compatible tools:** run `node /absolute/path/to/instabox-claude/mcp/server.mjs` with `INSTABOX_API_KEYS` set. For Claude Code without the plugin: `claude mcp add --scope user instabox -- node /absolute/path/to/instabox-claude/mcp/server.mjs` (untested here). Don't use both the plugin and this in Claude Code; they have the same tool names.
- **Run the tests:** `node --test mcp/server.test.mjs`, `claude plugin validate .`, `claude plugin test .`

### Glossary
- **VM / machine:** a small cloud computer on Instabox.
- **API key:** a password-like token that lets a tool act on your account.
- **MCP:** a standard way for AI tools such as Codex to plug in extra abilities.
- **Plugin:** an add-on for Claude Code.

Licensed under the MIT License.
