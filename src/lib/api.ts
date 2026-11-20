'use client'

import { createClient } from '@/lib/supabase'

/** Calls one of our own API routes with the signed-in user's token. */
export async function callApi<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(path, {
      method: init.method || 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json.error || `Request failed (${res.status})` }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Network error. Try again.' }
  }
}
