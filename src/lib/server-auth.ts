import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://nyttsmwrvnuehqdvtmyj.supabase.co'

type CoachCheck =
  | { ok: true; admin: SupabaseClient; userId: string }
  | { ok: false; response: Response }

/** Verifies the request comes from an active coach and returns a service-role client. */
export async function requireCoach(req: Request): Promise<CoachCheck> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return { ok: false, response: Response.json({ error: 'Server setup incomplete: SUPABASE_SERVICE_ROLE_KEY is missing.' }, { status: 500 }) }
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, response: Response.json({ error: 'Not signed in' }, { status: 401 }) }

  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data } = await admin.auth.getUser(token)
  const user = data?.user
  if (!user) return { ok: false, response: Response.json({ error: 'Not signed in' }, { status: 401 }) }

  const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', user.id).single()
  if (!me || me.role !== 'coach' || !me.is_active) {
    return { ok: false, response: Response.json({ error: 'Coaches only' }, { status: 403 }) }
  }
  return { ok: true, admin, userId: user.id }
}
