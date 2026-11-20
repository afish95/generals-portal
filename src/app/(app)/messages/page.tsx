'use client'

import { useState } from 'react'
import { useProfile } from '@/components/shell/AppShell'
import { PageTitle } from '@/components/ui'
import AnnouncementComposer from '@/components/AnnouncementComposer'
import AnnouncementsFeed from '@/components/AnnouncementsFeed'

export default function MessagesPage() {
  const { isCoach } = useProfile()
  const [version, setVersion] = useState(0)
  return (
    <div className="space-y-4">
      <PageTitle title="Messages" subtitle="Team announcements. Group and 1:1 chats are coming in Phase 3." />
      {isCoach && <AnnouncementComposer onSent={() => setVersion((v) => v + 1)} />}
      <AnnouncementsFeed limit={30} refreshKey={version} />
    </div>
  )
}
