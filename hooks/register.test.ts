import { expect, test } from 'claude-code/testing'

const ok = (v: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(v) } })

test('two accounts merge, ambiguity is refused, exec wakes the right account', { options: { api_keys: 'a=ibk_a,b=ibk_b' } }, async ($, on) => {
  const calls: string[] = []
  const state: Record<string, string> = { a: 'suspended', b: 'suspended' }
  on('command.register', () => ({ value: { command: 'instabox' } }))
  on('tool.register', () => ({ value: { tool: 'x' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('http.fetch', (_, e) => {
    const path = new URL(e.url).pathname
    const who = (e.init?.headers as Record<string, string>)['X-API-Key'] === 'ibk_a' ? 'a' : 'b'
    calls.push(`${who} ${e.init?.method ?? 'GET'} ${path}`)
    const m = { id: `m-${who}`, name: 'box', state: state[who], runtime: { ready: state[who] === 'running' }, cooldownUntil: null }
    if (path === '/v1/machines') return ok({ machines: [m], nextCursor: null })
    if (path.endsWith('/wake')) { state[who] = 'running'; return ok({ ...m, state: 'running', runtime: { ready: true } }) }
    if (path.endsWith('/exec')) return ok({ stdout: `hi from ${who}\n`, stderr: '', exitCode: 0 })
    return ok(m)
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const clash = await $.tool.call({ tool: 'mcp__instabox__wake', machine: 'box' })
  expect(String(clash.deny)).toContain('several accounts')

  const ran = await $.tool.call({ tool: 'mcp__instabox__exec', machine: 'b/box', cmd: 'echo hi' })
  expect(String(ran.result)).toContain('hi from b')
  expect(calls.some(c => c === 'b POST /v1/machines/m-b/wake')).toBe(true)
  expect(calls.some(c => c.startsWith('a POST') && c.endsWith('/wake'))).toBe(false)
})
