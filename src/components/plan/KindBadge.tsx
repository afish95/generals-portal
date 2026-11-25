import { KIND_LABEL, KIND_STYLE } from '@/lib/focus'

/** Small "Pitching" / "Hitting" tag. */
export default function KindBadge({ kind, className = '' }: { kind: 'pitcher' | 'hitter' | null; className?: string }) {
  if (!kind) return null
  return <span className={`text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded ${KIND_STYLE[kind]} ${className}`}>{KIND_LABEL[kind]}</span>
}
