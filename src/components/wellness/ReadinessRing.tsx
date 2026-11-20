export default function ReadinessRing({ score, color, size = 80 }: { score: number | null; color: string; size?: number }) {
  const radius = 32
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, score ?? 0)) / 100) * circumference
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" style={{ width: size, height: size }} viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="transparent" stroke="#e2e8f0" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-xl font-black text-slate-900">{score ?? '–'}</span>
        <span className="text-[10px] font-bold text-slate-400 mt-0.5">/100</span>
      </div>
    </div>
  )
}
