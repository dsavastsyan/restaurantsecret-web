import { useEffect } from 'react'
import logo from '@/assets/anyeat/email-header.png'
import './EmailSubscriptionCheckout.css'

export default function EmailSubscriptionDone() {
  useEffect(() => {
    try { window.sessionStorage.removeItem('rsPayLinkToken') } catch { /* storage may be unavailable */ }
  }, [])

  return (
    <div className="email-checkout">
      <main className="email-checkout__surface">
        <img className="email-checkout__logo" src={logo} alt="AnyEat" />
        <section className="email-checkout__state" role="status">
          <h1>Проверяем оплату</h1>
          <p>Вернись в AnyEat на iPhone. Когда ЮKassa подтвердит платёж или привязку карты, доступ появится в приложении для того же аккаунта.</p>
          <p>Если доступ не появился через несколько минут, напиши в поддержку.</p>
          <a href="mailto:support@restaurantsecret.ru">Написать в поддержку</a>
        </section>
      </main>
    </div>
  )
}
