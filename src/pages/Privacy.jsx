import PrivacyVersion20261024 from './legal-versions/privacy-2026-10-24.jsx'

// The canonical URL always renders the current published privacy policy.
// Previous policies remain available under /privacy/versions/YYYY-MM-DD.
export default function Privacy() {
  return (
    <div className="privacy-current-version">
      <PrivacyVersion20261024 />
      <section id="legal-archive" className="container legal-container" aria-labelledby="legal-archive-title">
        <h2 id="legal-archive-title">Архив документов</h2>
        <p>Предыдущие редакции политики конфиденциальности:</p>
        <ul className="legal-list">
          <li><a href="/privacy/versions/2026-09-16">16 сентября 2026 года</a></li>
          <li><a href="/privacy/versions/2026-09-03">3 сентября 2026 года</a></li>
          <li><a href="/privacy/versions/2025-11-25">25 ноября 2025 года</a></li>
        </ul>
        <p>Согласие на обработку персональных данных RestaurantSecret и AnyEat:</p>
        <ul className="legal-list">
          <li><a href="/legal/pdn-consent.pdf">Актуальная редакция (PDF)</a></li>
          <li><a href="/legal/versions/pdn-consent-2026-10-24.pdf">Редакция от 24 октября 2026 года (PDF)</a></li>
          <li><a href="/legal/archive/pdn-consent-before-2026-10-24.pdf">Предыдущая редакция, действовавшая до 24 октября 2026 года (PDF)</a></li>
        </ul>
      </section>
    </div>
  )
}
