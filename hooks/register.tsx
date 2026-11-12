import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { MachineRow } from '../types'

const PANE = 'instabox'
const BASE = 'https://api.instabox.sh'
const view = atom({ plugin: 'instabox', key: 'view' } as const, { rows: [], message: '' }, { shape: 'view-2' })

type Raw = Record<string, any>
type Acct = { label: string; key: string }
type Hit = { m: Raw; acct: Acct }

class ApiError extends Error {}

function parseAccounts(text: string): Acct[] {
  return text
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      const at = s.indexOf('=')
      return at > 0 ? { label: s.slice(0, at).trim(), key: s.slice(at + 1).trim() } : { label: i === 0 ? 'default' : `acct${i + 1}`, key: s }
    })
}

async function call($: any, acct: Acct, method: string, path: string, body?: unknown, idem = false) {
  const headers: Record<string, string> = { 'X-API-Key': acct.key, 'Content-Type': 'application/json' }
  if (idem) headers['Idempotency-Key'] = `claude-${await $.clock.now()}-${Math.random().toString(36).slice(2)}`
  const r = await $.http.fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  let json: Raw = {}
  try { json = r.text ? JSON.parse(r.text) : {} } catch { /* non-JSON body */ }
  if (!r.ok) {
    const code = json?.error?.code ?? r.status
    throw new ApiError(`[${acct.label}] ${method} ${path}: ${code} ${json?.error?.message ?? ''}`.trim())
  }
  return json
}

