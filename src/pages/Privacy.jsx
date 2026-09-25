import PrivacyVersion20260916 from './legal-versions/privacy-2026-09-16.jsx'

// The canonical URL always renders the current published privacy policy.
// Previous policies remain available under /privacy/versions/YYYY-MM-DD.
export default function Privacy() {
  return (
    <div className="privacy-current-version">
      <PrivacyVersion20260916 />
    </div>
  )
}
