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

  // Bulk roster import: add people (no login) and update existing ones in one go.
  if (action === 'bulk') {
    const creates = Array.isArray(body.creates) ? (body.creates as Record<string, unknown>[]).slice(0, 300) : []
    const updates = Array.isArray(body.updates) ? (body.updates as Record<string, unknown>[]).slice(0, 500) : []
    const created: Record<string, string> = {}
    const errors: string[] = []
    const cleanSize = (v: unknown) => (SIZES.includes(String(v || '').toUpperCase()) ? String(v).toUpperCase() : null)
    const cleanGrad = (v: unknown) => {
      const n = Number(v)
      return Number.isInteger(n) && n > 2000 && n < 2100 ? n : null
    }
    const { data: existing } = await admin.from('profiles').select('username')
    const taken = new Set((existing || []).map((r) => r.username as string))

    for (const c of creates) {
      const full_name = String(c.full_name || '').trim().slice(0, 80)
      if (!full_name) continue
      const role = c.role === 'coach' ? 'coach' : 'player'
      let base = cleanUsername(String(c.username || '')) || cleanUsername(full_name.replace(/\s+/g, '.'))
      if (base.length < 3) base = `${base}user`
      let username = base
      for (let i = 2; taken.has(username); i++) username = `${base}${i}`
      taken.add(username)
      const { data: u, error: ue } = await admin.auth.admin.createUser({ email: `${username}@${EMAIL_DOMAIN}`, email_confirm: true })
      if (ue || !u.user) {
        errors.push(`${full_name}: ${ue?.message || 'could not create'}`)
        continue
      }
      const { error: pe } = await admin.from('profiles').insert({
        id: u.user.id,
        username,
        full_name,
        role,
        position_group: role === 'coach' ? 'coach' : POSITIONS.includes(String(c.position_group)) ? String(c.position_group) : 'two_way',
        grad_year: role === 'coach' ? null : cleanGrad(c.grad_year),
        is_active: true,
        has_login: false,
        contact_email: String(c.contact_email || '').trim().toLowerCase().slice(0, 120) || null,
        top_size: cleanSize(c.top_size),
        bottom_size: cleanSize(c.bottom_size),
      })
      if (pe) {
        await admin.auth.admin.deleteUser(u.user.id)
        errors.push(`${full_name}: ${pe.message}`)
        continue
      }
      created[String(c.key ?? username)] = u.user.id
    }

    for (const u of updates) {
      const id = String(u.id || '')
      if (!id) continue
      const patch: Record<string, unknown> = {}
      if (typeof u.full_name === 'string' && u.full_name.trim()) patch.full_name = u.full_name.trim().slice(0, 80)
      if ('grad_year' in u) patch.grad_year = cleanGrad(u.grad_year)
      if (POSITIONS.includes(String(u.position_group))) patch.position_group = String(u.position_group)
      if ('contact_email' in u) patch.contact_email = String(u.contact_email || '').trim().toLowerCase().slice(0, 120) || null
      if ('top_size' in u) patch.top_size = cleanSize(u.top_size)
      if ('bottom_size' in u) patch.bottom_size = cleanSize(u.bottom_size)
      if (typeof u.is_active === 'boolean' && id !== auth.userId) patch.is_active = u.is_active
      if (!Object.keys(patch).length) continue
      const { error: e } = await admin.from('profiles').update(patch).eq('id', id).in('role', ['player', 'coach'])
      if (e) errors.push(`${String(u.full_name || id)}: ${e.message}`)
    }
    return Response.json({ ok: true, created, errors })
  }

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

  // Disconnect a parent from a player. A parent left with no players loses their account.
  if (action === 'remove_parent') {
    const parentId = String(body.id || '')
    const playerId = String(body.player_id || '')
    const { data: parent } = await admin.from('profiles').select('role').eq('id', parentId).single()
    if (!parent || parent.role !== 'parent') return Response.json({ error: 'Parent not found' }, { status: 404 })
    await admin.from('player_guardians').delete().eq('guardian_id', parentId).eq('player_id', playerId)
    const { count } = await admin.from('player_guardians').select('player_id', { count: 'exact', head: true }).eq('guardian_id', parentId)
    if (!count) await admin.auth.admin.deleteUser(parentId)
    return Response.json({ ok: true, deleted: !count })
  }

  const id = String(body.id || '')
  if (!id) return Response.json({ error: 'Missing player' }, { status: 400 })
  const { data: target } = await admin.from('profiles').select('role, username, has_login').eq('id', id).single()
  if (!target || !['player', 'coach', 'parent'].includes(target.role)) return Response.json({ error: 'Person not found' }, { status: 404 })
  // Parent accounts: coaches can reset the password and turn access off or on; nothing else.
  if (target.role === 'parent' && !['reset_password', 'set_active'].includes(action)) return Response.json({ error: 'Not available for parent accounts' }, { status: 400 })
  if (target.role === 'coach' && id === auth.userId && action !== 'update') return Response.json({ error: 'Use your own account settings for that' }, { status: 400 })

  // Give someone who is on the roster (no login yet) a username and a temporary password
  if (action === 'create_login') {
    const username = body.username ? cleanUsername(String(body.username)) : target.username
    if (username.length < 3) return Response.json({ error: 'Username needs at least 3 letters or numbers' }, { status: 400 })
    if (username !== target.username) {
      const { data: taken } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (taken) return Response.json({ error: 'That username is taken. Try another.' }, { status: 409 })
    }
    const chosen = typeof body.password === 'string' ? body.password : ''
    if (chosen && (chosen.length < 6 || chosen.length > 72)) return Response.json({ error: 'Password needs 6–72 characters' }, { status: 400 })
    const password = chosen || tempPassword()
    const { error } = await admin.auth.admin.updateUserById(id, { email: `${username}@${EMAIL_DOMAIN}`, email_confirm: true, password })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    await admin.from('profiles').update({ username, has_login: true }).eq('id', id)
    return Response.json({ ok: true, username, password })
  }

  if (action === 'reset_password') {
    if (target.has_login === false) return Response.json({ error: 'No login yet. Use Create login.' }, { status: 400 })
    const chosen = typeof body.password === 'string' ? body.password : ''
    if (chosen && (chosen.length < 6 || chosen.length > 72)) return Response.json({ error: 'Password needs 6–72 characters' }, { status: 400 })
    const password = chosen || tempPassword()
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
  if (!target || !['player', 'coach', 'parent'].includes(target.role)) return Response.json({ error: 'Person not found' }, { status: 404 })
  const { error } = await auth.admin.auth.admin.deleteUser(id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
