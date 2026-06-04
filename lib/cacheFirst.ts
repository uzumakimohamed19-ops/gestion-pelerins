'use client'

import { get, set } from 'idb-keyval'

type CacheFirstFetchOptions<T> = {
  cacheKey: string
  fetchRemote: () => Promise<T | undefined>
  onCache: (data: T) => void
  onRemote: (data: T) => void
  setLoading?: (value: boolean) => void
  setBackgroundUpdating?: (value: boolean) => void
  compare?: (current: T, next: T) => boolean
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
  } = options

  if (setLoading) setLoading(true)

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
      const remote = await fetchRemote()
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
    const remote = await fetchRemote()
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
