import crypto from 'node:crypto'
import { requireCoach } from '@/lib/server-auth'

const EMAIL_DOMAIN = 'generalsbaseball.org'
const POSITIONS = ['pitcher', 'catcher', 'infield', 'outfield', 'two_way', 'hitter', 'coach']
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

function tempPassword() {
  const words = ['Fastball', 'Slider', 'Dugout', 'Bullpen', 'Homerun', 'Diamond', 'Curveball', 'Walkoff', 'Changeup', 'Infield']
  return `${words[crypto.randomInt(words.length)]}-${crypto.randomInt(1000, 9999)}`
}

function cleanUsername(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30)
}

// POST: create a player login, reset a password, or activate/deactivate.
export async function POST(req: Request) {
  const auth = await requireCoach(req)
  if (!auth.ok) return auth.response
  const { admin } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const action = String(body.action || '')

  if (action === 'create') {
    const full_name = String(body.full_name || '').trim().slice(0, 80)
    const username = cleanUsername(String(body.username || ''))
    const position_group = POSITIONS.includes(String(body.position_group)) ? String(body.position_group) : 'two_way'
    const gradRaw = Number(body.grad_year)
    const grad_year = Number.isInteger(gradRaw) && gradRaw > 2000 && gradRaw < 2100 ? gradRaw : null
    if (!full_name) return Response.json({ error: 'Enter the player’s name' }, { status: 400 })
    if (username.length < 3) return Response.json({ error: 'Username needs at least 3 letters or numbers' }, { status: 400 })

    const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
    if (taken) return Response.json({ error: 'That username is taken. Try another.' }, { status: 409 })

    const withLogin = body.with_login !== false
    const role = body.role === 'coach' ? 'coach' : 'player'
    const password = withLogin ? tempPassword() : undefined
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `${username}@${EMAIL_DOMAIN}`,
      ...(password ? { password } : {}),
      email_confirm: true,
    })
    if (createErr || !created.user) {
      return Response.json({ error: createErr?.message || 'Could not create login' }, { status: 500 })
    }
    const { error: profErr } = await admin.from('profiles').insert({
      id: created.user.id,
      username,
      full_name,
      position_group,
      grad_year: role === 'coach' ? null : grad_year,
      role,
      is_active: true,
      has_login: withLogin,
      contact_email: String(body.contact_email || '').trim().toLowerCase().slice(0, 120) || null,
    })
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      return Response.json({ error: profErr.message }, { status: 500 })
    }
    const groupIds = Array.isArray(body.group_ids) ? body.group_ids.map(Number).filter(Number.isInteger) : []
    if (groupIds.length) {
      await admin.from('group_members').insert(groupIds.map((group_id: number) => ({ group_id, athlete_id: created.user!.id })))
    }
    return Response.json({ ok: true, id: created.user.id, username, password: password ?? null })
  }

  const id = String(body.id || '')
  if (!id) return Response.json({ error: 'Missing player' }, { status: 400 })
  const { data: target } = await admin.from('profiles').select('role, username, has_login').eq('id', id).single()
  if (!target || (target.role !== 'player' && target.role !== 'coach')) return Response.json({ error: 'Person not found' }, { status: 404 })
  if (target.role === 'coach' && id === auth.userId && action !== 'update') return Response.json({ error: 'Use your own account settings for that' }, { status: 400 })

  // Give someone who is on the roster (no login yet) a username and a temporary password
  if (action === 'create_login') {
    const username = body.username ? cleanUsername(String(body.username)) : target.username
    if (username.length < 3) return Response.json({ error: 'Username needs at least 3 letters or numbers' }, { status: 400 })
    if (username !== target.username) {
      const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (taken) return Response.json({ error: 'That username is taken. Try another.' }, { status: 409 })
    }
    const password = tempPassword()
    const { error } = await admin.auth.admin.updateUserById(id, { email: `${username}@${EMAIL_DOMAIN}`, email_confirm: true, password })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    await admin.from('profiles').update({ username, has_login: true }).eq('id', id)
    return Response.json({ ok: true, username, password })
  }

  if (action === 'reset_password') {
    if (target.has_login === false) return Response.json({ error: 'No login yet. Use Create login.' }, { status: 400 })
    const password = tempPassword()
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true, password })
  }

  if (action === 'set_active') {
    const { error } = await admin.from('profiles').update({ is_active: body.is_active === true }).eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === 'update') {
    const patch: Record<string, unknown> = {}
    if (typeof body.full_name === 'string' && body.full_name.trim()) patch.full_name = body.full_name.trim().slice(0, 80)
    if (POSITIONS.includes(String(body.position_group))) patch.position_group = String(body.position_group)
    if (body.grad_year === null) patch.grad_year = null
    else if (Number.isInteger(Number(body.grad_year)) && Number(body.grad_year) > 2000) patch.grad_year = Number(body.grad_year)
    if ('contact_email' in body) patch.contact_email = String(body.contact_email || '').trim().toLowerCase().slice(0, 120) || null
    if ('roster_note' in body) patch.roster_note = String(body.roster_note || '').trim().slice(0, 300) || null
    for (const k of ['top_size', 'bottom_size'] as const) {
      if (k in body) patch[k] = SIZES.includes(String(body[k]).toUpperCase()) ? String(body[k]).toUpperCase() : null
    }
    if (Object.keys(patch).length === 0) return Response.json({ ok: true })
    const { error } = await admin.from('profiles').update(patch).eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE: permanently removes the player's login and all of their records.
export async function DELETE(req: Request) {
  const auth = await requireCoach(req)
  if (!auth.ok) return auth.response
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return Response.json({ error: 'Missing player' }, { status: 400 })
  if (id === auth.userId) return Response.json({ error: 'You can’t delete your own account here' }, { status: 400 })
  const { data: target } = await auth.admin.from('profiles').select('role').eq('id', id).single()
  if (!target || (target.role !== 'player' && target.role !== 'coach')) return Response.json({ error: 'Person not found' }, { status: 404 })
  const { error } = await auth.admin.auth.admin.deleteUser(id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
