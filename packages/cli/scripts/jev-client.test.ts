import { assertEquals } from '@std/assert'
import { ENDPOINT, makeJudge, MODEL, type Noul, parseKey, readKey } from './jev-client.ts'

const Q: Record<string, Noul> = { a: { type: 'noul', instructions: 'Is it?' } }
const ok = (answers: unknown) => new Response(JSON.stringify({ answers }), { status: 200 })

function stub(responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const f: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init })
    const r = responses.shift()
    if (r === undefined) return Promise.reject(new Error('no response left'))
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
  }
  return { f, calls }
}

Deno.test('parseKey: the value of TYPESAFE_API_KEY, comments and quotes ignored', () => {
  assertEquals(parseKey('# mounted\nOTHER=1\nTYPESAFE_API_KEY="abc"\n'), 'abc')
  assertEquals(parseKey('export TYPESAFE_API_KEY=xyz'), 'xyz')
  assertEquals(parseKey('TYPESAFE_API_KEY=\n'), null)
  assertEquals(parseKey('# nothing here'), null)
})

Deno.test('readKey: a missing file gives null', async () => {
  assertEquals(await readKey('/nonexistent/typesafe.env'), null)
})

Deno.test('readKey: a read that never ends (a locked 1Password FIFO) gives null in time', async () => {
  const t0 = Date.now()
  assertEquals(await readKey('x', 30, () => new Promise<string>(() => {})), null)
  assertEquals(Date.now() - t0 < 1000, true)
})

Deno.test('judge: posts the pinned model, the state and the questions with the bearer key', async () => {
  const { f, calls } = stub([ok({ a: { type: 'noul', noul: 0.25 } })])
  assertEquals(await makeJudge({ key: 'k1', fetch: f })({ text: 'hi' }, Q), { a: 0.25 })
  assertEquals(calls[0]?.url, ENDPOINT)
  const headers = new Headers(calls[0]?.init?.headers)
  assertEquals(headers.get('authorization'), 'Bearer k1')
  assertEquals(JSON.parse(String(calls[0]?.init?.body)), { model: MODEL, state: { text: 'hi' }, questions: Q })
})

Deno.test('judge: retries 429 and 529, then answers', async () => {
  const { f, calls } = stub([
    new Response('', { status: 429 }),
    new Response('', { status: 529 }),
    ok({ a: { noul: 0.9 } }),
  ])
  assertEquals(await makeJudge({ key: 'k', fetch: f, backoffMs: 1 })({}, Q), { a: 0.9 })
  assertEquals(calls.length, 3)
})

Deno.test('judge: any other failure is null, not an exception', async () => {
  for (const r of [new Response('no', { status: 401 }), new Response('bad', { status: 422 }), new Error('offline')]) {
    assertEquals(await makeJudge({ key: 'k', fetch: stub([r]).f })({}, Q), null)
  }
  assertEquals(await makeJudge({ key: 'k', fetch: stub([ok({ a: { noul: 'x' } })]).f })({}, Q), null)
  assertEquals(await makeJudge({ key: 'k', fetch: stub([ok({})]).f })({}, Q), null)
})

Deno.test('judge: a request that hangs is abandoned at the deadline', async () => {
  const hang: typeof fetch = (_input, init) =>
    new Promise((_ok, no) => init?.signal?.addEventListener('abort', () => no(new Error('aborted'))))
  const t0 = Date.now()
  assertEquals(await makeJudge({ key: 'k', fetch: hang, deadlineMs: 60, attemptMs: 40 })({}, Q), null)
  assertEquals(Date.now() - t0 < 1000, true)
})
