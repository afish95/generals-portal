import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nyttsmwrvnuehqdvtmyj.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_oZ2LGTvtC4RT0ThclPshKw_cjTdvwwg'
  return createBrowserClient(url, key)
}
