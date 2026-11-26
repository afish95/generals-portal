'use client'

/** ▲ green when a stat improved, ▼ red when it slipped. `lowerIsBetter` flips it for times, ERA, miss distance… */
export default function Trend({ delta, lowerIsBetter = false, digits = 1, unit = '', className = '', dark = false }: { delta: number | null | undefined; lowerIsBetter?: boolean; digits?: number; unit?: string; className?: string; dark?: boolean }) {
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 10 ** -digits / 2) return null
  const better = lowerIsBetter ? delta < 0 : delta > 0
  const color = better ? (dark ? 'text-green-300' : 'text-emerald-600') : dark ? 'text-red-300' : 'text-red-600'
  return (
    <span className={`inline-flex items-center gap-0.5 font-black tabular-nums ${color} ${className}`} title={better ? 'Improving' : 'Down from last time'}>
      <span className="text-[0.8em] leading-none">{delta > 0 ? '▲' : '▼'}</span>
      {Math.abs(delta).toFixed(digits)}
      {unit}
    </span>
  )
}
