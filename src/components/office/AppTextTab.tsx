'use client'

import { useEffect, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { APP_TEXT, refreshAppText, type TextKey } from '@/lib/appText'

/** Coach Office → App Text: change the default wording players see, grouped by screen. Blank = default. */
export default function AppTextTab() {
  const [values, setValues] = useState<Map<string, string> | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    createClient()
      .from('app_text')
      .select('key, value')
      .then(({ data }) => setValues(new Map(((data as { key: string; value: string }[]) || []).map((r) => [r.key, r.value]))))
  }, [])

  const save = async (key: TextKey, raw: string) => {
    const v = raw.trim()
    const def = APP_TEXT[key].text
    const sb = createClient()
    const { error: e } = !v || v === def ? await sb.from('app_text').delete().eq('key', key) : await sb.from('app_text').upsert({ key, value: v, updated_at: new Date().toISOString() })
    if (e) return setError(e.message)
    setError(null)
    setValues((m) => {
      const n = new Map(m || [])
      if (!v || v === def) n.delete(key)
      else n.set(key, v)
      return n
    })
    setSaved(key)
    setTimeout(() => setSaved((s) => (s === key ? null : s)), 1500)
    refreshAppText()
  }

  const keys = Object.keys(APP_TEXT) as TextKey[]
  const screens = [...new Set(keys.map((k) => APP_TEXT[k].screen))]

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-500 px-1">Change any wording below. It saves when you tap away and shows for everyone right away. Clear a box (or tap reset) to go back to the original.</p>
      {values === null ? (
        <div className="h-40 rounded-3xl bg-white/60 animate-pulse" />
      ) : (
        screens.map((screen) => (
          <section key={screen} className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{screen}</div>
            <div className="divide-y divide-slate-100">
              {keys
                .filter((k) => APP_TEXT[k].screen === screen)
                .map((k) => {
                  const custom = values.get(k)
                  return (
                    <div key={k} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-800">{APP_TEXT[k].label}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {saved === k && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                          {custom && (
                            <button type="button" onClick={() => save(k, '')} className="flex items-center gap-1 text-[10px] font-extrabold text-slate-400 hover:text-[#1746b8] cursor-pointer">
                              <RotateCcw className="w-3 h-3" /> Reset
                            </button>
                          )}
                        </span>
                      </div>
                      <textarea
                        key={`${k}-${custom ?? 'default'}`}
                        defaultValue={custom ?? APP_TEXT[k].text}
                        rows={APP_TEXT[k].text.length > 60 ? 2 : 1}
                        onBlur={(e) => e.target.value.trim() !== (custom ?? APP_TEXT[k].text) && save(k, e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${custom ? 'border-[#1746b8] bg-blue-50/40' : 'border-slate-200 bg-white'} text-slate-900`}
                      />
                      {custom && <p className="text-[10px] font-semibold text-slate-400">Original: {APP_TEXT[k].text}</p>}
                    </div>
                  )
                })}
            </div>
          </section>
        ))
      )}
      {error && <p className="text-xs font-bold text-red-600">{error}</p>}
    </div>
  )
}
