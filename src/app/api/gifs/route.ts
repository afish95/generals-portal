// GET /api/gifs?q=…&offset=…  GIPHY search (or trending when q is empty), PG-rated, key kept on the server.
export async function GET(req: Request) {
  if (!req.headers.get('authorization')) return Response.json({ error: 'Not signed in' }, { status: 401 })
  const key = process.env.GIPHY_API_KEY
  if (!key) return Response.json({ error: 'GIFs aren’t set up yet.' }, { status: 503 })
  const u = new URL(req.url)
  const q = (u.searchParams.get('q') || '').trim().slice(0, 50)
  const offset = Math.max(0, Math.min(500, Number(u.searchParams.get('offset')) || 0))
  const api = new URL(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}`)
  api.searchParams.set('api_key', key)
  api.searchParams.set('limit', '24')
  api.searchParams.set('offset', String(offset))
  api.searchParams.set('rating', 'pg')
  if (q) api.searchParams.set('q', q)
  const res = await fetch(api, { cache: 'no-store' })
  if (!res.ok) return Response.json({ error: 'GIF search failed' }, { status: 502 })
  const json = (await res.json()) as { data: { id: string; title: string; images: Record<string, { url: string; width: string; height: string }> }[] }
  const gifs = json.data
    .map((g) => {
      const full = g.images.downsized_medium || g.images.downsized || g.images.original
      const thumb = g.images.fixed_width_small || g.images.fixed_width || full
      return full && thumb ? { id: g.id, title: g.title, url: full.url, thumb: thumb.url, w: Number(full.width), h: Number(full.height) } : null
    })
    .filter(Boolean)
  return Response.json({ gifs })
}
