// Confirmation page displayed after a payment is completed. Allows users to
// re-validate access from the API.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { PD_API_BASE } from '@/config/api'
import { useAuth } from '@/store/auth'
import { analytics } from '@/services/analytics'
import { showSubscriptionError, showSubscriptionPending, showSubscriptionSuccess } from '@/lib/subscriptionFeedback'
import { forgetSubscriptionReturnTo, readSubscriptionReturnTo } from '@/lib/subscriptionCta'

const queryErrors = {
  no_id: 'Платёж не найден. Попробуйте оформить подписку ещё раз.',
  mock_error: 'Не удалось подтвердить оплату. Попробуйте проверить доступ немного позже.'
}

// Format ISO strings in the locale we target (ru-RU).
function formatDate(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'long',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch (err) {
    console.warn('Failed to format date', err)
    return value
  }
}

export default function PaySuccess() {
  const outlet = useOutletContext() ?? {}
  const access = outlet.access ?? {}
  const onAccessUpdate = outlet.handleAccessUpdate
  const accessToken = useAuth((state) => state.accessToken)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const [expiresAt, setExpiresAt] = useState(access?.expiresAt ?? null)
  const refreshAccessRef = useRef(null)

  // Landing here proves that the provider redirected the browser back, but it
  // does not prove that YooKassa's webhook has activated the subscription.
  useEffect(() => {
    const plan = sessionStorage.getItem("rs_checkout_plan") || "unknown";
    const paymentId = searchParams.get("payment_id") || sessionStorage.getItem("rs_checkout_payment_id") || null;
    analytics.track("payment_returned", {
      payment_id: paymentId,
      plan,
      return_status: searchParams.get("status") || "not_provided",
      return_path: window.location.pathname,
    });
  }, []);

  // Keep the local expiration date in sync with context updates.
  useEffect(() => {
    setExpiresAt(access?.expiresAt ?? null)
  }, [access?.expiresAt])

  // Surface any error codes forwarded from the payment provider redirect.
  const queryMessage = useMemo(() => {
    const code = searchParams.get('e')
    if (!code) return ''
    return queryErrors[code] ?? 'Не удалось обработать параметры платежа. Пожалуйста, проверьте подписку.'
  }, [searchParams])

  // Manual re-check against the backend. This duplicates the logic used in
  // AppShell but keeps the flow explicit on this screen.
  const refreshAccess = useCallback(async () => {
    setLoading(true)
    setStatus('loading')
    setMessage('')
    try {
      if (!accessToken) {
        setStatus('idle')
        setMessage('Войдите в аккаунт, чтобы подтвердить подписку.')
        return
      }
      const response = await fetch(`${PD_API_BASE}/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`Ошибка ${response.status}. Попробуйте позже.`)
      }

      const me = await response.json()
      const detail = {
        ok: me?.ok ?? true,
        isActive: Boolean(me?.isActive),
        expiresAt: me?.expiresAt ?? null
      }

      onAccessUpdate?.(detail)

      if (!detail.ok && !detail.isActive) {
        setStatus('error')
        setMessage('Не удалось подтвердить подписку. Попробуйте позже.')
        setExpiresAt(detail.expiresAt)
        return
      }

      if (detail.isActive) {
        setStatus('success')
        setExpiresAt(detail.expiresAt)
        setMessage('Доступ подтверждён.')

        const returnTo = readSubscriptionReturnTo()
        if (returnTo) forgetSubscriptionReturnTo()
        showSubscriptionSuccess({
          onContinue: () => {
            if (returnTo) navigate(returnTo, { replace: true })
          },
        })
        if (returnTo) navigate(returnTo, { replace: true })

        // Analytics — read plan stored before payment redirect
        const plan = sessionStorage.getItem("rs_checkout_plan") || "unknown";
        const paymentId = sessionStorage.getItem("rs_checkout_payment_id") || null;
        sessionStorage.removeItem("rs_checkout_plan");
        sessionStorage.removeItem("rs_checkout_payment_id");
        analytics.track("subscription_activated", { plan });
        analytics.track("payment_access_confirmed", { payment_id: paymentId, plan });
      } else {
        setStatus('inactive')
        setExpiresAt(detail.expiresAt)
        setMessage('Подписка пока не активна. Попробуйте повторить проверку позже.')
        showSubscriptionPending(() => {
          void refreshAccessRef.current?.()
        })
      }
    } catch (err) {
      console.error('Failed to refresh access', err)
      setStatus('error')
      setMessage(err?.message ?? 'Не удалось проверить доступ. Попробуйте позже.')
      showSubscriptionError(
        () => {
          void refreshAccessRef.current?.()
        },
        () => {
          void refreshAccessRef.current?.()
        },
      )
    } finally {
      setLoading(false)
    }
  }, [accessToken, navigate, onAccessUpdate])
  refreshAccessRef.current = refreshAccess;

  useEffect(() => {
    void refreshAccess()
  }, [refreshAccess])

  return (
    <div className="page">
      <h1>Оплата прошла успешно</h1>
      <p>Если вы уже завершили оплату, подтвердите подписку, чтобы снять ограничения и получить доступ к каталогу.</p>
      {queryMessage && <p className="err" role="alert">{queryMessage}</p>}
      {message && (
        <p className={status === 'error' ? 'err' : 'muted'} role={status === 'error' ? 'alert' : undefined}>
          {message}
        </p>
      )}
      {expiresAt && status === 'success' && (
        <p className="muted">Доступ активен до {formatDate(expiresAt)}.</p>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={refreshAccess} disabled={loading}>
          {loading ? 'Проверяем…' : 'Проверить доступ'}
        </button>
        <Link to="/" className="link">Вернуться на главную</Link>
      </div>
    </div>
  )
}
