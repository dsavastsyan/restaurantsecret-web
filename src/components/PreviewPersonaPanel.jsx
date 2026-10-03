import React, { useCallback, useEffect, useRef, useState } from 'react'

import { setToken } from '@/store/auth'

const PERSONAS = [
  { id: 'free', label: 'Без подписки' },
  { id: 'active', label: 'Активная подписка' },
  { id: 'expired', label: 'Истёкшая' },
  { id: 'canceled', label: 'Отменённая' },
]

const PERSONA_STORAGE_KEY = 'rs_preview_persona'
const PANEL_EXPANDED_STORAGE_KEY = 'rs_preview_persona_panel_expanded'

export default function PreviewPersonaPanel() {
  const [selectedPersona, setSelectedPersona] = useState(() => {
    try {
      return window.localStorage.getItem(PERSONA_STORAGE_KEY) || ''
    } catch {
      return ''
    }
  })
  const [busyPersona, setBusyPersona] = useState('')
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(() => {
    try {
      return window.localStorage.getItem(PANEL_EXPANDED_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const recoveryInFlight = useRef(false)

  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'robots')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', 'noindex, nofollow, noarchive')
  }, [])

  const activatePersona = useCallback(async (persona, { reset = false, redirect = false, silent = false } = {}) => {
    setBusyPersona(reset ? 'reset' : persona)
    if (!silent) setMessage('')

    try {
      const response = await fetch('/api/preview-login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.access_token) {
        throw new Error(payload?.error || `preview_login_${response.status}`)
      }

      setToken(payload.access_token)
      window.localStorage.setItem(PERSONA_STORAGE_KEY, persona)
      window.localStorage.removeItem('rs_access_state')
      setSelectedPersona(persona)

      if (reset) {
        setMessage('Тестовое состояние восстановлено')
        window.dispatchEvent(new Event('rs-access-update'))
        window.location.reload()
        return
      }

      if (!silent) setMessage('Персона активирована')
      if (redirect) window.location.assign('/account/subscription')
    } catch (error) {
      console.error('Preview persona login failed', error)
      if (!silent) setMessage('Не удалось включить персону')
    } finally {
      setBusyPersona('')
    }
  }, [])

  // A preview can retain a token from a previous deploy or a different
  // staging session. Re-issue the selected test session after a protected API
  // request reports 401, without moving the user away from the current page.
  useEffect(() => {
    const handleAuthRequired = () => {
      if (!selectedPersona || recoveryInFlight.current) return
      recoveryInFlight.current = true
      activatePersona(selectedPersona, { redirect: false, silent: true })
        .finally(() => { recoveryInFlight.current = false })
    }

    window.addEventListener('rs:preview-auth-required', handleAuthRequired)
    return () => window.removeEventListener('rs:preview-auth-required', handleAuthRequired)
  }, [activatePersona, selectedPersona])

  const resetPersona = () => {
    const persona = selectedPersona || 'free'
    activatePersona(persona, { reset: true })
  }

  const toggleExpanded = () => {
    setExpanded((value) => {
      const nextValue = !value
      try {
        window.localStorage.setItem(PANEL_EXPANDED_STORAGE_KEY, String(nextValue))
      } catch {
        // Ignore storage errors in restricted browser contexts.
      }
      return nextValue
    })
  }

  return (
    <aside className={`preview-persona-panel${expanded ? ' is-expanded' : ''}`} aria-label="Панель staging-персон">
      <button
        className="preview-persona-panel__toggle"
        type="button"
        aria-expanded={expanded}
        aria-label={expanded ? 'Свернуть панель staging-персон' : 'Развернуть панель staging-персон'}
        onClick={toggleExpanded}
      >
        <strong>STAGING</strong>
        <span>{selectedPersona ? PERSONAS.find((item) => item.id === selectedPersona)?.label : 'Выберите персону'}</span>
        <span aria-hidden="true">{expanded ? '⌄' : '☰'}</span>
      </button>

      {expanded && (
        <div className="preview-persona-panel__body">
          <p>Тестовый контур · платежи и production-аналитика отключены</p>
          <div className="preview-persona-panel__personas">
            {PERSONAS.map((persona) => (
              <button
                key={persona.id}
                className={selectedPersona === persona.id ? 'is-active' : ''}
                type="button"
                disabled={Boolean(busyPersona)}
                onClick={() => activatePersona(persona.id)}
              >
                {busyPersona === persona.id ? 'Входим…' : persona.label}
              </button>
            ))}
          </div>
          <button
            className="preview-persona-panel__reset"
            type="button"
            disabled={Boolean(busyPersona)}
            onClick={resetPersona}
          >
            {busyPersona === 'reset' ? 'Сбрасываем…' : 'Сбросить тестовые данные'}
          </button>
          {message && <p className="preview-persona-panel__message" role="status">{message}</p>}
        </div>
      )}
    </aside>
  )
}
