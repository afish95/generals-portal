import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/server-auth'
import { sendWebPush } from '@/lib/webpush'

// Thursday 3:30 PM (Portland) reminder to log body weight. Called by a Supabase scheduled job
// at both 22:30 and 23:30 UTC; only the call that lands at 3 PM Pacific sends (handles daylight saving).
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return Response.json({ error: 'Missing service key' }, { status: 500 })

  const now = new Date()
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  )
  const force = new URL(req.url).searchParams.get('force') === '1'
  if (!force && (parts.weekday !== 'Thu' || Number(parts.hour) !== 15)) return Response.json({ ok: true, skipped: 'not 3 PM Thursday in Portland' })

  const today = `${parts.year}-${parts.month}-${parts.day}`
  const d = new Date(`${today}T12:00:00Z`)
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10)

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [{ data: players }, { data: logged }] = await Promise.all([
    admin.from('profiles').select('id').eq('role', 'player').eq('is_active', true).eq('has_login', true),
    admin.from('body_weights').select('athlete_id').gte('measured_on', monday),
  ])
  const done = new Set((logged || []).map((r) => r.athlete_id as string))
  const ids = (players || []).map((p) => p.id as string).filter((id) => !done.has(id))
  if (!ids.length) return Response.json({ ok: true, recipients: 0 })

  const title = 'Weekly weigh-in'
  const body = 'Log your body weight for this week.'
  await admin.from('notifications').insert(ids.map((profile_id) => ({ profile_id, kind: 'reminder', title, body, url: '/' })))
  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('profile_id', ids)
  const results = await Promise.allSettled(
    (subs || []).map(async (s) => {
      const status = await sendWebPush(s, { title, body, url: '/', tag: `weigh-in-${today}` })
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
      if (status >= 400) throw new Error(`push ${status}`)
    })
  )
  return Response.json({ ok: true, recipients: ids.length, pushed: results.filter((r) => r.status === 'fulfilled').length })
}
