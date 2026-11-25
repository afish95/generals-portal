import { createClient } from '@supabase/supabase-js'
import { sendWebPush } from '@/lib/webpush'

const SUPABASE_URL = 'https://nyttsmwrvnuehqdvtmyj.supabase.co'
const AUDIENCES = ['everyone', 'players', 'parents', 'coaches'] as const
type Audience = (typeof AUDIENCES)[number]
const ROLE_FOR: Record<Exclude<Audience, 'everyone'>, string> = {
  players: 'player',
  parents: 'parent',
  coaches: 'coach',
}

// POST /api/announcements: a coach posts an announcement; every matching user gets an inbox item + push.
export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return Response.json({ error: 'Server setup incomplete: add SUPABASE_SERVICE_ROLE_KEY in Vercel.' }, { status: 500 })
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData } = await admin.auth.getUser(token)
  const user = userData?.user
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', user.id).single()
  if (!me || me.role !== 'coach' || !me.is_active) {
    return Response.json({ error: 'Only active coaches can post announcements' }, { status: 403 })
  }

  let input: { title?: unknown; body?: unknown; audience?: unknown; link_url?: unknown; send_push?: unknown; recipient_ids?: unknown; group_id?: unknown; kind?: unknown }
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  const audience = (AUDIENCES as readonly string[]).includes(String(input.audience)) ? (input.audience as Audience) : 'everyone'
  const rawLink = typeof input.link_url === 'string' ? input.link_url.trim() : ''
  const link_url = rawLink && (rawLink.startsWith('/') || rawLink.startsWith('https://')) ? rawLink : null
  const send_push = input.send_push !== false

  // Targeted announcements (an assignment for specific players or one group's players)
  const KINDS = ['general', 'assignment', 'plan', 'workout']
  const kind = KINDS.includes(String(input.kind)) ? String(input.kind) : 'general'
  let targeted: string[] | null = null
  if (Array.isArray(input.recipient_ids)) targeted = input.recipient_ids.filter((x): x is string => typeof x === 'string').slice(0, 500)
  if (input.group_id != null && Number.isInteger(Number(input.group_id))) {
    const { data: gm } = await admin.from('group_members').select('athlete_id').eq('group_id', Number(input.group_id))
    targeted = [...new Set([...(targeted || []), ...(gm || []).map((r) => r.athlete_id as string)])]
  }
  if (targeted) {
    const { data: ok } = targeted.length ? await admin.from('profiles').select('id').in('id', targeted).eq('role', 'player').eq('is_active', true) : { data: [] }
    targeted = (ok || []).map((r) => r.id as string)
    if (!targeted.length) return Response.json({ ok: true, id: null, recipients: 0, pushed: 0, failed: 0 })
  }

  if (!title || title.length > 120) return Response.json({ error: 'Title is required (max 120 characters)' }, { status: 400 })
  if (body.length > 2000) return Response.json({ error: 'Message is too long (max 2000 characters)' }, { status: 400 })

  const { data: ann, error: annErr } = await admin
    .from('announcements')
    .insert({ author_id: user.id, title, body: body || null, audience: targeted ? 'players' : audience, link_url, send_push, recipient_ids: targeted, kind })
    .select('id')
    .single()
  if (annErr || !ann) return Response.json({ error: annErr?.message || 'Could not save announcement' }, { status: 500 })

  let recipientIds: string[]
  if (targeted) recipientIds = targeted
  else {
    let recipientsQuery = admin.from('profiles').select('id').eq('is_active', true)
    if (audience !== 'everyone') recipientsQuery = recipientsQuery.eq('role', ROLE_FOR[audience])
    const { data: recipients } = await recipientsQuery
    recipientIds = (recipients || []).map((r) => r.id as string)
  }

  if (recipientIds.length > 0) {
    await admin.from('notifications').insert(
      recipientIds.map((profile_id) => ({
        profile_id,
        kind: 'announcement',
        title,
        body: body || null,
        url: link_url || '/',
        announcement_id: ann.id,
      }))
    )
  }

  let pushed = 0
  let failed = 0
  if (send_push && recipientIds.length > 0) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('profile_id', recipientIds)

    const results = await Promise.allSettled(
      (subs || []).map(async (s) => {
        const status = await sendWebPush(s, {
          title,
          body: body.length > 180 ? `${body.slice(0, 177)}...` : body,
          url: link_url || '/',
          tag: `announcement-${ann.id}`,
        })
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id)
          throw new Error('expired')
        }
        if (status >= 400) throw new Error(`push ${status}`)
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id)
      })
    )
    pushed = results.filter((r) => r.status === 'fulfilled').length
    failed = results.length - pushed
  }

  return Response.json({ ok: true, id: ann.id, recipients: recipientIds.length, pushed, failed })
}