async function listOne($: any, acct: Acct): Promise<Raw[]> {
  const out: Raw[] = []
  let cursor: string | null = null
  do {
    const page: Raw = await call($, acct, 'GET', `/v1/machines${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
    out.push(...(page.machines ?? []))
    cursor = page.nextCursor ?? null
  } while (cursor)
  return out
}

// Every account is queried; one failing key does not hide the others.
async function listAll($: any, accounts: Acct[]): Promise<{ hits: Hit[]; errors: string[] }> {
  const hits: Hit[] = []
  const errors: string[] = []
  for (const acct of accounts) {
    try {
      for (const m of await listOne($, acct)) hits.push({ m, acct })
    } catch (err) {
      errors.push(String(err))
    }
  }
  return { hits, errors }
}

// ref is a name or id, or "account/name".
async function find($: any, accounts: Acct[], ref: string, account?: string): Promise<Hit> {
  let label = account
  let name = ref
  const slash = ref.indexOf('/')
  if (!label && slash > 0 && accounts.some(a => a.label === ref.slice(0, slash))) {
    label = ref.slice(0, slash)
    name = ref.slice(slash + 1)
  }
  const { hits, errors } = await listAll($, accounts)
  const found = hits.filter(h => (h.m.id === name || h.m.name === name) && (!label || h.acct.label === label))
  if (found.length === 1) return found[0]
  if (found.length > 1) {
    throw new ApiError(`"${name}" exists in several accounts (${found.map(h => h.acct.label).join(', ')}); say which account.`)
  }
  throw new ApiError(
    `No Instabox machine "${ref}"${label ? ` in account ${label}` : ''}. Known: ${hits.map(h => `${h.acct.label}/${h.m.name}`).join(', ') || 'none'}.${errors.length ? ` Errors: ${errors.join('; ')}` : ''}`,
  )
}

const isUp = (m: Raw) => m.state === 'running' && m.runtime?.ready === true

async function wake($: any, accounts: Acct[], ref: string, account?: string): Promise<Hit> {
  const hit = await find($, accounts, ref, account)
  const { acct } = hit
  let m = hit.m
  if (m.cooldownUntil && Date.parse(m.cooldownUntil) > (await $.clock.now())) {
    throw new ApiError(`${m.name} is locked until ${m.cooldownUntil} (max-run or abuse cooldown); every wake is refused until then.`)
  }
  if (m.state === 'suspended' || m.state === 'suspending' || m.state === 'resuming') {
    // /wake resumes an idle-suspended machine; a manual pause needs /resume.
    m = await call($, acct, 'POST', `/v1/machines/${m.id}/wake`, {}).catch(() => m)
    if (m.state === 'suspended') await call($, acct, 'POST', `/v1/machines/${m.id}/resume`, {}, true)
  } else if (m.state === 'stopped') {
    await call($, acct, 'POST', `/v1/machines/${m.id}/start`, {}, true)
  } else if (m.state === 'running') {
    await call($, acct, 'POST', `/v1/machines/${m.id}/wake`, {}).catch(() => undefined)
  }
  for (let i = 0; i < 60; i++) {
    m = await call($, acct, 'GET', `/v1/machines/${m.id}`)
    if (isUp(m)) return { m, acct }
    if (m.state === 'error' || m.state === 'deleted') throw new ApiError(`${m.name} is ${m.state}: ${m.lastError?.message ?? 'see instabox logs'}`)
    await $.clock.sleep(3000)
  }
  throw new ApiError(`${m.name} did not become ready in 3 minutes (state ${m.state}).`)
}

async function exec($: any, accounts: Acct[], ref: string, cmd: string, account?: string, timeoutSeconds?: number) {
  const { m, acct } = await wake($, accounts, ref, account)
  const r = await call($, acct, 'POST', `/v1/machines/${m.id}/exec`, { cmd, timeoutSeconds: Math.min(timeoutSeconds ?? 120, 600) })
  return `${acct.label}/${m.name} exit ${r.exitCode}${r.timedOut ? ' (timed out)' : ''}\n--- stdout ---\n${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}`
}

async function sleepMachine($: any, accounts: Acct[], ref: string, account?: string): Promise<Hit> {
  const hit = await find($, accounts, ref, account)
  await call($, hit.acct, 'POST', `/v1/machines/${hit.m.id}/suspend`, {}, true)
  return hit
}

async function refresh($: any, accounts: Acct[]) {
  if (accounts.length === 0) return update($, view, v => ({ ...v, message: 'Set the Instabox API keys in the mod config.' }))
  try {
    const notes = ((await $.store.get('notes')) ?? {}) as Record<string, string>
    const { hits, errors } = await listAll($, accounts)
    const rows: MachineRow[] = hits.map(({ m, acct }) => ({
      account: acct.label,
      id: m.id,
      name: m.name,
      state: m.state,
      isReady: isUp(m),
      cooldownUntil: m.cooldownUntil ?? null,
      note: notes[`${acct.label}/${m.name}`] ?? notes[m.name] ?? '',
    }))
    if (errors.length < accounts.length) await $.store.set('machines', rows)
    await update($, view, () => ({
      rows,
      message: `Synced ${rows.length} machine(s) from ${accounts.length - errors.length}/${accounts.length} account(s).${errors.length ? ` ${errors.join('; ')}` : ''}`,
    }))
  } catch (err) {
    await update($, view, v => ({ ...v, message: String(err) }))
  }
}

async function act($: any, accounts: Acct[], ref: string, account: string | undefined, kind: 'wake' | 'sleep') {
  await update($, view, v => ({ ...v, message: `${kind === 'wake' ? 'Waking' : 'Pausing'} ${ref}...` }))
  try {
    if (kind === 'wake') await wake($, accounts, ref, account)
    else await sleepMachine($, accounts, ref, account)
  } catch (err) {
    await update($, view, v => ({ ...v, message: String(err) }))
    return
  }
  await refresh($, accounts)
}

const TOOLS = [
  ['list', "List the user's Instabox VMs across all their accounts, with account label and state (running, suspended, stopped)."],
  ['wake', 'Wake an Instabox VM (resume if paused, start if stopped) and wait until it is ready. Input: machine (name, id or account/name), optional account.'],
  ['exec', 'Run a shell command in an Instabox VM, waking it first if paused or stopped. Input: machine (name, id or account/name), cmd, optional account, optional timeoutSeconds (max 600).'],
  ['sleep', 'Pause (suspend) an Instabox VM, keeping its running programs. Input: machine, optional account.'],
] as const

export const register: Register = (on, options) => {
  const accounts = parseAccounts(String(options.api_keys ?? ''))

  on('session.start', async ($, e, next) => {
    const cached = ((await $.store.get('machines')) ?? []) as MachineRow[]
    await update($, view, () => ({ rows: cached, message: 'Cached; refreshing...' }))
    await $.command.register({ name: 'instabox', description: 'Instabox VMs: /instabox [wake|sleep <[account/]name> | note <[account/]name> <text>]' })
    for (const [name, description] of TOOLS) {
      await $.tool.register({
        name,
        description,
        isDeferred: false,
        inputSchema: {
          type: 'object',
          properties: { machine: { type: 'string' }, account: { type: 'string' }, cmd: { type: 'string' }, timeoutSeconds: { type: 'number' } },
          required: name === 'list' ? [] : name === 'exec' ? ['machine', 'cmd'] : ['machine'],
        },
      })
    }
    void refresh($, accounts)
    return next(e)
  })

  on('tool.call', { tool: 'mcp__instabox__list' }, async $ => {
    try {
      await refresh($, accounts)
      return { result: JSON.stringify((await read($, view)).rows, null, 1) }
    } catch (err) {
      return { deny: String(err) }
    }
  })

  on('tool.call', { tool: 'mcp__instabox__wake' }, async ($, e) => {
    try {
      const i = e as Raw
      const { m, acct } = await wake($, accounts, i.machine, i.account)
      void refresh($, accounts)
      return { result: `${acct.label}/${m.name} is running and ready (id ${m.id}).` }
    } catch (err) {
      return { deny: String(err) }
    }
  })

  on('tool.call', { tool: 'mcp__instabox__exec' }, async ($, e) => {
    try {
      const i = e as Raw
      const text = await exec($, accounts, i.machine, i.cmd, i.account, i.timeoutSeconds)
      void refresh($, accounts)
      return { result: text }
    } catch (err) {
      return { deny: String(err) }
    }
  })

  on('tool.call', { tool: 'mcp__instabox__sleep' }, async ($, e) => {
    try {
      const i = e as Raw
      const { m, acct } = await sleepMachine($, accounts, i.machine, i.account)
      void refresh($, accounts)
      return { result: `${acct.label}/${m.name}: pause requested.` }
    } catch (err) {
      return { deny: String(err) }
    }
  })

  on('command.run', { command: 'instabox' }, async ($, e) => {
    const [verb, name, ...rest] = e.args.trim().split(/\s+/)
    if ((verb === 'wake' || verb === 'sleep') && name) {
      await $.ui.open({ id: PANE, title: 'Instabox' })
      void act($, accounts, name, undefined, verb)
      return { text: `${verb === 'wake' ? 'Waking' : 'Pausing'} ${name}...` }
    }
    if (verb === 'note' && name) {
      const notes = ((await $.store.get('notes')) ?? {}) as Record<string, string>
      notes[name] = rest.join(' ')
      await $.store.set('notes', notes)
      await refresh($, accounts)
      return { text: `Noted ${name}.` }
    }
    await $.ui.open({ id: PANE, title: 'Instabox' })
    void refresh($, accounts)
    return { text: 'Instabox pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { rows, message } = await read($, view)
    return (
      <Box flexDirection="column">
        {rows.length === 0 && <Text dimColor>No machines.</Text>}
        {rows.map(r => (
          <Box key={`${r.account}:${r.id}`}>
            <Text dimColor={!r.isReady}>
              {r.isReady ? 'on  ' : r.state.padEnd(4)} {r.account}/{r.name}
              {r.note ? ` - ${r.note}` : ''}
              {r.cooldownUntil ? ' (cooldown)' : ''}{' '}
            </Text>
            <Button key={`w-${r.account}:${r.id}`} label="Wake" onPress={() => act($, accounts, r.id, r.account, 'wake')} />
            <Button key={`s-${r.account}:${r.id}`} label="Sleep" onPress={() => act($, accounts, r.id, r.account, 'sleep')} />
          </Box>
        ))}
        <Button key="refresh" label="Refresh" onPress={() => refresh($, accounts)} />
        {message !== '' && <Text dimColor>{message}</Text>}
      </Box>
    )
  })
}
