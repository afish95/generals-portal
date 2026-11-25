'use client'

import { callApi } from '@/lib/api'

/** Tell players about something assigned to them: an announcement in their feed plus a push to their phones. */
export async function notifyPlayers(opts: { title: string; body?: string; url?: string; groupId?: number | null; recipientIds?: string[]; everyone?: boolean; kind?: 'assignment' | 'plan' | 'workout' }) {
  const target = opts.everyone ? { audience: 'players' } : { group_id: opts.groupId ?? undefined, recipient_ids: opts.recipientIds }
  return callApi<{ recipients: number; pushed: number }>('/api/announcements', {
    body: { title: opts.title.slice(0, 120), body: opts.body || '', link_url: opts.url || '/', send_push: true, kind: opts.kind || 'assignment', ...target },
  })
}
