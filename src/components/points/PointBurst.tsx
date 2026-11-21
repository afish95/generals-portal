'use client'

/** The shared "+1 point" animation: a gold bubble that floats up and fades. Place inside a `relative` parent. */
export function PointBubble({ amount, className = '-top-2' }: { amount: number; className?: string }) {
  if (amount <= 0) return null
  return (
    <span
      className={`pointer-events-none absolute left-1/2 z-10 whitespace-nowrap rounded-full bg-amber-400 text-white text-[10px] font-black px-2 py-0.5 shadow animate-gen-float ${className}`}
    >
      +{amount} point{amount === 1 ? '' : 's'}
    </span>
  )
}

/** The green circle that pops and shows "+N" before settling into its normal content. */
export function PopCircle({
  amount,
  size = 'w-10 h-10',
  children,
}: {
  amount: number
  size?: string
  children: React.ReactNode
}) {
  return (
    <span className="relative inline-flex">
      <span
        key={amount > 0 ? 'pop' : 'still'}
        className={`${size} rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-md shadow-emerald-500/30 ${amount > 0 ? 'animate-gen-pop' : ''}`}
      >
        {amount > 0 ? <span className="text-sm font-black leading-none">+{amount}</span> : children}
      </span>
      <PointBubble amount={amount} />
    </span>
  )
}

/** Short buzz on phones that support it. */
export function buzz() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(40)
}
