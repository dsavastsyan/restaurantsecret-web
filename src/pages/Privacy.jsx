import PrivacyVersion20251125 from './legal-versions/privacy-2025-11-25.jsx'

// The canonical URL has been restored to the first published version.
// The 2026-09-03 policy remains available under /privacy/versions/2026-09-03.
export default function Privacy() {
  return (
    <div className="privacy-current-version">
      <PrivacyVersion20251125 />
    </div>
  )
}
