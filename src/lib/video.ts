// Turn a drill's video link into something that plays inside the app when the host allows it.

export type VideoInfo =
  | { kind: 'iframe'; src: string; host: string }
  | { kind: 'file'; src: string }
  | { kind: 'link'; href: string; host: string }

export function parseVideo(raw: string | null | undefined): VideoInfo | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  // YouTube: watch?v=, youtu.be/, shorts/, embed/
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    let id = u.searchParams.get('v') || ''
    if (!id && host === 'youtu.be') id = u.pathname.slice(1)
    if (!id) id = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/)?.[2] || ''
    const t = u.searchParams.get('t') || u.searchParams.get('start')
    const start = t ? `&start=${parseInt(t, 10) || 0}` : ''
    if (id) return { kind: 'iframe', host: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1${start}` }
  }
  // Vimeo: vimeo.com/123 or vimeo.com/123/hash (private link)
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:video\/)?(\d{5,})(?:\/([0-9a-f]{6,}))?/)
    if (m) {
      const h = m[2] || u.searchParams.get('h')
      return { kind: 'iframe', host: 'Vimeo', src: `https://player.vimeo.com/video/${m[1]}?${h ? `h=${h}&` : ''}title=0&byline=0&portrait=0&playsinline=1` }
    }
  }
  // Google Drive file
  if (host === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get('id')
    if (id) return { kind: 'iframe', host: 'Google Drive', src: `https://drive.google.com/file/d/${id}/preview` }
  }
  // A video file (our own uploads, or any direct .mp4/.mov/.webm link)
  if (/\.(mp4|m4v|mov|webm)$/i.test(u.pathname)) return { kind: 'file', src: u.toString() }
  const label = host.includes('instagram') ? 'Instagram' : host.includes('tiktok') ? 'TikTok' : host.includes('hudl') ? 'Hudl' : host
  return { kind: 'link', href: u.toString(), host: label }
}
