import { useEffect, useState } from 'react'
import { PD_API_BASE } from '@/config/api'
import logo from '@/assets/anyeat/email-header.png'
import './EmailSubscriptionCheckout.css'

const plans = [
  { id: 'monthly', name: 'Месяц', cadence: 'в месяц' },
  { id: 'annual', name: 'Год', cadence: 'в год' },
]

async function payLinkRequest(path, token, plan, signal) {
  const response = await fetch(`${PD_API_BASE}/api/pay-link/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...(plan ? { plan } : {}) }),
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || 'request_failed')
    error.status = response.status
    throw error
  }
  return body
}

export default function EmailSubscriptionCheckout() {
  const [token] = useState(() => {
    if (window.__rsPayLinkToken) {
      const payLinkToken = window.__rsPayLinkToken
      delete window.__rsPayLinkToken
      return payLinkToken
    }
    try { return window.sessionStorage.getItem('rsPayLinkToken') } catch { return null }
  })
  const [state, setState] = useState({ status: 'loading' })
  const [pendingPlan, setPendingPlan] = useState(null)
  const [paymentError, setPaymentError] = useState('')

  useEffect(() => {
    document.title = 'Оформить подписку — AnyEat'
    const referrer = document.createElement('meta')
    referrer.name = 'referrer'
    referrer.content = 'no-referrer'
    document.head.append(referrer)
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.append(robots)
    return () => { referrer.remove(); robots.remove() }
  }, [])

  useEffect(() => {
    if (!token || token.length < 20 || token.length > 1024) {
      setState({ status: 'invalid' })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    payLinkRequest('info', token, null, controller.signal)
      .then((info) => setState({ status: 'ready', info }))
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({ status: error.status === 401 ? 'invalid' : 'error' })
      })
    return () => controller.abort()
  }, [token])

  async function choosePlan(plan) {
    if (pendingPlan || state.status !== 'ready') return
    setPendingPlan(plan)
    setPaymentError('')
    try {
      const result = await payLinkRequest('create', token, plan)
      const destination = new URL(result.confirmation_url)
      if (destination.protocol !== 'https:') throw new Error('invalid_payment_url')
      window.location.assign(destination.href)
    } catch (error) {
      if (error.status === 409) {
        setState((current) => ({ ...current, info: { ...current.info, has_active_subscription: true } }))
      } else if (error.status === 401) {
        setState({ status: 'invalid' })
      } else if (error.status === 429) {
        setPaymentError('Слишком много попыток. Подожди несколько минут и попробуй снова.')
      } else {
        setPaymentError('Не удалось открыть ЮKassa. Попробуй ещё раз или напиши в поддержку.')
      }
      setPendingPlan(null)
    }
  }

  const info = state.info
  const trial = info?.trial_available

  return (
    <div className="email-checkout">
      <main className="email-checkout__surface">
        <img className="email-checkout__logo" src={logo} alt="AnyEat" />

        {state.status === 'loading' && <p className="email-checkout__state" role="status">Загружаем тарифы…</p>}
        {state.status === 'invalid' && (
          <section className="email-checkout__state" role="alert">
            <h1>Ссылка больше не работает</h1>
            <p>Она могла истечь. Напиши в поддержку, и мы поможем оформить подписку.</p>
            <a href="mailto:support@restaurantsecret.ru">Написать в поддержку</a>
          </section>
        )}
        {state.status === 'error' && (
          <section className="email-checkout__state" role="alert">
            <h1>Не удалось загрузить тарифы</h1>
            <p>Проверь подключение и обнови страницу. Если ошибка повторится, напиши в поддержку.</p>
          </section>
        )}

        {state.status === 'ready' && (
          <>
            <div className="email-checkout__account">
              <span>Подписка для</span>
              <strong>{info.email}</strong>
            </div>

            {info.has_active_subscription ? (
              <section className="email-checkout__state" role="status">
                <h1>Подписка уже активна</h1>
                <p>Доступ открыт для указанного аккаунта. Войди в AnyEat на iPhone с этой же почтой.</p>
              </section>
            ) : (
              <>
                <h1 className="email-checkout__heading">Выбери подписку</h1>
                {trial && <p className="email-checkout__trial">Первые 7 дней бесплатно</p>}
                <div className="email-checkout__plans" aria-label="Варианты подписки">
                  {plans.map((plan) => (
                    <button
                      className="email-checkout__plan"
                      type="button"
                      key={plan.id}
                      disabled={Boolean(pendingPlan)}
                      onClick={() => choosePlan(plan.id)}
                    >
                      <span className="email-checkout__plan-name">{plan.name}</span>
                      <span className="email-checkout__plan-price">
                        {Number(info.prices[plan.id]).toLocaleString('ru-RU')} ₽ <small>{plan.cadence}</small>
                      </span>
                      <span className="email-checkout__plan-action">
                        {pendingPlan === plan.id ? 'Открываем ЮKassa…' : 'Продолжить в ЮKassa'}
                        <span aria-hidden="true">↗</span>
                      </span>
                    </button>
                  ))}
                </div>
                {paymentError && <p className="email-checkout__error" role="alert">{paymentError}</p>}
                <p className="email-checkout__terms">
                  Оформляя подписку, вы соглашаетесь на автоматические списания по выбранному тарифу.{' '}
                  {trial
                    ? 'Первые 7 дней бесплатны. Для проверки карты ЮKassa спишет 1 ₽ и вернёт его. Первое списание по тарифу — после пробного периода.'
                    : 'Первое списание по тарифу — сейчас.'}{' '}
                  Подписку можно отменить в личном кабинете на сайте.{' '}
                  <a href="/legal" target="_blank" rel="noopener noreferrer">Условия подписки</a>.
                </p>
                <p className="email-checkout__footnote">Подписка будет работать и на сайте, и в приложении AnyEat на iPhone.</p>
              </>
            )}
          </>
        )}
        <footer className="email-checkout__footer">
          <a href="mailto:support@restaurantsecret.ru">Поддержка</a>
        </footer>
      </main>
    </div>
  )
}
