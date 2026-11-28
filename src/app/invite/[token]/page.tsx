import { Suspense } from 'react'
import InviteForm from './InviteForm'

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <InviteForm />
    </Suspense>
  )
}
