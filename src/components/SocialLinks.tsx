/** Program social accounts, shown on everyone's Other tab. */
const LINKS = [
  {
    label: 'X (Twitter)',
    handle: '@grantbsb',
    href: 'https://x.com/grantbsb',
    bg: 'bg-black',
    icon: <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />,
  },
  {
    label: 'Instagram',
    handle: '@grantbsb',
    href: 'https://www.instagram.com/grantbsb/',
    bg: 'bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]',
    icon: <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13a5.88 5.88 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z" />,
  },
  {
    label: 'Facebook',
    handle: 'Grant Generals Baseball',
    href: 'https://www.facebook.com/GrantBSB',
    bg: 'bg-[#1877f2]',
    icon: <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07Z" />,
  },
]

export default function SocialLinks() {
  return (
    <section className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
      <div className="text-sm font-extrabold text-slate-900">Follow Generals Baseball</div>
      <div className="grid grid-cols-3 gap-2">
        {LINKS.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noreferrer" aria-label={`${l.label}: ${l.handle}`} className="flex flex-col items-center gap-1.5 py-2 rounded-2xl hover:bg-slate-50">
            <span className={`w-12 h-12 rounded-2xl ${l.bg} text-white flex items-center justify-center shadow-sm`}>
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden>{l.icon}</svg>
            </span>
            <span className="text-[11px] font-extrabold text-slate-800">{l.label === 'X (Twitter)' ? 'X' : l.label}</span>
            <span className="text-[10px] font-semibold text-slate-500 text-center leading-tight">{l.handle}</span>
          </a>
        ))}
      </div>
    </section>
  )
}
