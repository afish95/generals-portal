import { createBrowserClient } from '@supabase/ssr'

// ---------------------------------------------------------------------------
// Read-only mode (coach "view as player"): while on, every client this module
// hands out refuses inserts, updates, upserts, deletes and non-read RPCs, and
// POST/PUT/PATCH/DELETE calls to /api/* are refused too. Nothing a coach taps
// in player view can change a player's logs.
// ---------------------------------------------------------------------------
let readOnly = false
export const READ_ONLY_EVENT = 'generals-read-only-blocked'

/** RPCs that only read data and are safe in player view. Anything else is blocked. */
const READ_RPCS = new Set([
  'daily_points',
  'class_points',
  'leaderboard',
  'position_leaderboard',
  'progressions',
  'recap',
  'exercise_bests',
  'training_days',
  'batting_lines',
  'pitching_lines',
  'game_seasons',
  'drill_trends',
  'drill_ranks',
  'conversations_for',
  'conversation_reads',
  'my_conversations',
  'benchmark_inputs',
])
const WRITES = new Set(['insert', 'update', 'upsert', 'delete'])

function notifyBlocked() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(READ_ONLY_EVENT))
}

/** A stand-in query that resolves to an error no matter what is chained on it. */
function blockedQuery() {
  notifyBlocked()
  const result = { data: null, error: { message: 'Preview only: nothing was saved', code: 'READ_ONLY', details: '', hint: '' }, count: null, status: 403, statusText: 'Read only' }
  const chain: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej)
      return () => chain
    },
    apply() {
      return chain
    },
  })
  return chain
}

let fetchPatched = false
function patchFetch() {
  if (fetchPatched || typeof window === 'undefined') return
  fetchPatched = true
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (readOnly) {
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const path = url.startsWith('http') ? new URL(url).pathname : url
      if (method !== 'GET' && method !== 'HEAD' && path.startsWith('/api/')) {
        notifyBlocked()
        return Promise.resolve(new Response(JSON.stringify({ error: 'Preview only: nothing was saved' }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
      }
    }
    return original(input, init)
  }
}

export function setReadOnlyMode(on: boolean) {
  readOnly = on
  if (on) patchFetch()
}
export const isReadOnlyMode = () => readOnly

function baseClient() {
  return createBrowserClient('https://nyttsmwrvnuehqdvtmyj.supabase.co', 'sb_publishable_oZ2LGTvtC4RT0ThclPshKw_cjTdvwwg')
}

let roClient: ReturnType<typeof baseClient> | null = null

export function createClient() {
  const client = baseClient()
  if (!readOnly) return client
  // One stable wrapped client (the browser client itself is a singleton), so hooks that list it as a dependency don't loop
  if (roClient) return roClient
  roClient = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const qb = target.from(table)
          return new Proxy(qb, {
            get(q, p) {
              if (typeof p === 'string' && WRITES.has(p)) return () => blockedQuery()
              const v = Reflect.get(q, p, q)
              return typeof v === 'function' ? v.bind(q) : v
            },
          })
        }
      }
      if (prop === 'rpc') {
        return (fn: string, args?: Record<string, unknown>, opts?: Parameters<typeof target.rpc>[2]) =>
          READ_RPCS.has(fn) ? target.rpc(fn, args, opts) : blockedQuery()
      }
      if (prop === 'storage' || prop === 'functions') return new Proxy({}, { get: () => () => blockedQuery() })
      const v = Reflect.get(target, prop, receiver)
      return typeof v === 'function' ? v.bind(target) : v
    },
  }) as typeof client
  return roClient
}
