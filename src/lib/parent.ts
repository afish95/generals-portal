import { minutesOf, type ScheduleEvent } from '@/lib/schedule'

export const directionsUrl = (location: string) => `https://maps.google.com/?q=${encodeURIComponent(location)}`

const stamp = (date: string, mins: number) => {
  const h = String(Math.floor(mins / 60)).padStart(2, '0')
  const m = String(mins % 60).padStart(2, '0')
  return `${date.replace(/-/g, '')}T${h}${m}00`
}
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')

/** Download a calendar file for one event so it opens in Apple / Google / Outlook calendar. */
export function addToCalendar(e: ScheduleEvent) {
  const start = minutesOf(e.start_time)
  const end = minutesOf(e.end_time) ?? (start != null ? start + 120 : null)
  const nextDay = (() => {
    const [y, m, d] = e.event_date.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '')
  })()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Generals Baseball//EN',
    'BEGIN:VEVENT',
    `UID:generals-${e.id}@generalsbaseball.org`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    start != null ? `DTSTART:${stamp(e.event_date, start)}` : `DTSTART;VALUE=DATE:${e.event_date.replace(/-/g, '')}`,
    start != null ? `DTEND:${stamp(e.event_date, end!)}` : `DTEND;VALUE=DATE:${nextDay}`,
    `SUMMARY:${esc(`Generals: ${e.title}`)}`,
    e.location ? `LOCATION:${esc(e.location)}` : '',
    e.notes ? `DESCRIPTION:${esc(e.notes)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${e.title.replace(/[^\w ]+/g, '').trim() || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Share or copy an invite link (phone share sheet when available). */
export async function shareInvite(url: string, first: string): Promise<'shared' | 'copied' | 'failed'> {
  const text = `Join Generals Baseball as ${first}’s parent: see the schedule, game stats and progress, and message coaches.`
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Generals Baseball Parent Invite', text, url })
      return 'shared'
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return 'failed'
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
