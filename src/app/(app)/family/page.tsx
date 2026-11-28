'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/components/shell/AppShell'
import MyPlayer from '@/components/parent/MyPlayer'

export default function FamilyPage() {
  const { isParent } = useProfile()
  const router = useRouter()
  useEffect(() => {
    if (!isParent) router.replace('/')
  }, [isParent, router])
  return isParent ? <MyPlayer /> : null
}
