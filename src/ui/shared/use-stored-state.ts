import { useEffect, useState } from 'react'

/**
 * `useState` that remembers its value in localStorage. Storage can be missing or blocked
 * (private mode), so every access is guarded and the app behaves the same without it.
 * `isValid` rejects stale or tampered values, falling back to the default.
 */
export const useStoredState = <T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (value: T) => void] => {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw)
        if (isValid(parsed)) return parsed
      }
    } catch {
      // Unreadable or unavailable: use the default.
    }
    return fallback
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Not persisted; the in-memory value still works.
    }
  }, [key, value])

  return [value, setValue]
}
