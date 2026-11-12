import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApi, handle, parseAccounts } from './server.mjs'

const res = v => ({ ok: true, status: 200, text: async () => JSON.stringify(v) })

test('parses label=key pairs and a bare key', () => {
  assert.deepEqual(parseAccounts('a=ibk_1, b=ibk_2'), [{ label: 'a', key: 'ibk_1' }, { label: 'b', key: 'ibk_2' }])
  assert.deepEqual(parseAccounts('ibk_9'), [{ label: 'default', key: 'ibk_9' }])
})

test('two accounts: ambiguity refused, exec wakes the right account only', async () => {
  const calls = []
  const state = { a: 'suspended', b: 'suspended' }
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname
    assert.equal(new URL(url).host, 'api.instabox.sh')
    const who = init.headers['X-API-Key'] === 'ibk_a' ? 'a' : 'b'
    calls.push(`${who} ${init.method} ${path}`)
    const m = { id: `m-${who}`, name: 'box', state: state[who], runtime: { ready: state[who] === 'running' }, cooldownUntil: null }
    if (path === '/v1/machines') return res({ machines: [m], nextCursor: null })
    if (path.endsWith('/wake')) { state[who] = 'running'; return res({ ...m, state: 'running', runtime: { ready: true } }) }
    if (path.endsWith('/exec')) return res({ stdout: `hi from ${who}\n`, stderr: '', exitCode: 0 })
    return res(m)
  }
  const api = createApi({ accounts: parseAccounts('a=ibk_a,b=ibk_b'), fetchImpl, pause: async () => {} })

  const clash = await handle({ id: 1, method: 'tools/call', params: { name: 'wake', arguments: { machine: 'box' } } }, api)
  assert.equal(clash.isError, true)
  assert.match(clash.content[0].text, /several accounts/)

  const ran = await handle({ id: 2, method: 'tools/call', params: { name: 'exec', arguments: { machine: 'b/box', cmd: 'echo hi' } } }, api)
  assert.match(ran.content[0].text, /hi from b/)
  assert.ok(calls.includes('b POST /v1/machines/m-b/wake'))
  assert.ok(!calls.some(c => c.startsWith('a POST')))
})

test('a failing account does not hide the others', async () => {
  const fetchImpl = async (url, init) =>
    init.headers['X-API-Key'] === 'bad'
      ? { ok: false, status: 401, text: async () => JSON.stringify({ error: { code: 'invalid_key' } }) }
      : res({ machines: [{ id: 'x', name: 'box', state: 'running', runtime: { ready: true } }], nextCursor: null })
  const api = createApi({ accounts: parseAccounts('a=good,b=bad'), fetchImpl })
  const out = JSON.parse(await api.list())
  assert.equal(out.machines.length, 1)
  assert.match(out.errors[0], /invalid_key/)
})

test('protocol: initialize and tools/list', async () => {
  const init = await handle({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, {})
  assert.equal(init.serverInfo.name, 'instabox')
  assert.deepEqual((await handle({ id: 2, method: 'tools/list' }, {})).tools.map(t => t.name), ['list', 'wake', 'exec', 'sleep'])
})
