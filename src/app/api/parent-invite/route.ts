import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/server-auth'

const PUBLISHABLE = 'sb_publishable_oZ2LGTvtC4RT0ThclPshKw_cjTdvwwg'
const MAX_PARENTS = 2

/**
 * Accept a parent invite link. New parents get an account with the email and password they typed;
 * a parent who already has an account (a second child) proves it with their password and is linked.
 */
export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return Response.json({ error: 'Server setup incomplete.' }, { status: 500 })
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const token = String(body.token || '')
  const name = String(body.name || '').trim().slice(0, 80)
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120)
  const password = String(body.password || '')
  const relationship = ['Mother', 'Father', 'Guardian'].includes(String(body.relationship)) ? String(body.relationship) : 'Guardian'
  if (!/^[a-f0-9]{20,64}$/.test(token)) return Response.json({ error: 'This invite link is not valid.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (password.length < 8 || password.length > 72) return Response.json({ error: 'Password needs at least 8 characters.' }, { status: 400 })
  if (email.endsWith('@generalsbaseball.org')) return Response.json({ error: 'Use your personal email address.' }, { status: 400 })

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: invite } = await admin.from('parent_invites').select('player_id, expires_at, revoked').eq('token', token).maybeSingle()
  if (!invite || invite.revoked || new Date(invite.expires_at) < new Date()) return Response.json({ error: 'This invite link has expired. Ask for a new one.' }, { status: 410 })
  const { data: player } = await admin.from('profiles').select('id, full_name, role, is_active').eq('id', invite.player_id).single()
  if (!player || player.role !== 'player' || !player.is_active) return Response.json({ error: 'This invite link is not valid.' }, { status: 410 })
  const { data: links } = await admin.from('player_guardians').select('guardian_id').eq('player_id', player.id)
  const linked = new Set((links || []).map((l) => l.guardian_id as string))

  // Existing account with this email? Then the password must match, and it must be a parent account.
  let parentId: string | null = null
  const anon = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signedIn } = await anon.auth.signInWithPassword({ email, password })
  if (signedIn?.user) {
    const { data: prof } = await admin.from('profiles').select('role, is_active').eq('id', signedIn.user.id).single()
    if (!prof || prof.role !== 'parent' || !prof.is_active) return Response.json({ error: 'That email belongs to a player or coach account. Use a different email.' }, { status: 409 })
    parentId = signedIn.user.id
    if (linked.has(parentId)) return Response.json({ ok: true, email, already: true })
  }
  if (linked.size >= MAX_PARENTS) return Response.json({ error: `${player.full_name.split(' ')[0]} already has ${MAX_PARENTS} parents connected. A coach can remove one.` }, { status: 409 })

  if (!parentId) {
    if (name.length < 2) return Response.json({ error: 'Enter your name.' }, { status: 400 })
    const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (ce || !created?.user) {
      const exists = /already|registered|exists/i.test(ce?.message || '')
      return Response.json({ error: exists ? 'That email already has an account. Enter its password to link this player.' : ce?.message || 'Could not create the account.' }, { status: exists ? 409 : 500 })
    }
    parentId = created.user.id
    const base = email.split('@')[0].replace(/[^a-z0-9._]/g, '').slice(0, 24) || 'parent'
    let username = `p.${base}`
    for (let i = 2; ; i++) {
      const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (!taken) break
      username = `p.${base}${i}`
    }
    const { error: pe } = await admin.from('profiles').insert({ id: parentId, username, full_name: name, role: 'parent', is_active: true, has_login: true, contact_email: email })
    if (pe) {
      await admin.auth.admin.deleteUser(parentId)
      return Response.json({ error: pe.message }, { status: 500 })
    }
  }
  const { error: le } = await admin.from('player_guardians').insert({ guardian_id: parentId, player_id: player.id, relationship })
  if (le) return Response.json({ error: le.message }, { status: 500 })
  return Response.json({ ok: true, email })
}
