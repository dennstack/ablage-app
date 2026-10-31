import { useCallback, useEffect, useRef, useState } from 'react'
import type { Category } from '@shared/types'
import { api, errorMessage, onEvent } from './api'

/** Loads async data and reloads on `deps` change and on document change events. */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = [], liveReload = true) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current())
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (!liveReload) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = onEvent('documents:changed', () => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), 150)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [reload, liveReload])

  return { data, error, loading, reload, setData }
}

let categoryCache: Promise<Category[]> | null = null

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  useEffect(() => {
    categoryCache ??= api['categories:list']()
    void categoryCache.then(setCategories)
  }, [])
  const label = useCallback(
    (id: string) => {
      for (const c of categories) {
        if (c.id === id) return c.label
        const sub = c.subcategories?.find((s) => s.id === id)
        if (sub) return `${c.label} › ${sub.label}`
      }
      return id === 'sonstiges' ? 'Sonstiges' : id
    },
    [categories]
  )
  return { categories, label }
}

export function invalidateCategories(): void {
  categoryCache = null
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
