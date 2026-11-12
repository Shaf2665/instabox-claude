#!/usr/bin/env node
// Instabox MCP server (stdio, zero dependencies). Same tools as the Claude Code
// plugin: list, wake, exec, sleep, across several Instabox accounts.
// Keys come from INSTABOX_API_KEYS="label=key,label2=key2". The only host contacted is api.instabox.sh.
import { realpathSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

const BASE = 'https://api.instabox.sh'

export function parseAccounts(text) {
  return String(text ?? '')
    .split(/[,\n]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((s, i) => {
      const at = s.indexOf('=')
      return at > 0 ? { label: s.slice(0, at).trim(), key: s.slice(at + 1).trim() } : { label: i === 0 ? 'default' : `acct${i + 1}`, key: s }
    })
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const isUp = m => m.state === 'running' && m.runtime?.ready === true

export function createApi({ accounts, fetchImpl = fetch, pause = sleep, now = () => Date.now() }) {
  async function call(acct, method, path, body, idem = false) {
    const headers = { 'X-API-Key': acct.key, 'Content-Type': 'application/json' }
    if (idem) headers['Idempotency-Key'] = `mcp-${now()}-${Math.random().toString(36).slice(2)}`
    const r = await fetchImpl(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await r.text()
    let json = {}
    try { json = text ? JSON.parse(text) : {} } catch { /* non-JSON body */ }
    if (!r.ok) throw new Error(`[${acct.label}] ${method} ${path}: ${json?.error?.code ?? r.status} ${json?.error?.message ?? ''}`.trim())
    return json
  }

  async function listOne(acct) {
    const out = []
    let cursor = null
    do {
      const page = await call(acct, 'GET', `/v1/machines${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
      out.push(...(page.machines ?? []))
      cursor = page.nextCursor ?? null
    } while (cursor)
    return out
  }

  async function listAll() {
    const hits = []
    const errors = []
    for (const acct of accounts) {
      try { for (const m of await listOne(acct)) hits.push({ m, acct }) } catch (e) { errors.push(String(e.message ?? e)) }
    }
    return { hits, errors }
  }

  async function find(ref, account) {
    let label = account
    let name = ref
    const slash = ref.indexOf('/')
    if (!label && slash > 0 && accounts.some(a => a.label === ref.slice(0, slash))) {
      label = ref.slice(0, slash)
      name = ref.slice(slash + 1)
    }
    const { hits, errors } = await listAll()
    const found = hits.filter(h => (h.m.id === name || h.m.name === name) && (!label || h.acct.label === label))
    if (found.length === 1) return found[0]
    if (found.length > 1) throw new Error(`"${name}" exists in several accounts (${found.map(h => h.acct.label).join(', ')}); say which account.`)
    throw new Error(`No Instabox machine "${ref}"${label ? ` in account ${label}` : ''}. Known: ${hits.map(h => `${h.acct.label}/${h.m.name}`).join(', ') || 'none'}.${errors.length ? ` Errors: ${errors.join('; ')}` : ''}`)
  }

  async function wake(ref, account) {
    const hit = await find(ref, account)
    const { acct } = hit
    let m = hit.m
    if (m.cooldownUntil && Date.parse(m.cooldownUntil) > now()) {
      throw new Error(`${m.name} is locked until ${m.cooldownUntil} (max-run or abuse cooldown); every wake is refused until then.`)
    }
    if (['suspended', 'suspending', 'resuming'].includes(m.state)) {
      m = await call(acct, 'POST', `/v1/machines/${m.id}/wake`, {}).catch(() => m)
      if (m.state === 'suspended') await call(acct, 'POST', `/v1/machines/${m.id}/resume`, {}, true)
    } else if (m.state === 'stopped') {
      await call(acct, 'POST', `/v1/machines/${m.id}/start`, {}, true)
    } else if (m.state === 'running') {
      await call(acct, 'POST', `/v1/machines/${m.id}/wake`, {}).catch(() => undefined)
    }
    for (let i = 0; i < 60; i++) {
      m = await call(acct, 'GET', `/v1/machines/${m.id}`)
      if (isUp(m)) return { m, acct }
      if (m.state === 'error' || m.state === 'deleted') throw new Error(`${m.name} is ${m.state}: ${m.lastError?.message ?? 'see instabox logs'}`)
      await pause(3000)
    }
    throw new Error(`${m.name} did not become ready in 3 minutes (state ${m.state}).`)
  }

  return {
    async list() {
      const { hits, errors } = await listAll()
      const rows = hits.map(({ m, acct }) => ({ account: acct.label, id: m.id, name: m.name, state: m.state, ready: isUp(m), cooldownUntil: m.cooldownUntil ?? null }))
      return JSON.stringify({ machines: rows, errors }, null, 1)
    },
    async wake({ machine, account }) {
      const { m, acct } = await wake(machine, account)
      return `${acct.label}/${m.name} is running and ready (id ${m.id}).`
    },
    async exec({ machine, cmd, account, timeoutSeconds }) {
      const { m, acct } = await wake(machine, account)
      const r = await call(acct, 'POST', `/v1/machines/${m.id}/exec`, { cmd, timeoutSeconds: Math.min(timeoutSeconds ?? 120, 600) })
      return `${acct.label}/${m.name} exit ${r.exitCode}${r.timedOut ? ' (timed out)' : ''}\n--- stdout ---\n${r.stdout ?? ''}\n--- stderr ---\n${r.stderr ?? ''}`
    },
    async sleep({ machine, account }) {
      const { m, acct } = await find(machine, account)
      await call(acct, 'POST', `/v1/machines/${m.id}/suspend`, {}, true)
      return `${acct.label}/${m.name}: pause requested.`
    },
  }
}

const machineProps = {
  machine: { type: 'string', description: 'Machine name, id, or account/name.' },
  account: { type: 'string', description: 'Account label, when the same name exists in several accounts.' },
}

export const TOOLS = [
  { name: 'list', description: "List the user's Instabox VMs across all configured accounts, with account label and state.", inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'wake', description: 'Wake an Instabox VM (resume if paused, start if stopped) and wait until it is ready.', inputSchema: { type: 'object', properties: machineProps, required: ['machine'] } },
  { name: 'exec', description: 'Run a shell command inside an Instabox VM, waking it first if paused or stopped. Max 600 s.', inputSchema: { type: 'object', properties: { ...machineProps, cmd: { type: 'string' }, timeoutSeconds: { type: 'number' } }, required: ['machine', 'cmd'] } },
  { name: 'sleep', description: 'Pause (suspend) an Instabox VM, keeping its running programs.', inputSchema: { type: 'object', properties: machineProps, required: ['machine'] } },
]

const INSTRUCTIONS = 'Manage Instabox VMs across several accounts. Use list first. exec wakes a paused machine automatically. Free-tier machines idle-pause after 30 minutes and are locked for a cooldown after their max run; the error says until when. Never run exec against a machine the user did not name.'

export async function handle(msg, api) {
  switch (msg.method) {
    case 'initialize':
      return { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'instabox', version: '0.2.0' }, instructions: INSTRUCTIONS }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call': {
      const { name, arguments: args = {} } = msg.params ?? {}
      if (!TOOLS.some(t => t.name === name)) throw Object.assign(new Error(`Unknown tool ${name}`), { code: -32602 })
      try {
        return { content: [{ type: 'text', text: await api[name](args) }] }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: String(e.message ?? e) }] }
      }
    }
    default:
      if (msg.id === undefined) return undefined // notification
      throw Object.assign(new Error(`Method not found: ${msg.method}`), { code: -32601 })
  }
}

const isMain = (() => {
  try { return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href } catch { return false }
})()

if (isMain) {
  const accounts = parseAccounts(process.env.INSTABOX_API_KEYS ?? process.env.INSTABOX_API_KEY)
  if (accounts.length === 0) process.stderr.write('instabox-mcp: set INSTABOX_API_KEYS="label=key,label2=key2"\n')
  const api = createApi({ accounts })
  const send = o => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...o })}\n`)
  createInterface({ input: process.stdin }).on('line', async line => {
    let msg
    try { msg = JSON.parse(line) } catch { return }
    try {
      const result = await handle(msg, api)
      if (msg.id !== undefined) send({ id: msg.id, result: result ?? {} })
    } catch (e) {
      if (msg.id !== undefined) send({ id: msg.id, error: { code: e.code ?? -32603, message: String(e.message ?? e) } })
    }
  })
}
