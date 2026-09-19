import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { setToken } from '@/store/auth'
import { useSubscriptionStore } from '@/store/subscription'

const PERSONAS = [
  { id: 'free', label: 'Без подписки' },
  { id: 'active', label: 'Активная подписка' },
  { id: 'expired', label: 'Истёкшая' },
  { id: 'canceled', label: 'Отменённая' },
]

const PERSONA_STORAGE_KEY = 'rs_preview_persona'

export default function PreviewPersonaPanel() {
  const navigate = useNavigate()
  const location = useLocation()
  const fetchStatus = useSubscriptionStore((state) => state.fetchStatus)
  const [selectedPersona, setSelectedPersona] = useState(() => {
    try {
      return window.localStorage.getItem(PERSONA_STORAGE_KEY) || ''
    } catch {
      return ''
    }
  })
  const [busyPersona, setBusyPersona] = useState('')
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'robots')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', 'noindex, nofollow, noarchive')
  }, [])

  const activatePersona = async (persona, { reset = false } = {}) => {
    setBusyPersona(reset ? 'reset' : persona)
    setMessage('')

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
      await fetchStatus(payload.access_token)

      if (reset) {
        setMessage('Тестовое состояние восстановлено')
        window.dispatchEvent(new Event('rs-access-update'))
        window.location.reload()
        return
      }

      setMessage('Персона активирована')
      if (!location.pathname.startsWith('/account')) {
        navigate('/account/subscription')
      }
    } catch (error) {
      console.error('Preview persona login failed', error)
      setMessage('Не удалось включить персону')
    } finally {
      setBusyPersona('')
    }
  }

  const resetPersona = () => {
    const persona = selectedPersona || 'free'
    activatePersona(persona, { reset: true })
  }

  return (
    <aside className={`preview-persona-panel${expanded ? ' is-expanded' : ''}`} aria-label="Панель staging-персон">
      <button
        className="preview-persona-panel__toggle"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <strong>STAGING</strong>
        <span>{selectedPersona ? PERSONAS.find((item) => item.id === selectedPersona)?.label : 'Выберите персону'}</span>
        <span aria-hidden="true">{expanded ? '×' : '☰'}</span>
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
