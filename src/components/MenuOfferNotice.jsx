// Окна и сообщения для ссылки из письма «Меню ... - разовый доступ».
// Страница меню открывается с ?offer=<исход>:
//   expired  срок предложения истёк: окно с предложением подписки
//   paid     вернулись с оплаты: ждём подтверждения и открываем меню (или просим войти)
//   active   пропуск или подписка уже есть
//   error    не получилось создать платёж
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import { formatPassUntil } from '@/lib/menuPass'
import { getSubscriptionCheckoutLink } from '@/lib/subscriptionCta'
import { toast } from '@/lib/toast'

const root = typeof document !== 'undefined' ? document.body : null

const COPY = {
  expired: {
    title: 'Срок действия предложения истёк',
    text: 'Разовый доступ к этому меню больше недоступен. Смотреть КБЖУ во всех ресторанах можно по подписке',
  },
  error: {
    title: 'Не получилось открыть оплату',
    text: 'Попробуйте нажать кнопку из письма ещё раз. Если не выйдет, оформите подписку',
  },
  login: {
    title: 'Оплата прошла успешно',
    text: 'Для доступа введите код из письма',
  },
}

export default function MenuOfferNotice({ offer, slug, accessToken, hasActiveSub, pass, onDone }) {
  const navigate = useNavigate()
  const [modal, setModal] = useState(null)
  const handledRef = useRef(false)

  useEffect(() => {
    if (!offer || handledRef.current) return
    handledRef.current = true

    if (offer === 'expired' || offer === 'error') {
      setModal(offer)
      return
    }
    if (offer === 'paid') {
      if (!accessToken) { setModal('login'); return }
      toast.info('Оплата прошла, открываем меню')
      pass.waitForActivation().then((status) => {
        if (status) toast.success(`Меню открыто до ${formatPassUntil(status.expiresAt)}`)
        else toast.warning('Оплата прошла, но меню ещё не открылось. Обновите страницу через минуту')
      })
      onDone?.()
      return
    }
    if (offer === 'active' && !hasActiveSub) {
      // пропуск уже действует: покажем до какого времени, когда придёт ответ сервера
      handledRef.current = 'active'
    }
    onDone?.()
  }, [offer, accessToken, hasActiveSub, pass, onDone])

  useEffect(() => {
    if (handledRef.current === 'active' && pass.active) {
      handledRef.current = true
      toast.success(`Доступ к меню открыт до ${formatPassUntil(pass.expiresAt)}`)
    }
  }, [pass.active, pass.expiresAt])

  if (!modal || !root) return null
  const copy = COPY[modal]
  const menuPath = `/restaurants/${encodeURIComponent(slug)}/menu/`
  const close = () => setModal(null)

  const primary = modal === 'login'
    ? {
      label: 'Ввести код',
      go: () => navigate(`/login?next=${encodeURIComponent(`${menuPath}?offer=paid`)}`),
    }
    : {
      label: 'Выбрать подписку',
      go: () => {
        const link = getSubscriptionCheckoutLink(accessToken, menuPath)
        navigate(link.to, { state: link.state })
      },
    }

  return createPortal(
    <div
      className="feedback-modal__backdrop menu-offer-notice__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      onClick={close}
    >
      <div className="feedback-modal" onClick={(event) => event.stopPropagation()}>
        <div className="feedback-modal__header">
          <h4 className="feedback-modal__title">{copy.title}</h4>
          <button type="button" className="feedback-modal__close" aria-label="Закрыть" onClick={close}>
            ×
          </button>
        </div>
        <p className="menu-offer-notice__text">{copy.text}</p>
        <div className="feedback-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={close}>
            Закрыть
          </button>
          <button type="button" className="btn btn--primary" onClick={primary.go}>
            {primary.label}
          </button>
        </div>
      </div>
    </div>,
    root,
  )
}
