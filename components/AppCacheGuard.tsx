'use client'

import { useEffect } from 'react'
import { invalidateAppCacheOnUpdate } from '@/lib/appCache'

export default function AppCacheGuard() {
  useEffect(() => {
    void invalidateAppCacheOnUpdate()
  }, [])

  return null
}
