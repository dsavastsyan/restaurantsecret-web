// Состояние разового пропуска на меню ресторана: узнаём при открытии страницы,
// после оплаты ждём, пока ЮKassa подтвердит платёж (несколько секунд), и закрываем замки,
// когда срок пропуска вышел.
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMenuPass } from '@/lib/menuPass'

const POLL_INTERVAL_MS = 2000
const POLL_ATTEMPTS = 10
const MAX_TIMER_MS = 2 ** 31 - 1
const INACTIVE = { active: false, expiresAt: null }

export function useMenuPass({ slug, token, enabled, onActivated }) {
  const [state, setState] = useState(INACTIVE)
  const onActivatedRef = useRef(onActivated)
  onActivatedRef.current = onActivated
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  useEffect(() => {
    if (!enabled || !slug || !token) {
      setState(INACTIVE)
      return undefined
    }
    let cancelled = false
    fetchMenuPass(slug, token)
      .then((status) => { if (!cancelled) setState(status) })
      .catch(() => { if (!cancelled) setState(INACTIVE) })
    return () => { cancelled = true }
  }, [enabled, slug, token])

  // срок вышел, пока страница открыта: замки возвращаются
  useEffect(() => {
    if (!state.active || !state.expiresAt) return undefined
    const left = new Date(state.expiresAt).getTime() - Date.now()
    if (!Number.isFinite(left)) return undefined
    const id = setTimeout(() => setState(INACTIVE), Math.min(Math.max(left, 0), MAX_TIMER_MS))
    return () => clearTimeout(id)
  }, [state.active, state.expiresAt])

  // после возврата с оплаты: ждём подтверждения платежа и просим страницу перечитать меню
  const waitForActivation = useCallback(async () => {
    if (!slug || !token) return null
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      try {
        const status = await fetchMenuPass(slug, token)
        if (!aliveRef.current) return null
        if (status.active) {
          setState(status)
          onActivatedRef.current?.(status)
          return status
        }
      } catch {
        // сеть моргнула: пробуем ещё раз
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      if (!aliveRef.current) return null
    }
    return null
  }, [slug, token])

  return { active: state.active, expiresAt: state.expiresAt, waitForActivation }
}
