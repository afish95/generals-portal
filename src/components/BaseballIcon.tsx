/** Baseball (ball with seams), drawn like a lucide icon. Used for baseball workouts; lifts use the dumbbell. */
export default function BaseballIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M5.6 4.3a10 10 0 0 1 0 15.4" />
      <path d="M18.4 4.3a10 10 0 0 0 0 15.4" />
      <path d="M4.2 8.5h2.4M4.8 12h2.4M4.2 15.5h2.4M17.4 8.5h2.4M16.8 12h2.4M17.4 15.5h2.4" />
    </svg>
  )
}
