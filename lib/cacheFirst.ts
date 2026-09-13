'use client'

import { get, set } from 'idb-keyval'
import { Capacitor } from '@capacitor/core'

type CacheFirstFetchOptions<T> = {
  cacheKey: string
  fetchRemote: () => Promise<T | undefined>
  onCache: (data: T) => void
  onRemote: (data: T) => void
  setLoading?: (value: boolean) => void
  setBackgroundUpdating?: (value: boolean) => void
  compare?: (current: T, next: T) => boolean
  timeoutMs?: number
}

const fetchWithTimeout = async <T,>(
  request: () => Promise<T | undefined>,
  timeoutMs = 20000,
): Promise<T | undefined> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      request(),
      new Promise<undefined>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('FETCH_TIMEOUT')), timeoutMs)
      }),
    ])
  } catch (error) {
    console.warn('CacheFirst fetch timeout or failure:', error)
    return undefined
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function cacheFirstFetch<T>(options: CacheFirstFetchOptions<T>) {
  const {
    cacheKey,
    fetchRemote,
    onCache,
    onRemote,
    setLoading,
    setBackgroundUpdating,
    compare,
    timeoutMs = 20000,
  } = options

  if (setLoading) setLoading(true)

  const isNativeMobile = Capacitor.isNativePlatform()

  if (isNativeMobile) {
    try {
      const remote = await fetchWithTimeout(fetchRemote, timeoutMs)
      if (remote !== undefined && remote !== null) {
        onRemote(remote)
        try { await set(cacheKey, remote) } catch (err) { console.warn('Cache write failed on native mobile:', err) }
      }
    } catch (err) {
      console.error('Remote fetch failed on native mobile:', err)
    } finally {
      if (setLoading) setLoading(false)
      if (setBackgroundUpdating) setBackgroundUpdating(false)
    }
    return
  }

  let cached: T | undefined
  try {
    cached = await get<T>(cacheKey)
  } catch (err) {
    console.error('Cache read failed:', err)
  }

  if (cached !== undefined && cached !== null) {
    onCache(cached)
    if (setLoading) setLoading(false)
    if (setBackgroundUpdating) setBackgroundUpdating(true)

    try {
      const remote = await fetchWithTimeout(fetchRemote, timeoutMs)
      if (remote !== undefined && remote !== null) {
        const shouldUpdate = compare
          ? compare(cached, remote)
          : JSON.stringify(cached) !== JSON.stringify(remote)

        if (shouldUpdate) {
          onRemote(remote)
        }
        await set(cacheKey, remote)
      }
    } catch (err) {
      console.error('Background fetch failed:', err)
    } finally {
      if (setBackgroundUpdating) setBackgroundUpdating(false)
    }

    return
  }

  try {
    const remote = await fetchWithTimeout(fetchRemote, timeoutMs)
    if (remote !== undefined && remote !== null) {
      onRemote(remote)
      await set(cacheKey, remote)
    }
  } catch (err) {
    console.error('Remote fetch failed:', err)
  } finally {
    if (setLoading) setLoading(false)
  }
}
