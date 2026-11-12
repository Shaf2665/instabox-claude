# Instructions for AI agents installing this plugin

This is a **Claude Code plugin** (a hooks module). Codex and other agents cannot load it; they can only help the user clone or inspect it.

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
