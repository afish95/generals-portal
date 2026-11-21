import { createClient } from '@supabase/supabase-js'
import { sendWebPush } from '@/lib/webpush'
import { SUPABASE_URL } from '@/lib/server-auth'
import { computeStreak, streakAddDays, STREAK_GOAL, type DayScore } from '@/lib/streak'

const PUBLISHABLE_KEY = 'sb_publishable_oZ2LGTvtC4RT0ThclPshKw_cjTdvwwg'

/**
 * POST /api/streak { today: 'YYYY-MM-DD' }
 * Re-checks the signed-in player's perfect-day streak on the server. When it has reached a
 * 14-day milestone that hasn't been awarded yet, it records the award, sends the player a
 * "Congratulations!" message from the coach, and alerts the coaches. Safe to call repeatedly.
 */
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ error: 'Not signed in' }, { status: 401 })
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return Response.json({ error: 'Server setup incomplete' }, { status: 500 })

  let today = ''
  try {
    const body = await req.json()
    today = typeof body.today === 'string' ? body.today : ''
  } catch {}
  // The player's local date, allowed within a day of the server's date
  const serverToday = new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Math.abs(Date.parse(today) - Date.parse(serverToday)) > 36 * 3600 * 1000) {
    today = serverToday
  }

  const asUser = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData } = await asUser.auth.getUser(token)
  const user = userData?.user
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: me } = await admin.from('profiles').select('full_name, role, is_active').eq('id', user.id).single()
  if (!me || me.role !== 'player' || !me.is_active) return Response.json({ ok: true, awarded: false })

  // Points are computed by the database exactly as the app shows them
  const { data: rows, error } = await asUser.rpc('daily_points', { p_from: streakAddDays(today, -119), p_to: today })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const mine: DayScore[] = ((rows as { athlete_id: string; d: string; earned: number; available: number }[]) || [])
    .filter((r) => r.athlete_id === user.id)
    .map((r) => ({ d: String(r.d), earned: Number(r.earned), available: Number(r.available) }))
  const s = computeStreak(mine, today)
  if (s.completions < 1 || !s.milestoneDay) return Response.json({ ok: true, awarded: false, streak: s.streak })

  const days = s.completions * STREAK_GOAL
  const { data: award } = await admin
    .from('streak_awards')
    .upsert({ athlete_id: user.id, achieved_on: s.milestoneDay, days }, { onConflict: 'athlete_id,achieved_on', ignoreDuplicates: true })
    .select('id')
    .maybeSingle()
  if (!award) return Response.json({ ok: true, awarded: false, streak: s.streak }) // already celebrated

  const first = (me.full_name || 'there').split(' ')[0]
  const { data: coaches } = await admin.from('profiles').select('id, full_name').eq('role', 'coach').eq('is_active', true).order('created_at')
  const coachList = (coaches || []) as { id: string; full_name: string }[]
  const sender = coachList[0]

  // 1) "Congratulations!" to the player, in their DM with the coach
  if (sender) {
    const a = sender.id < user.id ? sender.id : user.id
    const b = sender.id < user.id ? user.id : sender.id
    let { data: convo } = await admin.from('conversations').select('id').eq('kind', 'direct').eq('member_a', a).eq('member_b', b).maybeSingle()
    if (!convo) {
      const { data: alt } = await admin.from('conversations').select('id').eq('kind', 'direct').eq('member_a', b).eq('member_b', a).maybeSingle()
      convo = alt
    }
    if (!convo) {
      const { data: created } = await admin.from('conversations').insert({ kind: 'direct', member_a: a, member_b: b, created_by: sender.id }).select('id').single()
      convo = created
    }
    if (convo) {
      const text =
        days === STREAK_GOAL
          ? `🏆 Congratulations, ${first}! You just finished a 14-day perfect-points streak: every point, every day, for two straight weeks. That's what Generals do. Keep it rolling!`
          : `🏆 Congratulations, ${first}! That's ${days} straight perfect-points days. Unreal consistency. Keep stacking them!`
      await admin.from('messages').insert({ conversation_id: convo.id, sender_id: sender.id, body: text })
      await admin.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convo.id)
    }
  }

  // 2) Alert the coaches (in-app notification + push), and push the player too
  const coachTitle = `🔥 ${me.full_name} hit a ${days}-day perfect streak`
  const coachBody = `Every daily point for ${days} days in a row. A congrats message was sent to ${first}.`
  if (coachList.length) {
    await admin.from('notifications').insert(coachList.map((c) => ({ profile_id: c.id, kind: 'streak', title: coachTitle, body: coachBody, url: '/' })))
  }
  const targets = [
    ...coachList.map((c) => ({ id: c.id, title: coachTitle, body: coachBody, url: '/' })),
    { id: user.id, title: '🏆 Congratulations!', body: `${days}-day perfect-points streak complete. Check your messages.`, url: '/messages' },
  ]
  for (const t of targets) {
    const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('profile_id', t.id)
    await Promise.allSettled(
      (subs || []).map(async (sub) => {
        const status = await sendWebPush(sub, { title: t.title, body: t.body, url: t.url, tag: `streak-${user.id}-${days}` })
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', sub.id)
      })
    )
  }

  return Response.json({ ok: true, awarded: true, days, streak: s.streak })
}
