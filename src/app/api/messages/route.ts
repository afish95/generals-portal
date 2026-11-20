import { createClient } from '@supabase/supabase-js'
import { sendWebPush } from '@/lib/webpush'
import { SUPABASE_URL } from '@/lib/server-auth'

const PUBLISHABLE_KEY = 'sb_publishable_oZ2LGTvtC4RT0ThclPshKw_cjTdvwwg'

// POST /api/messages: send a chat message, then push it to everyone else in the conversation.
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ error: 'Not signed in' }, { status: 401 })

  let input: { conversation_id?: unknown; body?: unknown }
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const conversationId = Number(input.conversation_id)
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (!Number.isInteger(conversationId)) return Response.json({ error: 'Missing conversation' }, { status: 400 })
  if (!body || body.length > 4000) return Response.json({ error: 'Message must be 1–4000 characters' }, { status: 400 })

  // Insert as the user, so row-level security decides whether they may post here.
  const asUser = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData } = await asUser.auth.getUser(token)
  const user = userData?.user
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { data: msg, error: insErr } = await asUser
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, body })
    .select('id, created_at')
    .single()
  if (insErr || !msg) return Response.json({ error: insErr?.message || 'Could not send' }, { status: 403 })

  // Pushes are best-effort; the message is already saved.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  let pushed = 0
  if (serviceKey) {
    const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const [{ data: convo }, { data: sender }] = await Promise.all([
      admin.from('conversations').select('kind, title, group_id, member_a, member_b').eq('id', conversationId).single(),
      admin.from('profiles').select('full_name').eq('id', user.id).single(),
    ])
    let recipientIds: string[] = []
    if (convo?.kind === 'direct') {
      recipientIds = [convo.member_a, convo.member_b].filter((x: string) => x && x !== user.id)
    } else if (convo?.kind === 'team') {
      const { data } = await admin.from('profiles').select('id').eq('is_active', true).in('role', ['player', 'coach'])
      recipientIds = (data || []).map((r) => r.id as string)
    } else if (convo?.kind === 'group') {
      const [{ data: members }, { data: coaches }] = await Promise.all([
        admin.from('group_members').select('athlete_id').eq('group_id', convo.group_id),
        admin.from('profiles').select('id').eq('role', 'coach').eq('is_active', true),
      ])
      recipientIds = [...(members || []).map((m) => m.athlete_id as string), ...(coaches || []).map((c) => c.id as string)]
    }
    recipientIds = [...new Set(recipientIds)].filter((id) => id !== user.id)

    if (recipientIds.length) {
      const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('profile_id', recipientIds)
      const title = convo?.kind === 'direct' ? sender?.full_name || 'New message' : `${sender?.full_name || 'Someone'} · ${convo?.title || 'Team chat'}`
      const results = await Promise.allSettled(
        (subs || []).map(async (s) => {
          const status = await sendWebPush(s, {
            title,
            body: body.length > 160 ? `${body.slice(0, 157)}...` : body,
            url: '/messages',
            tag: `conv-${conversationId}`,
          })
          if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
          if (status >= 400) throw new Error(String(status))
        })
      )
      pushed = results.filter((r) => r.status === 'fulfilled').length
    }
  }

  return Response.json({ ok: true, id: msg.id, created_at: msg.created_at, pushed })
}
